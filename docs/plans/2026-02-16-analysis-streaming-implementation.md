# 分析过程流式输出 - 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 deepAnalysis 工具执行期间，分析文字流式输出到独立卡片，典籍查阅以子卡片呈现，完成后自动折叠。

**Architecture:** 分析 Agent 从 `generateText` 改为 `streamText`，通过 `fullStream` 暴露为 AsyncGenerator。`deepAnalysis` 工具用 `async *execute` 消费流并 yield `AnalysisProgress` 快照。前端新增 `AnalysisCard` 组件渲染中间状态。

**Tech Stack:** Vercel AI SDK 6.x (`async *execute`, `streamText`, `fullStream`), React, Tailwind CSS, shadcn/ui

---

## Task 1: 新增类型定义

**Files:**
- Modify: `lib/bazi/types.ts:85-97`
- Test: `lib/bazi/__tests__/types.test.ts`

**Step 1: Write the failing test**

在 `lib/bazi/__tests__/types.test.ts` 末尾追加：

```typescript
import type { AnalysisProgress, AnalysisEvent, ClassicQueryResult } from '../types'

describe('analysis streaming types', () => {
  it('should allow creating a valid ClassicQueryResult', () => {
    const result: ClassicQueryResult = {
      query: '甲木寅月',
      source: '穷通宝鉴',
      chapter: '甲木寅月',
      content: '甲木寅月，初春尚有余寒...',
      score: 0.85,
    }
    expect(result.score).toBeGreaterThan(0)
  })

  it('should allow creating AnalysisProgress in each phase', () => {
    const started: AnalysisProgress = { phase: 'started' }
    expect(started.phase).toBe('started')

    const analyzing: AnalysisProgress = {
      phase: 'analyzing',
      partialText: '日主甲木...',
      classicQueries: [],
    }
    expect(analyzing.partialText).toBeDefined()

    const querying: AnalysisProgress = {
      phase: 'querying',
      query: '甲木寅月',
      source: '穷通宝鉴',
      partialText: '日主甲木...',
      classicQueries: [],
    }
    expect(querying.query).toBe('甲木寅月')
  })

  it('should allow creating AnalysisEvent variants', () => {
    const textDelta: AnalysisEvent = { type: 'text-delta', textDelta: '日主' }
    expect(textDelta.type).toBe('text-delta')

    const toolCall: AnalysisEvent = { type: 'tool-call', query: '甲木寅月', source: '穷通宝鉴' }
    expect(toolCall.type).toBe('tool-call')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bazi/__tests__/types.test.ts`
Expected: FAIL — `ClassicQueryResult`, `AnalysisProgress`, `AnalysisEvent` not exported from `../types`

**Step 3: Write implementation**

在 `lib/bazi/types.ts` 末尾追加：

```typescript
// --- Analysis streaming types ---

export interface ClassicQueryResult {
  query: string
  source: string
  chapter: string
  content: string
  score: number
}

export type AnalysisEvent =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'tool-call'; query: string; source: string }
  | { type: 'tool-result'; results: ClassicQueryResult[] }
  | { type: 'finish'; entry: AnalysisEntry }

export interface AnalysisProgress {
  phase: 'started' | 'analyzing' | 'querying' | 'queried' | 'complete'
  partialText?: string
  query?: string
  source?: string
  classicResults?: ClassicQueryResult[]
  analysisNote?: AnalysisNote
  classicQueries?: Array<{
    query: string
    source: string
    results: ClassicQueryResult[]
  }>
  error?: string
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run lib/bazi/__tests__/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/bazi/types.ts lib/bazi/__tests__/types.test.ts
git commit -m "feat(bazi): add AnalysisProgress and AnalysisEvent streaming types"
```

---

## Task 2: 分析 Agent 流式化 — runAnalysisStream

**Files:**
- Modify: `lib/bazi/analysis-agent.ts`
- Test: `lib/bazi/__tests__/analysis-agent-stream.test.ts` (新建)

**Step 1: Write the failing test**

新建 `lib/bazi/__tests__/analysis-agent-stream.test.ts`：

```typescript
import type { AnalysisEvent } from '../types'
import { describe, expect, it } from 'vitest'

describe('runAnalysisStream', () => {
  it('should be exported as an async generator function', async () => {
    const { runAnalysisStream } = await import('../analysis-agent')
    expect(typeof runAnalysisStream).toBe('function')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bazi/__tests__/analysis-agent-stream.test.ts`
Expected: FAIL — `runAnalysisStream` not exported

**Step 3: Write implementation**

在 `lib/bazi/analysis-agent.ts` 中：

1. 新增 import：
```typescript
import type { AnalysisEvent, ClassicQueryResult } from './types'
import { streamText, ... } from 'ai'  // 追加 streamText
```

