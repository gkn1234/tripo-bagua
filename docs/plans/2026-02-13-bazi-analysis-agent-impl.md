# 八字分析 Agent 架构实施计划（阶段 1）

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将八字分析从单 Agent 包办拆分为「分析 Agent + 对话 Agent」双 Agent 架构，通过 analysisNote 共享记忆层通信。

**Architecture:** analyzeBazi 工具内部嵌入独立的分析 Agent（使用 `generateText` 调用 DeepSeek），分析结论写入 analysisNote（IndexedDB 持久化）。对话 Agent 通过请求注入读取 analysisNote，专注于用户交互和表达。新增 deepAnalysis 工具供对话 Agent 在 analysisNote 不足时触发补充分析。

**Tech Stack:** Next.js 16 / Vercel AI SDK 6.x (`generateText`, `tool`) / DeepSeek / IndexedDB (`idb`) / TypeScript strict / Vitest / pnpm

**Design Doc:** `docs/plans/2026-02-13-bazi-analysis-architecture-redesign.md`

---

## Task 1: Vitest 基础配置

项目已安装 vitest 但缺少配置文件。

**Files:**
- Create: `vitest.config.ts`

**Step 1: 创建 vitest 配置**

```typescript
// vitest.config.ts
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
```

**Step 2: 验证 vitest 可运行**

Run: `pnpm vitest run --passWithNoTests`
Expected: 通过，无报错

**Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add vitest configuration"
```

---

## Task 2: AnalysisNote 类型定义

**Files:**
- Modify: `lib/bazi/types.ts`

**Step 1: 在 types.ts 末尾追加 AnalysisNote 类型**

在 `BaziResult` 接口之后追加：

```typescript
export interface AnalysisEntry {
  question: string | null    // 触发问题（null = 首次综合分析）
  content: string            // 分析结论（Markdown）
  references: string[]       // 引用的经典出处
  createdAt: number
}

export interface AnalysisNote {
  sessionId: string
  rawData: BaziResult
  analyses: AnalysisEntry[]
  updatedAt: number
}
```

**Step 2: 写类型测试**

Create: `lib/bazi/__tests__/types.test.ts`

```typescript
import { describe, expect, it } from 'vitest'
import type { AnalysisEntry, AnalysisNote, BaziResult } from '../types'

describe('AnalysisNote types', () => {
  it('should allow creating a valid AnalysisEntry', () => {
    const entry: AnalysisEntry = {
      question: null,
      content: '日主甲木生于寅月...',
      references: ['《子平真诠》格局篇'],
      createdAt: Date.now(),
    }
    expect(entry.question).toBeNull()
    expect(entry.references).toHaveLength(1)
  })

  it('should allow creating a valid AnalysisNote', () => {
    const note: AnalysisNote = {
      sessionId: 'test-session',
      rawData: {} as BaziResult,
      analyses: [],
      updatedAt: Date.now(),
    }
    expect(note.analyses).toHaveLength(0)
  })
})
```

**Step 3: 运行测试**

Run: `pnpm vitest run lib/bazi/__tests__/types.test.ts`
Expected: 2 tests PASS

**Step 4: Commit**

```bash
git add lib/bazi/types.ts lib/bazi/__tests__/types.test.ts
git commit -m "feat(bazi): add AnalysisNote and AnalysisEntry types"
```

---

## Task 3: AnalysisNote IndexedDB 持久化

**Files:**
- Modify: `lib/persistence/chat-db.ts`

**核心变更：** DB_VERSION 从 1 升到 2，新增 `analysisNotes` store。需要处理 IndexedDB 的 upgrade 逻辑——`upgrade` 回调中根据 `oldVersion` 判断是否需要创建新 store。

**Step 1: 扩展 ChatDB schema 和 CRUD 函数**

在 `chat-db.ts` 中：

1. 导入 AnalysisNote 类型：
```typescript
import type { AnalysisNote } from '@/lib/bazi/types'
```

2. 在 `ChatDB` interface 中添加新 store：
```typescript
interface ChatDB extends DBSchema {
  sessions: { /* 不变 */ }
  messages: { /* 不变 */ }
  analysisNotes: {
    key: string
    value: AnalysisNote
  }
}
```

3. 修改 `DB_VERSION` 和 `upgrade` 函数：
```typescript
const DB_VERSION = 2

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ChatDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' })
          sessionStore.createIndex('by-updated', 'updatedAt')
          db.createObjectStore('messages', { keyPath: 'sessionId' })
        }
        if (oldVersion < 2) {
          db.createObjectStore('analysisNotes', { keyPath: 'sessionId' })
        }
      },
    })
  }
  return dbPromise
}
```

4. 新增 CRUD 函数：
```typescript
export async function getAnalysisNote(sessionId: string): Promise<AnalysisNote | undefined> {
  const db = await getDB()
  return db.get('analysisNotes', sessionId)
}

