# 分析过程流式输出 UX 优化设计

> 日期: 2026-02-16
> 状态: 已确认
> 前置文档: [2026-02-13-bazi-analysis-architecture-redesign.md](./2026-02-13-bazi-analysis-architecture-redesign.md)
> 范围: deepAnalysis 流式 yield + 分析卡片组件 + 典籍查阅子卡片

---

## 1. 背景与问题

当前 `deepAnalysis` 工具调用分析 Agent 时，用户体验存在明显问题：

- 分析 Agent 通过 `generateText` 同步调用 DeepSeek，整个过程对用户是"黑盒等待"
- 没有进度反馈，没有中间输出，只能等分析完成后对话 Agent 才开始流式响应
- 分析 Agent 内部查阅典籍（queryClassics）的过程对前端完全不可见

## 2. 优化目标

1. 分析过程中的文字流式输出到聊天流中的**独立分析卡片**
2. 典籍查阅以**嵌套子卡片**形式实时呈现在分析卡片内
3. 分析完成后卡片**自动折叠为摘要**，不影响对话 Agent 的"铁口直断"解读

## 3. 技术方案

采用 AI SDK 6.x 的 `async *execute` 生成器工具能力。deepAnalysis 的 execute 函数改为 async generator，通过 yield 推送中间状态快照，前端通过 `part.state` 变化实时更新 UI。

---

## 4. 数据流架构

```
deepAnalysis.execute 被触发
  │
  ├─ yield { phase: 'started' }
  │   → 前端渲染分析卡片骨架
  │
  ├─ 分析 Agent 内部调用 streamText（替代 generateText）
  │   │
  │   ├─ fullStream text-delta：每积累一定量文本（150ms 节流）
  │   │   → yield { phase: 'analyzing', partialText: '...' }
  │   │      → 前端实时更新分析文字
  │   │
  │   ├─ fullStream tool-call：分析 Agent 触发 queryClassics
  │   │   → yield { phase: 'querying', query: '甲木寅月', source: '穷通宝鉴' }
  │   │      → 前端渲染「正在查阅」子卡片
  │   │
  │   ├─ fullStream tool-result：queryClassics 返回结果
  │   │   → yield { phase: 'queried', classicResults: [...] }
  │   │      → 前端子卡片显示经典原文摘录
  │   │
  │   └─ 分析 Agent 继续生成文字...（循环）
  │
  └─ yield { phase: 'complete', analysisNote: updatedNote }
      → 前端卡片折叠为摘要
      → analysisNote 写入 IndexedDB
```

---

## 5. 类型定义

### 5.1 分析事件（analysis-agent 内部）

```typescript
// lib/bazi/types.ts

interface ClassicQueryResult {
  query: string
  source: string        // '穷通宝鉴' | '子平真诠' | ...
  chapter: string
  content: string       // 经典原文摘录
  score: number
}

type AnalysisEvent =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'tool-call'; query: string; source: string }
  | { type: 'tool-result'; results: ClassicQueryResult[] }
  | { type: 'finish'; entry: AnalysisEntry }
```

### 5.2 分析进度快照（yield 给前端）

```typescript
// lib/bazi/types.ts

interface AnalysisProgress {
  phase: 'started' | 'analyzing' | 'querying' | 'queried' | 'complete'

  // phase=analyzing 时：分析 Agent 已产出的文字（累积式）
  partialText?: string

  // phase=querying 时：正在查什么、查哪本
  query?: string
  source?: string

  // phase=queried 时：查阅返回的结果
  classicResults?: ClassicQueryResult[]

  // phase=complete 时：最终完整结果
  analysisNote?: AnalysisNote

  // 所有阶段：已完成的典籍查阅历史（用于子卡片持久显示）
  classicQueries?: Array<{
    query: string
    source: string
    results: ClassicQueryResult[]
  }>
}
```

---

## 6. 后端改造

### 6.1 分析 Agent（lib/bazi/analysis-agent.ts）

将 `runAnalysis` 从 `generateText` 改为 `streamText`，新增 `runAnalysisStream` 返回 AsyncGenerator：

```typescript
async function* runAnalysisStream(
  params: AnalyzeParams
): AsyncGenerator<AnalysisEvent> {
  const userContent = buildUserPrompt(params)

  const result = streamText({
    model: deepseek('deepseek-chat'),
    system: ANALYSIS_SYSTEM_PROMPT,
    prompt: userContent,
    tools: { queryClassics: queryClassicsTool },
    stopWhen: stepCountIs(5),
  })

  let fullText = ''

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        fullText += part.textDelta
        yield { type: 'text-delta', textDelta: part.textDelta }
        break
      case 'tool-call':
        yield { type: 'tool-call', query: part.args.query, source: part.args.source }
        break
      case 'tool-result':
        yield { type: 'tool-result', results: part.result }
        break
    }
  }

  yield {
    type: 'finish',
    entry: {
      question: params.question,
      content: fullText,
      references: extractReferences(fullText),
      createdAt: Date.now(),
    },
  }
}
```

保留原 `runAnalysis` 函数供单测或非流式场景使用。

### 6.2 deepAnalysis 工具（app/api/chat/route.ts）

从 `async execute` 改为 `async *execute`，消费 `runAnalysisStream` 并带节流 yield：

