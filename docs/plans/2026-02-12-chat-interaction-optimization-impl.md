# 八字聊天交互优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将一口气完成的八字聊天流程改为分步引导式交互，提示词全中文化，新增选项引导和吉祥物换材质能力。

**Architecture:** 替换系统提示词为中文（原则驱动而非状态机）+ 新增 `presentOptions` / `retextureMascot` 工具 + 新增 `OptionsButtons` 前端组件。复用现有 `tool → custom UI` 渲染管线，零架构改动。

**Tech Stack:** Next.js 16, Vercel AI SDK 6, DeepSeek, Tripo API v2 (texture_model), React 19, shadcn/ui, TypeScript

**Design doc:** `docs/plans/2026-02-12-chat-interaction-optimization-design.md`

**Coding conventions:** 无分号、单引号、2 空格缩进（@antfu/eslint-config）、`'use client'` 标注客户端组件、`interface` 定义 props、`import type` 语法、函数声明 + 命名导出、`data-slot` 属性。

**Tripo texture_model API:** 支持 `texture_prompt.text` 文本描述 + `original_model_task_id` + `texture_seed` 等参数。可以用文本指定新纹理的颜色/风格/材质，保留原始造型不变。

---

### Task 1: 扩展 Tripo 客户端 — 添加 retextureModel 方法

**Files:**
- Modify: `lib/tripo.ts`

**Step 1: 在 `tripoClient` 对象末尾添加 `retextureModel` 方法**

在 `lib/tripo.ts` 的 `waitForCompletion` 方法后（第 89 行闭合括号前）添加：

```ts
  async retextureModel(
    originalTaskId: string,
    options?: {
      prompt?: string
      textureSeed?: number
      textureQuality?: 'standard' | 'detailed'
    },
  ): Promise<string> {
    const body: Record<string, unknown> = {
      type: 'texture_model',
      original_model_task_id: originalTaskId,
      texture: true,
      pbr: true,
      texture_quality: options?.textureQuality ?? 'standard',
    }
    if (options?.prompt) {
      body.texture_prompt = { text: options.prompt }
    }
    if (options?.textureSeed != null) {
      body.texture_seed = options.textureSeed
    }

    const res = await fetch(`${TRIPO_API_BASE}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TRIPO_API_KEY}`,
      },
      body: JSON.stringify(body),
    })

    const data: TripoCreateTaskResponse = await res.json()

    if (data.code !== 0) {
      throw new Error(data.message || `Tripo API error: code ${data.code}`)
    }

    return data.data.task_id
  },
```

**Step 2: 运行 lint 验证语法**

Run: `pnpm lint`
Expected: 无新增错误

**Step 3: Commit**

```bash
git add lib/tripo.ts
git commit -m "feat(api): add retextureModel method to Tripo client"
```

---

### Task 2: 重写系统提示词和全部工具定义

**Files:**
- Modify: `app/api/chat/route.ts`

**Step 1: 替换 systemPrompt 常量（第 41-71 行）**

将整个 `const systemPrompt = \`...\`` 替换为：

```ts
const systemPrompt = `## 你是谁

你是一位年轻但眼光毒辣的命理师。
你的风格是铁口直断——看到什么说什么，不兜圈子，不堆砌术语故作高深。
该夸的地方一笔带过，该提醒的地方绝不含糊。
你说话轻松直接，偶尔带点幽默，但从不油滑。
用户找你，是想听真话，不是听客套。

## 怎么做事

你遵循以下原则：

- 一次只做一件事。做完当前这步，停下来，让用户决定下一步。
- 动手之前先开口。任何生成操作（排盘、生成模型、换材质）前，先描述你打算做什么，等用户确认。
- 给选择不给指令。需要用户做决定时，调用 presentOptions 提供选项，让用户主导节奏。
- 改完不急着收工。每次生成或修改完成后，先问满不满意。不满意就接着聊怎么改，聊完确认了再动手。
- 用户说了生辰信息，先复述确认（年月日时、性别），确认无误后再调用 analyzeBazi。
- 拿到命盘后，先给一个简洁有力的总体判断（两三句话，铁口直断），然后引导用户选择感兴趣的方向或直接看吉祥物。
- 解读具体方向时，结合命盘数据说人话，让没有命理基础的人也能听懂。解读完一个方向后，继续提供选择。
- 吉祥物方案在生成前必须和用户充分讨论——你先推荐，用户可以提自己的想法，最终方案双方都满意了才生成。