export async function saveAnalysisNote(note: AnalysisNote): Promise<void> {
  const db = await getDB()
  await db.put('analysisNotes', note)
}

export async function deleteAnalysisNote(sessionId: string): Promise<void> {
  const db = await getDB()
  await db.delete('analysisNotes', sessionId)
}
```

5. 在 `deleteSession` 中同步删除 analysisNote：
```typescript
export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['sessions', 'messages', 'analysisNotes'], 'readwrite')
  await tx.objectStore('sessions').delete(sessionId)
  await tx.objectStore('messages').delete(sessionId)
  await tx.objectStore('analysisNotes').delete(sessionId)
  await tx.done
}
```

**Step 2: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add lib/persistence/chat-db.ts
git commit -m "feat(persistence): add analysisNotes IndexedDB store with CRUD"
```

---

## Task 4: 分析 Agent 核心逻辑

**Files:**
- Create: `lib/bazi/analysis-agent.ts`
- Create: `lib/bazi/__tests__/analysis-agent.test.ts`

**Step 1: 创建分析 Agent 模块**

```typescript
// lib/bazi/analysis-agent.ts
import type { AnalysisEntry, AnalysisNote, BaziResult } from './types'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { generateText } from 'ai'

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY!,
})

const ANALYSIS_SYSTEM_PROMPT = `你是一位命理分析引擎。你的任务是基于排盘数据，产出专业的八字命理分析。

规则：
- 所有结论必须有命盘数据作为依据，指出具体是哪柱、哪个十神、哪组关系
- 不需要考虑表达风格，不需要说人话，专注于分析的准确性和完整性
- 如果对某个判断不确定，明确标注不确定程度，而非给出模糊的万金油结论
- 分析中遇到特殊格局（从格、化格、专旺格等）时，须特别标注
- 输出格式为 Markdown`

interface AnalyzeParams {
  rawData: Omit<BaziResult, 'fiveElements'>
  previousNote: AnalysisNote | null
  question: string | null
}

export async function runAnalysis({ rawData, previousNote, question }: AnalyzeParams): Promise<AnalysisEntry> {
  const userContent = buildUserPrompt({ rawData, previousNote, question })

  const { text } = await generateText({
    model: deepseek('deepseek-chat'),
    system: ANALYSIS_SYSTEM_PROMPT,
    prompt: userContent,
  })

  return {
    question,
    content: text,
    references: extractReferences(text),
    createdAt: Date.now(),
  }
}

function buildUserPrompt({ rawData, previousNote, question }: AnalyzeParams): string {
  const parts: string[] = []

  parts.push('## 排盘数据\n')
  parts.push('```json')
  parts.push(JSON.stringify(rawData, null, 2))
  parts.push('```\n')

  if (previousNote && previousNote.analyses.length > 0) {
    parts.push('## 已有分析\n')
    for (const entry of previousNote.analyses) {
      if (entry.question) {
        parts.push(`### 问题：${entry.question}\n`)
      }
      else {
        parts.push('### 综合分析\n')
      }
      parts.push(entry.content)
      parts.push('')
    }
  }

  if (question) {
    parts.push(`## 本次分析任务\n`)
    parts.push(`请针对以下问题做深入分析：${question}`)
    parts.push('基于排盘数据和已有分析，给出专业论断。')
  }
  else {
    parts.push('## 本次分析任务\n')
    parts.push('请对该命盘做全面综合分析。涵盖日主强弱、格局特征、核心矛盾、大运走势等关键维度。')
  }

  return parts.join('\n')
}

function extractReferences(text: string): string[] {
  // 提取文本中《》包裹的经典引用
  const matches = text.match(/《[^》]+》/g)
  return matches ? [...new Set(matches)] : []
}

export { ANALYSIS_SYSTEM_PROMPT, buildUserPrompt, extractReferences }
```

**Step 2: 写单元测试（纯函数部分）**

```typescript
// lib/bazi/__tests__/analysis-agent.test.ts
import type { AnalysisNote, BaziResult } from '../types'
import { describe, expect, it } from 'vitest'
import { buildUserPrompt, extractReferences } from '../analysis-agent'