2. 新增 `runAnalysisStream` 函数（保留原 `runAnalysis` 不动）：

```typescript
export async function* runAnalysisStream({ rawData, previousNote, question }: AnalyzeParams): AsyncGenerator<AnalysisEvent> {
  const userContent = buildUserPrompt({ rawData, previousNote, question })

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
        if (part.toolName === 'queryClassics') {
          yield {
            type: 'tool-call',
            query: (part.args as { query: string }).query,
            source: (part.args as { source?: string }).source ?? 'all',
          }
        }
        break
      case 'tool-result':
        if (part.toolName === 'queryClassics') {
          yield {
            type: 'tool-result',
            results: part.result as ClassicQueryResult[],
          }
        }
        break
    }
  }

  yield {
    type: 'finish',
    entry: {
      question,
      content: fullText,
      references: extractReferences(fullText),
      createdAt: Date.now(),
    },
  }
}
```

3. 更新 exports：
```typescript
export { ..., runAnalysisStream }
```

注意：`queryClassicsTool` 当前定义在 `runAnalysis` 函数内部。需要将其提取为模块级变量，供两个函数共用。

**Step 4: Run test to verify it passes**

Run: `npx vitest run lib/bazi/__tests__/analysis-agent-stream.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/bazi/analysis-agent.ts lib/bazi/__tests__/analysis-agent-stream.test.ts
git commit -m "feat(bazi): add runAnalysisStream async generator for streaming analysis"
```

---

## Task 3: deepAnalysis 工具改造为 async *execute

**Files:**
- Modify: `app/api/chat/route.ts:140-171`

**Step 1: Add import**

在 `app/api/chat/route.ts` 顶部追加：
```typescript
import type { AnalysisProgress } from '@/lib/bazi/types'
import { runAnalysisStream } from '@/lib/bazi/analysis-agent'
```

如果 `runAnalysis` 不再被使用，移除其 import。

**Step 2: Rewrite deepAnalysis tool**

将 `deepAnalysis` 的 `execute: async ({ question }) => { ... }` 改为 `async *execute({ question })`:

```typescript
const deepAnalysis = tool({
  description: '对命盘做专业分析。排盘后必须立即调用(不传 question)做综合分析;用户追问时传入具体问题做补充分析。',
  inputSchema: z.object({
    question: z.string().optional().describe('需要分析的具体问题,首次综合分析时不传'),
  }),
  async *execute({ question }) {
    if (!currentNote?.rawData) {
      return { phase: 'complete', error: '尚未排盘，请先调用 analyzeBazi' } as AnalysisProgress
    }

    const { fiveElements, ...dataForAnalysis } = currentNote.rawData

    yield { phase: 'started' } as AnalysisProgress

    let partialText = ''
    const classicQueries: NonNullable<AnalysisProgress['classicQueries']> = []
    let currentQuery: { query: string; source: string } | null = null
    let lastYieldTime = 0
    const THROTTLE_MS = 150

    try {
      for await (const event of runAnalysisStream({
        rawData: dataForAnalysis,
        previousNote: currentNote,
        question: question ?? null,
      })) {
        switch (event.type) {
          case 'text-delta':
            partialText += event.textDelta
            if (Date.now() - lastYieldTime > THROTTLE_MS) {
              yield { phase: 'analyzing', partialText, classicQueries } as AnalysisProgress
              lastYieldTime = Date.now()
            }
            break

          case 'tool-call':
            currentQuery = { query: event.query, source: event.source }
            yield { phase: 'querying', query: event.query, source: event.source, partialText, classicQueries } as AnalysisProgress
            break

          case 'tool-result':
            if (currentQuery) {
              classicQueries.push({ query: currentQuery.query, source: currentQuery.source, results: event.results })
            }
            yield { phase: 'queried', classicResults: event.results, partialText, classicQueries } as AnalysisProgress
            currentQuery = null
            break

          case 'finish':
            currentNote = {
              ...currentNote!,
              analyses: [...currentNote!.analyses, event.entry],
              updatedAt: Date.now(),
            }
            yield { phase: 'complete', analysisNote: currentNote, partialText, classicQueries } as AnalysisProgress
            break
        }
      }
    }
    catch (error) {
      yield { phase: 'complete', error: error instanceof Error ? error.message : '分析失败' } as AnalysisProgress
    }
  },
})
```

**Step 3: Verify build**

Run: `npx next build`
Expected: 编译成功（类型检查通过）