## 八字解读

拿到 analyzeBazi 返回的命盘数据后，你的解读方式：

总论先行：观察日主强弱、格局高低，用一两句直白的话概括此人命盘的核心特征。
比如"你这盘日主偏弱但有根，属于看着温和、骨子里倔的人"，而不是"日主甲木生于申月处死地"。

分方向解读时，围绕以下维度展开：
- 事业：看官杀、印星与日主的关系，结合大运走势
- 财运：看财星旺衰、是否有食伤生财的通路
- 婚恋：看配偶宫（日支）、配偶星（男看财女看官）的状态
- 健康：看五行偏枯，哪个五行过旺或过弱对应的身体部位

解读时直接给结论，再简单解释依据。不要先铺垫半天再说结论。

## 吉祥物设计

根据命盘喜用神对应的五行，推荐吉祥物方向：
- 喜水：玄武、龟、鱼 — 黑色/深蓝色调
- 喜木：青龙、麒麟 — 绿色/青色调
- 喜火：朱雀、凤凰 — 红色/橙色调
- 喜金：白虎、貔貅 — 白色/金色调
- 喜土：黄龙、瑞兽 — 黄色/棕色调

描述吉祥物时要具体：造型、姿态、配饰、颜色、材质质感都要说清楚。
风格适合做桌面摆件，精致小巧。
先推荐你认为最合适的方案，再问用户的偏好和想法。

## 工具使用

analyzeBazi — 用户确认生辰信息后调用，不要在用户还没确认时就急着排盘。

presentOptions — 每次回复末尾如果存在分支选择，就调用此工具提供选项按钮。不要用纯文字罗列选项来替代它。

generateMascot — 仅在用户明确确认吉祥物方案后调用。prompt 参数要包含详细的造型描述（形态、颜色、姿态、配饰、材质）。

retextureMascot — 用户对已生成的模型想做小范围调整（换颜色、换材质、换纹理风格）时使用，不改变造型。prompt 参数描述期望的纹理效果（如"金属金色表面"或"冰蓝色通透玉质感"）。调用后前端会自动轮询进度。完成后回到讨论环节，确认满意度。

调用 generateMascot 或 retextureMascot 后会返回 { taskId, status: 'pending' }，
表示任务已提交异步生成，前端会自动轮询进度并展示结果。
在模型生成期间不要再次调用这两个工具，告诉用户等待当前任务完成。`
```

**Step 2: 更新 analyzeBazi 工具描述为中文（第 12-19 行）**

替换整个 `analyzeBazi` 的 `tool({...})` 定义：

```ts
const analyzeBazi = tool({
  description: '根据出生日期时间分析八字命盘，返回完整的四柱数据',
  inputSchema: z.object({
    year: z.number().describe('出生年份，如 1990'),
    month: z.number().min(1).max(12).describe('出生月份'),
    day: z.number().min(1).max(31).describe('出生日'),
    hour: z.number().min(0).max(23).describe('出生时辰（24 小时制）'),
    gender: z.number().min(0).max(1).optional().describe('性别：0 女 1 男，默认 1'),
  }),
  execute: async ({ year, month, day, hour, gender }) => {
    try {
      const result = calculateBazi({
        year,
        month,
        day,
        hour,
        gender: (gender ?? 1) as 0 | 1,
      })
      return { success: true, data: result }
    }
    catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '八字计算失败',
      }
    }
  },
})
```

**Step 3: 在文件顶部的 import 之后，添加 presentOptions 工具定义**

在 `analyzeBazi` 定义之前添加：

```ts
const presentOptions = tool({
  description: '向用户展示可选项按钮，引导下一步操作。需要用户做选择时必须调用此工具。',
  inputSchema: z.object({
    options: z.array(z.object({
      label: z.string().describe('按钮上显示的文字'),
      description: z.string().optional().describe('选项的简短说明'),
    })).describe('选项列表'),
  }),
  execute: async ({ options }) => ({ options }),
})
```