describe('extractReferences', () => {
  it('should extract book references from text', () => {
    const text = '根据《子平真诠》格局篇，此命为正官格。《滴天髓》亦云...'
    const refs = extractReferences(text)
    expect(refs).toEqual(['《子平真诠》', '《滴天髓》'])
  })

  it('should deduplicate references', () => {
    const text = '《穷通宝鉴》指出...再参照《穷通宝鉴》...'
    const refs = extractReferences(text)
    expect(refs).toEqual(['《穷通宝鉴》'])
  })

  it('should return empty array when no references', () => {
    const refs = extractReferences('日主偏弱，需要印星帮扶')
    expect(refs).toEqual([])
  })
})

describe('buildUserPrompt', () => {
  const mockRawData = {
    solar: '1990-5-15 10:00',
    lunar: '庚午年四月廿一',
    bazi: '庚午 辛巳 甲申 己巳',
    zodiac: '马',
    dayMaster: '甲',
    fourPillars: {} as BaziResult['fourPillars'],
    gods: [],
    decadeFortunes: [],
    relations: {},
  }

  it('should include raw data section', () => {
    const prompt = buildUserPrompt({ rawData: mockRawData, previousNote: null, question: null })
    expect(prompt).toContain('## 排盘数据')
    expect(prompt).toContain('"dayMaster": "甲"')
  })

  it('should include comprehensive analysis instruction when no question', () => {
    const prompt = buildUserPrompt({ rawData: mockRawData, previousNote: null, question: null })
    expect(prompt).toContain('全面综合分析')
  })

  it('should include specific question when provided', () => {
    const prompt = buildUserPrompt({ rawData: mockRawData, previousNote: null, question: '事业方向' })
    expect(prompt).toContain('事业方向')
  })

  it('should include previous analyses when available', () => {
    const note: AnalysisNote = {
      sessionId: 'test',
      rawData: {} as BaziResult,
      analyses: [{
        question: null,
        content: '日主甲木偏弱...',
        references: [],
        createdAt: Date.now(),
      }],
      updatedAt: Date.now(),
    }
    const prompt = buildUserPrompt({ rawData: mockRawData, previousNote: note, question: '婚姻' })
    expect(prompt).toContain('## 已有分析')
    expect(prompt).toContain('日主甲木偏弱')
    expect(prompt).toContain('婚姻')
  })
})
```

**Step 3: 运行测试**

Run: `pnpm vitest run lib/bazi/__tests__/analysis-agent.test.ts`
Expected: 所有测试 PASS

**Step 4: Commit**

```bash
git add lib/bazi/analysis-agent.ts lib/bazi/__tests__/analysis-agent.test.ts
git commit -m "feat(bazi): add analysis agent with buildUserPrompt and extractReferences"
```

---

## Task 5: 改造 analyzeBazi 工具

**Files:**
- Modify: `app/api/chat/route.ts`

**核心变更：** analyzeBazi 的 execute 函数中，排盘后调用分析 Agent，将分析结论写入 analysisNote 并返回。

**Step 1: 修改 route.ts**

1. 新增导入：
```typescript
import type { AnalysisNote } from '@/lib/bazi/types'
import { runAnalysis } from '@/lib/bazi/analysis-agent'
```

2. POST 函数中从请求体提取 analysisNote：
```typescript
const { messages, pendingTaskId, analysisNote: existingNote } = await req.json()
```

3. 重写 analyzeBazi 的 execute：
```typescript
const analyzeBazi = tool({
  description: '根据出生日期时间分析八字命盘,返回完整的四柱数据和专业分析',
  inputSchema: z.object({
    year: z.number().describe('出生年份,如 1990'),
    month: z.number().min(1).max(12).describe('出生月份'),
    day: z.number().min(1).max(31).describe('出生日'),
    hour: z.number().min(0).max(23).describe('出生时辰(24 小时制)'),
    gender: z.number().min(0).max(1).optional().describe('性别:0 女 1 男,默认 1'),
  }),
  execute: async ({ year, month, day, hour, gender }) => {
    try {
      const result = calculateBazi({ year, month, day, hour, gender: (gender ?? 1) as 0 | 1 })

      // 剔除 fiveElements，传给分析 Agent
      const { fiveElements, ...dataForAnalysis } = result

      const entry = await runAnalysis({
        rawData: dataForAnalysis,
        previousNote: existingNote ?? null,
        question: null,
      })

      // 构建更新后的 analysisNote
      const updatedNote: AnalysisNote = {
        sessionId: '', // 客户端填充
        rawData: result,
        analyses: [...(existingNote?.analyses ?? []), entry],
        updatedAt: Date.now(),
      }

      return { success: true, data: result, analysisNote: updatedNote }
    }
    catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '八字计算失败' }
    }
  },
})
```

**Step 2: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(chat): integrate analysis agent into analyzeBazi tool"
```