**Step 4: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(chat): convert deepAnalysis to async *execute with streaming yields"
```

---

## Task 4: 调整 analysisNote 同步逻辑

**Files:**
- Modify: `hooks/use-chat-session.ts:80-111`

**Context:** 当前 `syncAnalysisNote` 只在 `part.state === 'output-available'` 时提取 `analysisNote`。改为 `async *execute` 后，中间 yield 的状态 `part.state` 为 `'partial-output-available'`，最终 yield 为 `'output-available'`。现有逻辑只匹配 `output-available`，所以**同步逻辑本身不需要改**。

但需要确认一点：`part.output` 在 `output-available` 时，是否是最后一次 yield 的值。根据 AI SDK 文档，`async *execute` 的最后一个 yield 值就是工具最终 output。所以现有逻辑兼容。

**Step 1: 验证兼容性**

检查 `hooks/use-chat-session.ts:96-97`，确认条件是 `part.state === 'output-available'` 且读取 `output.analysisNote`。最后一次 yield 的 `{ phase: 'complete', analysisNote: ... }` 正好满足。

**不需要改动，但需要确认 `sanitizeMessages` 函数。**

**Step 2: 修改 sanitizeMessages**

当前 `sanitizeMessages` 过滤掉所有非 `output-available` 的 tool parts。需要保留 `partial-output-available` 的 deepAnalysis parts，否则页面刷新后中间状态的卡片会丢失。

但实际上，页面刷新后从 IndexedDB 加载的消息中，`deepAnalysis` 的 tool part state 应该已经是 `output-available`（因为只有完成后的消息才会被持久化到 IndexedDB）。所以 **sanitizeMessages 也不需要改动**。

**Step 3: Commit**

无需 commit，此 Task 确认兼容性即可。

---

## Task 5: 新增 AnalysisCard 组件

**Files:**
- Create: `components/chat/analysis-card.tsx`

**Step 1: Create component**

```tsx
'use client'