**Step 4: 更新 generateMascot 工具描述为中文 + 添加 retextureMascot 工具**

在 `POST` 函数体内（第 73 行之后），替换 `generateMascot` 定义并新增 `retextureMascot`：

```ts
  const generateMascot = tool({
    description: '根据描述生成 3D 吉祥物模型，返回 taskId 用于异步轮询',
    inputSchema: z.object({
      prompt: z.string().describe('详细的吉祥物描述，包含造型、颜色、姿态、配饰'),
      style: z.string().optional().describe('风格偏好，如 cute、majestic、chibi'),
    }),
    execute: async ({ prompt, style }) => {
      if (pendingTaskId) {
        return { success: false, error: '已有模型在生成中，请等待完成' }
      }
      try {
        const fullPrompt = style ? `${prompt}, ${style} style` : prompt
        const taskId = await tripoClient.createTask(fullPrompt)
        return { success: true, taskId, status: 'pending' }
      }
      catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : '3D 模型生成失败',
        }
      }
    },
  })

  const retextureMascot = tool({
    description: '对已生成的 3D 模型重新生成纹理，保留造型不变，可指定新的材质/颜色/风格',
    inputSchema: z.object({
      taskId: z.string().describe('原始模型的 taskId'),
      prompt: z.string().describe('期望的纹理效果描述，如"金属金色表面"'),
      textureQuality: z.enum(['standard', 'detailed']).optional().describe('纹理质量，默认 standard'),
    }),
    execute: async ({ taskId, prompt, textureQuality }) => {
      if (pendingTaskId) {
        return { success: false, error: '已有模型在生成中，请等待完成' }
      }
      try {
        const newTaskId = await tripoClient.retextureModel(taskId, {
          prompt,
          textureQuality: textureQuality ?? 'standard',
        })
        return { success: true, taskId: newTaskId, status: 'pending' }
      }
      catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : '纹理重生成失败',
        }
      }
    },
  })
```

**Step 5: 更新 tools 注册（约第 105 行）**

将：
```ts
    tools: { analyzeBazi, generateMascot },
```
替换为：
```ts
    tools: { analyzeBazi, generateMascot, retextureMascot, presentOptions },
```

**Step 6: 运行 lint 验证**

Run: `pnpm lint`
Expected: 无新增错误

**Step 7: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(api): rewrite system prompt to Chinese, add presentOptions and retextureMascot tools"
```

---

### Task 3: 创建 OptionsButtons 组件

**Files:**
- Create: `components/chat/options-buttons.tsx`

**Step 1: 创建组件文件**

创建 `components/chat/options-buttons.tsx`：

```tsx
'use client'

import { Button } from '@/components/ui/button'

interface OptionItem {
  label: string
  description?: string
}

interface OptionsButtonsProps {
  options: OptionItem[]
  onSelect: (label: string) => void
  disabled?: boolean
}