```typescript
const deepAnalysis = tool({
  description: '对命盘做专业分析。排盘后必须立即调用(不传 question)做综合分析;用户追问时传入具体问题做补充分析。',
  inputSchema: z.object({
    question: z.string().optional().describe('需要分析的具体问题,首次综合分析时不传'),
  }),
  async *execute({ question }) {
    if (!currentNote?.rawData) {
      yield { phase: 'complete', error: '尚未排盘，请先调用 analyzeBazi' }
      return
    }

    const { fiveElements, ...dataForAnalysis } = currentNote.rawData

    yield { phase: 'started' } as AnalysisProgress

    let partialText = ''
    const classicQueries: AnalysisProgress['classicQueries'] = []
    let currentQuery: { query: string; source: string } | null = null
    let lastYieldTime = 0
    const THROTTLE_MS = 150

    for await (const event of runAnalysisStream({
      rawData: dataForAnalysis,
      previousNote: currentNote,
      question: question ?? null,
    })) {
      switch (event.type) {
        case 'text-delta':
          partialText += event.textDelta
          const now = Date.now()
          if (now - lastYieldTime > THROTTLE_MS) {
            yield { phase: 'analyzing', partialText, classicQueries }
            lastYieldTime = now
          }
          break

        case 'tool-call':
          currentQuery = { query: event.query, source: event.source }
          yield { phase: 'querying', query: event.query, source: event.source, partialText, classicQueries }
          break

        case 'tool-result':
          classicQueries.push({
            query: currentQuery!.query,
            source: currentQuery!.source,
            results: event.results,
          })
          yield { phase: 'queried', classicResults: event.results, partialText, classicQueries }
          currentQuery = null
          break

        case 'finish':
          currentNote = {
            ...currentNote!,
            analyses: [...currentNote!.analyses, event.entry],
            updatedAt: Date.now(),
          }
          yield { phase: 'complete', analysisNote: currentNote, partialText, classicQueries }
          break
      }
    }
  },
})
```

---

## 7. 前端分析卡片

### 7.1 卡片结构

```
┌─ AnalysisCard ──────────────────────────────┐
│                                              │
│  ⏳ 命盘深入分析                    [折叠 ▾]  │
│                                              │
│  ┌─ 分析文字区 ───────────────────────────┐  │
│  │  日主甲木生于寅月，得令而旺...          │  │
│  │  （流式更新，Markdown 渲染）            │  │
│  │  █ ← 光标闪烁                          │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ 典籍子卡片 ──────────────────────────┐   │
│  │  📖 查阅《穷通宝鉴·甲木寅月》          │   │
│  │  ▸ "甲木寅月，初春尚有余寒..."  [展开]  │   │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ 典籍子卡片 ──────────────────────────┐   │
│  │  🔍 正在查阅《滴天髓》...              │   │
│  │   shimmer 加载动画                      │   │
│  └────────────────────────────────────────┘  │
│                                              │
└──────────────────────────────────────────────┘

        ↓ 分析完成后自动折叠为 ↓

┌─ AnalysisCard (collapsed) ──────────────────┐
│  ✅ 分析完成 · 引用 3 部典籍      [展开 ▸]  │
└──────────────────────────────────────────────┘
```

### 7.2 组件状态映射

| part.state | phase | 渲染 |
|---|---|---|
| `partial-output-available` | `started` | 骨架 + shimmer |
| `partial-output-available` | `analyzing` | 流式文字 |
| `partial-output-available` | `querying` | 文字 + 查阅中子卡片 |
| `partial-output-available` | `queried` | 文字 + 查阅完成子卡片 |
| `output-available` | `complete` | 折叠摘要 |

### 7.3 渲染路由（chat-message.tsx）

```tsx
case 'tool-deepAnalysis':
  return <AnalysisCard progress={part.output} state={part.state} />
```

### 7.4 新增文件

`components/chat/analysis-card.tsx` — 分析进度卡片 + 典籍子卡片组件。

---

## 8. yield 节流策略

| 事件 | 策略 | 理由 |
|---|---|---|
| `text-delta` | 150ms 节流 | 逐 token yield 网络开销大，150ms 对应流畅打字感 |
| `tool-call` | 立即 yield | 用户关心的关键节点，需即时反馈 |
| `tool-result` | 立即 yield | 查阅完成需即时展示 |
| `finish` | 立即 yield | 最终结果，触发折叠和持久化 |

---

## 9. 改动文件清单

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `lib/bazi/types.ts` | 新增类型 | `AnalysisProgress`、`AnalysisEvent`、`ClassicQueryResult` |
| `lib/bazi/analysis-agent.ts` | 重构 | 新增 `runAnalysisStream`（`generateText` → `streamText` + `fullStream`），保留原 `runAnalysis` |
| `app/api/chat/route.ts` | 改造 | `deepAnalysis.execute` → `async *execute`，消费 stream 并 yield |
| `components/chat/analysis-card.tsx` | **新增** | 分析进度卡片 + 典籍子卡片 |
| `components/chat/chat-message.tsx` | 修改 | `tool-deepAnalysis` 路由到 `AnalysisCard` |

**不改动：**
- `analyzeBazi` 工具 — 纯计算，不涉及分析
- `hooks/use-chat-session.ts` — analysisNote 同步逻辑不变，从 `phase=complete` 的数据中提取
- `lib/bazi/classics.ts` — 检索逻辑不变

---

## 10. 与现有架构的关系

本方案是对 [2026-02-13 架构重设计](./2026-02-13-bazi-analysis-architecture-redesign.md) 的 UX 增强，不改变双 Agent 架构的核心设计。主要变化：

| 维度 | 原设计 | 本方案 |
|---|---|---|
| 分析 Agent 调用方式 | `generateText`（同步阻塞） | `streamText` + `fullStream`（流式） |
| deepAnalysis 工具返回 | 单次返回完整结果 | `async *execute` yield 多次中间状态 |
| 前端分析过程可见性 | 仅工具完成后可见 | 实时可见分析文字和典籍查阅 |
| queryClassics 可见性 | 对前端完全不可见 | 通过 yield 暴露为子卡片 |