---

## Task 6: 新增 deepAnalysis 工具

**Files:**
- Modify: `app/api/chat/route.ts`

**Step 1: 在 POST 函数内添加 deepAnalysis 工具**

在 `generateMascot` 定义附近添加：

```typescript
const deepAnalysis = tool({
  description: '对已有命盘做补充深入分析,当 analysisNote 中的现有分析不足以回答用户问题时调用',
  inputSchema: z.object({
    question: z.string().describe('需要深入分析的具体问题'),
  }),
  execute: async ({ question }) => {
    if (!existingNote?.rawData) {
      return { success: false, error: '尚未排盘，请先调用 analyzeBazi' }
    }

    try {
      const { fiveElements, ...dataForAnalysis } = existingNote.rawData

      const entry = await runAnalysis({
        rawData: dataForAnalysis,
        previousNote: existingNote,
        question,
      })

      const updatedNote: AnalysisNote = {
        ...existingNote,
        analyses: [...existingNote.analyses, entry],
        updatedAt: Date.now(),
      }

      return { success: true, analysisNote: updatedNote }
    }
    catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '补充分析失败' }
    }
  },
})
```

**Step 2: 将 deepAnalysis 加入 tools 对象**

```typescript
tools: { analyzeBazi, generateMascot, retextureMascot, presentOptions, deepAnalysis },
```

**Step 3: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 4: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(chat): add deepAnalysis tool for supplementary analysis"
```

---

## Task 7: analysisNote 注入对话 Agent 上下文

**Files:**
- Modify: `app/api/chat/route.ts`

**Step 1: 构建 analysisNote 上下文注入**

在 `systemPrompt` 和 `streamText` 调用之间，构建注入内容：

```typescript
function buildAnalysisContext(note: AnalysisNote | null): string {
  if (!note || note.analyses.length === 0) return ''

  const parts = ['\n\n## 命盘分析结论（由分析 Agent 产出，供你参考和引用）\n']
  for (const entry of note.analyses) {
    if (entry.question) {
      parts.push(`### 关于「${entry.question}」\n`)
    }
    else {
      parts.push('### 综合分析\n')
    }
    parts.push(entry.content)
    if (entry.references.length > 0) {
      parts.push(`\n引用经典：${entry.references.join('、')}`)
    }
    parts.push('')
  }
  return parts.join('\n')
}
```

**Step 2: 在 streamText 中拼接**

```typescript
const analysisContext = buildAnalysisContext(existingNote ?? null)

const result = streamText({
  model: deepseek('deepseek-chat'),
  system: systemPrompt + analysisContext,
  messages: await convertToModelMessages(messages),
  tools: { analyzeBazi, generateMascot, retextureMascot, presentOptions, deepAnalysis },
  stopWhen: [stepCountIs(10), hasToolCall('presentOptions')],
})
```

**Step 3: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 4: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(chat): inject analysisNote context into conversation agent prompt"
```

---

## Task 8: 客户端 analysisNote 读写

**Files:**
- Modify: `hooks/use-chat-session.ts`

**核心变更：**
1. transport body 中携带 analysisNote
2. 从 AI 响应中提取更新后的 analysisNote 并写回 IndexedDB

**Step 1: 修改 transport body 携带 analysisNote**

```typescript
const transport = new DefaultChatTransport({
  api: '/api/chat',
  body: async () => {
    const { getAnalysisNote } = await import('@/lib/persistence/chat-db')
    const sessionId = useChatStore.getState().currentSessionId
    const note = sessionId ? await getAnalysisNote(sessionId) : undefined
    return {
      pendingTaskId: useChatStore.getState().pendingTaskId ?? undefined,
      analysisNote: note ?? undefined,
    }
  },
})
```

> **注意：** 需要确认 `DefaultChatTransport` 的 `body` 是否支持 async 函数。如果不支持，需要改为在 `useChatSession` hook 中维护 analysisNote state，通过同步 body 传递。具体方案在实施时根据 Vercel AI SDK 文档确认。