import type { AnalysisProgress, ClassicQueryResult } from '@/lib/bazi/types'
import { BookOpenIcon, CheckCircleIcon, ChevronDownIcon, LoaderIcon, SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { MessageResponse } from '@/components/ai-elements/message'

interface AnalysisCardProps {
  progress: AnalysisProgress
  state: string // part.state from AI SDK
}

function ClassicSubCard({ query, source, results, isLoading }: {
  query: string
  source: string
  results?: ClassicQueryResult[]
  isLoading?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-muted bg-muted/30">
      <CollapsibleTrigger className="flex w-full items-center gap-2 p-2 text-xs">
        {isLoading
          ? <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
          : <BookOpenIcon className="size-3.5 text-muted-foreground" />}
        <span className="flex-1 text-left">
          {isLoading ? `正在查阅《${source}》...` : `查阅《${source}》`}
        </span>
        {!isLoading && results && (
          <Badge variant="secondary" className="text-[10px]">{results.length} 条</Badge>
        )}
        {!isLoading && (
          <ChevronDownIcon className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        )}
      </CollapsibleTrigger>
      {!isLoading && results && (
        <CollapsibleContent className="border-t border-muted px-3 py-2 text-xs text-muted-foreground space-y-2">
          <div className="text-[10px] text-muted-foreground/60">查询: {query}</div>
          {results.map((r, i) => (
            <blockquote key={i} className="border-l-2 border-primary/30 pl-2">
              <div className="font-medium text-foreground/80">{r.source} · {r.chapter}</div>
              <div className="mt-0.5 line-clamp-3">{r.content}</div>
            </blockquote>
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export function AnalysisCard({ progress, state }: AnalysisCardProps) {
  const isComplete = state === 'output-available' || progress.phase === 'complete'
  const [collapsed, setCollapsed] = useState(false)

  // Auto-collapse when complete (only on transition)
  const shouldCollapse = isComplete && !progress.error

  const classicCount = progress.classicQueries?.length ?? 0
  const summaryText = progress.error
    ? `分析失败: ${progress.error}`
    : `分析完成 · 引用 ${classicCount} 部典籍`

  if (shouldCollapse && !collapsed) {
    // Will be collapsed on next render via state
  }

  return (
    <Collapsible
      open={shouldCollapse ? !collapsed : true}
      onOpenChange={(open) => { if (shouldCollapse) setCollapsed(!open) }}
      className="not-prose mb-4 w-full rounded-md border"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 p-3">
        <div className="flex items-center gap-2">
          {isComplete
            ? <CheckCircleIcon className="size-4 text-green-600" />
            : <SearchIcon className="size-4 animate-pulse text-primary" />}
          <span className="font-medium text-sm">
            {isComplete ? summaryText : '命盘深入分析'}
          </span>
          {!isComplete && progress.phase !== 'started' && (
            <Badge variant="secondary" className="text-xs">分析中</Badge>
          )}
        </div>
        {isComplete && (
          <ChevronDownIcon className={cn(
            'size-4 text-muted-foreground transition-transform',
            !collapsed && 'rotate-180',
          )} />
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 border-t px-4 py-3">
        {/* Streaming analysis text */}
        {progress.partialText && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MessageResponse>{progress.partialText}</MessageResponse>
            {!isComplete && <span className="inline-block h-4 w-0.5 animate-pulse bg-primary" />}
          </div>
        )}

        {/* Shimmer skeleton when started but no text yet */}
        {progress.phase === 'started' && !progress.partialText && (
          <div className="space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        )}

        {/* Completed classic queries as sub-cards */}
        {progress.classicQueries?.map((cq, i) => (
          <ClassicSubCard
            key={`done-${i}`}
            query={cq.query}
            source={cq.source}
            results={cq.results}
          />
        ))}

        {/* Currently loading classic query */}
        {progress.phase === 'querying' && progress.query && progress.source && (
          <ClassicSubCard
            query={progress.query}
            source={progress.source}
            isLoading
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add components/chat/analysis-card.tsx
git commit -m "feat(ui): add AnalysisCard component with streaming text and classic sub-cards"
```

---

## Task 6: ChatMessage 路由到 AnalysisCard

**Files:**
- Modify: `components/chat/chat-message.tsx`

**Step 1: Add import**

```typescript
import { AnalysisCard } from './analysis-card'
```

并在 `TOOL_TITLES` 中添加：
```typescript
deepAnalysis: '深入分析',
```

**Step 2: Add routing for deepAnalysis**

在 `chat-message.tsx` 的 tool parts 处理逻辑中（在 analyzeBazi 的 if 块之后），添加 deepAnalysis 的路由：

```tsx
// AnalysisCard for deepAnalysis (streaming + completed)
if (toolName === 'deepAnalysis') {
  if (output || state === 'partial-output-available') {
    return (
      <AnalysisCard
        key={`tool-${message.id}-${index}`}
        progress={(output ?? {}) as AnalysisProgress}
        state={state}
      />
    )
  }
}
```

注意：需要在文件顶部追加 `import type { AnalysisProgress } from '@/lib/bazi/types'`。

**Step 3: Verify build**

Run: `npx next build`
Expected: 编译成功

**Step 4: Commit**

```bash
git add components/chat/chat-message.tsx
git commit -m "feat(ui): route deepAnalysis tool parts to AnalysisCard"
```

---

## Task 7: 提取 queryClassicsTool 为模块级变量

**Files:**
- Modify: `lib/bazi/analysis-agent.ts`

**Context:** 当前 `queryClassicsTool` 定义在 `runAnalysis` 函数内部。`runAnalysisStream` 也需要使用它。需要提取到模块级别。

**Step 1: Extract tool definition**

将 `queryClassicsTool` 的定义从 `runAnalysis` 函数体内移到模块顶层（`ANALYSIS_SYSTEM_PROMPT` 之后，`runAnalysis` 之前）。

**Step 2: Update both functions**

`runAnalysis` 和 `runAnalysisStream` 都引用模块级 `queryClassicsTool`，移除 `runAnalysis` 内部的定义。

**Step 3: Run existing tests**

Run: `npx vitest run lib/bazi/__tests__/`
Expected: PASS（所有现有测试不受影响）

**Step 4: Commit**

```bash
git add lib/bazi/analysis-agent.ts
git commit -m "refactor(bazi): extract queryClassicsTool to module scope"
```

---

## Task 8: 端到端手工验证

**Step 1: 启动开发服务器**

Run: `pnpm dev`

**Step 2: 手工测试流程**

1. 打开浏览器访问 localhost:3000
2. 输入生辰信息，确认后触发 analyzeBazi（纯计算，应如常工作）
3. 对话 Agent 自动调用 deepAnalysis → 观察 AnalysisCard 是否出现
4. 观察分析文字是否流式更新
5. 观察典籍查阅子卡片是否出现（取决于分析 Agent 是否触发 queryClassics）
6. 分析完成后卡片是否自动折叠为摘要
7. 追问一个问题 → 再次触发 deepAnalysis → 重复观察

**Step 3: 验证 analysisNote 同步**

1. 分析完成后刷新页面
2. 检查 analysisNote 是否从 IndexedDB 恢复
3. 检查对话 Agent 是否能基于已有 analysisNote 继续对话

**Step 4: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during e2e testing"
```

---

## 依赖关系

```
Task 1 (类型) ← Task 2 (analysis-agent) ← Task 3 (route.ts)
                                            ↑
Task 7 (提取 tool) ← Task 2               Task 5 (AnalysisCard) ← Task 6 (ChatMessage 路由)
                                                                     ↑
Task 4 (确认兼容性，无改动)                                          Task 3
```

**推荐执行顺序：** Task 7 → Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 8