export function OptionsButtons({ options, onSelect, disabled }: OptionsButtonsProps) {
  return (
    <div data-slot="options-buttons" className="flex flex-wrap gap-2 py-2">
      {options.map(option => (
        <Button
          key={option.label}
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onSelect(option.label)}
          title={option.description}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
```

**Step 2: 运行 lint 验证**

Run: `pnpm lint`
Expected: 无新增错误

**Step 3: Commit**

```bash
git add components/chat/options-buttons.tsx
git commit -m "feat(chat): add OptionsButtons component for guided interaction"
```

---

### Task 4: 更新 ChatMessage 路由 — 集成新工具渲染

**Files:**
- Modify: `components/chat/chat-message.tsx`

**Step 1: 添加 import 和更新 TOOL_TITLES**

在文件顶部 import 区域，添加 OptionsButtons 的导入：

```ts
import { OptionsButtons } from './options-buttons'
```

更新 `TOOL_TITLES`（第 27-30 行）：

```ts
const TOOL_TITLES: Record<string, string> = {
  analyzeBazi: '分析八字',
  generateMascot: '生成 3D 模型',
  retextureMascot: '重新生成纹理',
  presentOptions: '选择',
}
```

**Step 2: 为 ChatMessageProps 添加 onSendMessage prop**

更新 interface（第 32-37 行）：

```ts
interface ChatMessageProps {
  message: UIMessage
  isLast?: boolean
  isStreaming?: boolean
  onRegenerate?: () => void
  onSendMessage?: (text: string) => void
}
```

更新函数签名：

```ts
export function ChatMessage({ message, isLast, isStreaming, onRegenerate, onSendMessage }: ChatMessageProps) {
```

**Step 3: 在 tool parts 路由中添加 presentOptions 和 retextureMascot 分支**

在 `chat-message.tsx` 的 tool parts 区域（第 91-96 行 `generateMascot` 分支后），添加两个新分支：

```tsx
            // OptionsButtons for presentOptions
            if (toolName === 'presentOptions' && state === 'output-available' && output?.options) {
              return (
                <OptionsButtons
                  key={`tool-${message.id}-${index}`}
                  options={output.options as { label: string, description?: string }[]}
                  onSelect={(label) => { onSendMessage?.(label) }}
                  disabled={!isLast || isStreaming}
                />
              )
            }

            // ModelPreview for retextureMascot (same rendering as generateMascot)
            if (toolName === 'retextureMascot') {
              if (state === 'output-available' && output?.taskId) {
                return <ModelPreview key={`tool-${message.id}-${index}`} taskId={output.taskId as string} />
              }
            }
```

**Step 4: 运行 lint 验证**

Run: `pnpm lint`
Expected: 无新增错误

**Step 5: Commit**

```bash
git add components/chat/chat-message.tsx
git commit -m "feat(chat): route presentOptions and retextureMascot tools to UI components"
```

---

### Task 5: 传递 sendMessage 到 ChatMessage

**Files:**
- Modify: `components/chat/index.tsx`

**Step 1: 在 ChatMessage 渲染处传递 onSendMessage**

在 `components/chat/index.tsx` 的 messages.map 中（约第 49-55 行），为 `ChatMessage` 添加 `onSendMessage` prop：

```tsx
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isLast={index === messages.length - 1}
                    isStreaming={isLoading}
                    onRegenerate={message.role === 'assistant' ? regenerate : undefined}
                    onSendMessage={text => sendMessage({ text })}
                  />
```

**Step 2: 运行 lint 验证**

Run: `pnpm lint`
Expected: 无新增错误

**Step 3: Commit**

```bash
git add components/chat/index.tsx
git commit -m "feat(chat): pass sendMessage to ChatMessage for options interaction"
```

---

### Task 6: 构建验证

**Step 1: 运行完整 lint**

Run: `pnpm lint`
Expected: 无错误

**Step 2: 运行 TypeScript 类型检查**

Run: `pnpm build`
Expected: 构建成功，无类型错误

**Step 3: 如有错误，修复并重新构建**

修复所有 lint 和类型错误后重新运行 `pnpm build`。

**Step 4: Commit（如有修复）**

```bash
git add -A
git commit -m "fix: resolve lint and type errors from chat interaction optimization"
```

---

## 变更文件汇总

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/tripo.ts` | 修改 | 添加 `retextureModel` 方法 |
| `app/api/chat/route.ts` | 修改 | 中文提示词 + 4 个工具定义 |
| `components/chat/options-buttons.tsx` | 新建 | 选项按钮组组件 |
| `components/chat/chat-message.tsx` | 修改 | 新工具路由 + `onSendMessage` prop |
| `components/chat/index.tsx` | 修改 | 传递 `sendMessage` 到 `ChatMessage` |

## 手动验证清单

构建通过后，启动 `pnpm dev` 手动验证以下场景：

- [ ] 输入生辰信息，AI 先复述确认而非直接排盘
- [ ] 确认后 AI 调用 analyzeBazi，显示 BaguaCard + 简洁总评
- [ ] AI 在回复末尾调用 presentOptions，页面渲染出按钮组
- [ ] 点击按钮发送对应文本消息，AI 继续对应方向的解读
- [ ] 非最新消息中的按钮显示为禁用状态
- [ ] 吉祥物讨论环节 AI 先推荐方案，征求用户确认后才生成
- [ ] 生成完成后 AI 询问满意度，提供 retexture / 重新生成 / 满意 选项
- [ ] retextureMascot 工具调用后显示 ModelPreview 组件并轮询进度