**Step 2: 监听 AI 响应中的 analysisNote 更新**

在 `useChatSession` hook 中，监听 `chat.messages` 变化，从 tool result 中提取 analysisNote 并持久化：

```typescript
// 在现有的 debounce save effect 中追加 analysisNote 持久化逻辑
useEffect(() => {
  async function syncAnalysisNote() {
    const session = sessionRef.current
    if (!session) return

    // 从最新消息中找 analyzeBazi 或 deepAnalysis 的 tool result
    const lastMsg = chat.messages[chat.messages.length - 1]
    if (lastMsg?.role !== 'assistant') return

    for (const part of lastMsg.parts) {
      if (part.type === 'tool-invocation'
        && (part.toolName === 'analyzeBazi' || part.toolName === 'deepAnalysis')
        && part.state === 'result'
        && part.result?.analysisNote) {
        const { saveAnalysisNote } = await import('@/lib/persistence/chat-db')
        const note = { ...part.result.analysisNote, sessionId: session.id }
        await saveAnalysisNote(note)
      }
    }
  }
  syncAnalysisNote()
}, [chat.messages])
```

**Step 3: 在 deleteSession / newSession 时清理 analysisNote**

在 `loadSession` 回调中无需特殊处理（下次请求会自动按 sessionId 加载）。
在 `deleteSession`（已在 Task 3 的 chat-db.ts 中处理）。

**Step 4: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 5: Commit**

```bash
git add hooks/use-chat-session.ts
git commit -m "feat(chat): client-side analysisNote read/write via IndexedDB"
```

---

## Task 9: 重写对话 Agent Prompt

**Files:**
- Modify: `app/api/chat/route.ts`

**Step 1: 替换 systemPrompt**

将现有的 `systemPrompt` 常量（L43-L104）替换为：

```typescript
const systemPrompt = `## 你是谁

你是一位年轻但眼光毒辣的命理师。
你的风格是铁口直断——看到什么说什么,不兜圈子,不堆砌术语故作高深。
该夸的地方一笔带过,该提醒的地方绝不含糊。
你说话轻松直接,偶尔带点幽默,但从不油滑。
用户找你,是想听真话,不是听客套。

## 怎么做事

你遵循以下原则:

- 一次只做一件事。做完当前这步,停下来,让用户决定下一步。
- 动手之前先开口。任何生成操作(排盘、生成模型、换材质)前,先描述你打算做什么,等用户确认。
- 给选择不给指令。需要用户做决定时,调用 presentOptions 提供选项,让用户主导节奏。
- 改完不急着收工。每次生成或修改完成后,先问满不满意。不满意就接着聊怎么改,聊完确认了再动手。
- 用户说了生辰信息,你必须先复述确认(年月日时、性别),然后停下来等用户回复"对的"或纠正。在用户明确确认之前,绝对不要调用 analyzeBazi。这是硬性规则,没有例外。

## 八字解读

你的上下文中包含分析 Agent 产出的专业分析结论。
你的职责是把这些结论翻译成用户听得懂的话。

规则:
- 先给一个简洁有力的总体判断,铁口直断
- 用大白话解释,不堆砌术语
- 该提醒的地方不含糊,该夸的一笔带过
- 分析结论中标注了不确定的判断,不要把这些当作确定结论呈现给用户
- 用户追问时,优先从已有分析结论中提取相关内容
- 如果已有分析不足以回答用户的问题,调用 deepAnalysis 让分析 Agent 补充

## 吉祥物设计

根据分析结论中的喜用神方向,推荐吉祥物方案。不要局限于固定的五行-瑞兽对应,发挥创意。
描述吉祥物时要具体:造型、姿态、配饰、颜色、材质质感都要说清楚。
风格适合做桌面摆件,精致小巧。
先推荐你认为最合适的方案,再问用户的偏好和想法。
吉祥物方案在生成前必须和用户充分讨论——你先推荐,用户可以提自己的想法,最终方案双方都满意了才生成。

调用 generateMascot 时,prompt 遵循以下结构(英文):
"A [style] figurine of [creature], [key pose/action],
[1-2 material descriptors], [1-2 color descriptors],
desktop collectible, smooth LOD transitions"

## 工具使用

analyzeBazi — 必须在用户确认生辰信息后才能调用。收到生辰信息后先复述、等确认、收到确认后才排盘。

deepAnalysis — 当已有分析结论不足以回答用户问题时调用,传入具体问题,分析 Agent 会做补充分析。

presentOptions — 每次回复末尾如果存在分支选择,就调用此工具提供选项按钮。不要用纯文字罗列选项来替代它。

generateMascot — 仅在用户明确确认吉祥物方案后调用。prompt 参数要包含详细的造型描述(形态、颜色、姿态、配饰、材质)。

retextureMascot — 用户对已生成的模型想做小范围调整(换颜色、换材质、换纹理风格)时使用,不改变造型。

调用 generateMascot 或 retextureMascot 后会返回 { taskId, status: 'pending' },
表示任务已提交异步生成,前端会自动轮询进度并展示结果。
在模型生成期间不要再次调用这两个工具,告诉用户等待当前任务完成。`
```

**Step 2: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "refactor(chat): rewrite conversation agent prompt - remove analysis methodology, add quality constraints"
```

---

## Task 10: Tripo API 参数增强

**Files:**
- Modify: `lib/tripo.ts`

**Step 1: 查看当前 createTask 实现并添加 negative_prompt + texture_quality**

修改 `createTask` 方法的请求体，添加 `negative_prompt` 和 `texture_quality` 参数：

```typescript
// 在 createTask 方法的请求体中添加：
{
  type: 'text_to_model',
  prompt,
  negative_prompt: negativePrompt ?? 'blurry, low quality, multiple heads, floating parts, disconnected geometry, extra limbs, deformed',
  model_version: 'v2.5-20250123',
  texture_quality: 'high',
}
```

> **注意：** 需要先读取 `lib/tripo.ts` 确认 `createTask` 的具体签名，再决定如何添加 `negativePrompt` 参数。可能需要修改方法签名以接受额外参数。

**Step 2: 扩展 generateMascot schema**

在 `app/api/chat/route.ts` 中修改 generateMascot：

```typescript
const generateMascot = tool({
  description: '根据描述生成 3D 吉祥物模型,返回 taskId 用于异步轮询',
  inputSchema: z.object({
    prompt: z.string().describe('遵循模板的结构化英文描述'),
    negativePrompt: z.string().optional().describe('不希望出现的特征,英文'),
    style: z.string().optional().describe('风格偏好,如 cute、majestic、chibi'),
  }),
  execute: async ({ prompt, negativePrompt, style }) => {
    if (pendingTaskId) {
      return { success: false, error: '已有模型在生成中,请等待完成' }
    }
    try {
      const fullPrompt = style ? `${prompt}, ${style} style` : prompt
      const taskId = await tripoClient.createTask(fullPrompt, { negativePrompt })
      return { success: true, taskId, status: 'pending' }
    }
    catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '3D 模型生成失败' }
    }
  },
})
```

**Step 3: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 4: Commit**

```bash
git add lib/tripo.ts app/api/chat/route.ts
git commit -m "feat(tripo): add negative_prompt and texture_quality to Tripo API calls"
```

---

## Task 11: 端到端冒烟测试

**Step 1: 启动开发服务器**

Run: `pnpm dev`

**Step 2: 手动测试流程**

1. 打开浏览器，新建对话
2. 输入「我是1990年5月15日上午10点出生的男性」
3. 确认 AI 复述生辰信息并等待确认
4. 回复「对的」
5. 验证：
   - BaguaCard 正常渲染（排盘数据）
   - AI 给出基于分析 Agent 结论的铁口直断式解读
   - 打开浏览器 DevTools → Application → IndexedDB → tripo-bagua → analysisNotes，确认有数据
6. 追问「详细说说事业方向」
7. 验证：
   - AI 从已有分析中提取，或调用 deepAnalysis 补充
   - IndexedDB 中 analysisNotes 追加了新 entry
8. 刷新页面，确认对话恢复后追问仍能引用之前的分析

**Step 3: Commit（如有修复）**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```

---

## 完成标准

- [ ] vitest 配置就绪，现有测试全部通过
- [ ] AnalysisNote 类型定义完整
- [ ] IndexedDB 支持 analysisNotes store（DB_VERSION=2）
- [ ] 分析 Agent 模块可独立调用
- [ ] analyzeBazi 内部调用分析 Agent 并返回 analysisNote
- [ ] deepAnalysis 工具可用
- [ ] analysisNote 注入对话 Agent 上下文
- [ ] 客户端正确读写 analysisNote
- [ ] 对话 Agent Prompt 已重写（无分析方法论）
- [ ] Tripo API 参数已增强
- [ ] 端到端冒烟测试通过
