# Prompt 可视化与编辑 - 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在前端展示 3D 模型生成的实际 prompt，支持内联编辑和通过对话流重新生成。

**Architecture:** 服务端 tool output 补充 prompt 字段；新建 PromptCard 可折叠卡片组件（Collapsible + textarea）；chat-message.tsx 路由合并 generateMascot/retextureMascot 分支，在 ModelPreview 上方渲染 PromptCard。

**Tech Stack:** React 19, Tailwind CSS v4, shadcn/ui Collapsible, Lucide icons

**Design doc:** `docs/plans/2026-02-17-prompt-visibility-design.md`

---

### Task 1: 服务端返回 prompt 字段

**Files:**
- Modify: `app/api/chat/route.ts:219` (generateMascot return)
- Modify: `app/api/chat/route.ts:243` (retextureMascot return)

**Step 1: 修改 generateMascot 返回值**

`app/api/chat/route.ts:219` 当前:
```typescript
return { success: true, taskId, status: 'pending' }
```
改为:
```typescript
return { success: true, taskId, status: 'pending', prompt: fullPrompt, negativePrompt: negativePrompt ?? null }
```

**Step 2: 修改 retextureMascot 返回值**

`app/api/chat/route.ts:243` 当前:
```typescript
return { success: true, taskId: newTaskId, status: 'pending' }
```
改为:
```typescript
return { success: true, taskId: newTaskId, status: 'pending', prompt }
```

**Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(api): include prompt in generateMascot/retextureMascot output"
```

---

### Task 2: 创建 PromptCard 组件

**Files:**
- Create: `components/chat/prompt-card.tsx`

**Step 1: 创建 PromptCard 组件**

参考 `components/chat/analysis-card.tsx` 的 Collapsible 模式。完整代码:

```tsx
'use client'

import { CheckIcon, ChevronDownIcon, CopyIcon, PaletteIcon, RotateCcwIcon, SendIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface PromptCardProps {
  prompt: string
  negativePrompt?: string | null
  title?: string
  disabled?: boolean
  onRegenerate?: (prompt: string, negativePrompt?: string) => void
}

export function PromptCard({
  prompt: initialPrompt,
  negativePrompt: initialNegative,
  title = '吉祥物生成提示词',
  disabled,
  onRegenerate,
}: PromptCardProps) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState(initialPrompt)
  const [negativePrompt, setNegativePrompt] = useState(initialNegative ?? '')
  const [copied, setCopied] = useState(false)

  const isModified = prompt !== initialPrompt || negativePrompt !== (initialNegative ?? '')

  const handleCopy = useCallback(() => {
    const text = negativePrompt
      ? `prompt: ${prompt}\nnegativePrompt: ${negativePrompt}`
      : prompt
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [prompt, negativePrompt])

  const handleReset = useCallback(() => {
    setPrompt(initialPrompt)
    setNegativePrompt(initialNegative ?? '')
  }, [initialPrompt, initialNegative])

  const handleRegenerate = useCallback(() => {
    onRegenerate?.(prompt, negativePrompt || undefined)
  }, [prompt, negativePrompt, onRegenerate])

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="not-prose mb-4 w-full rounded-md border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 p-3">
        <div className="flex items-center gap-2">
          <PaletteIcon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        <ChevronDownIcon className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 border-t px-4 py-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Prompt</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={disabled}
            rows={3}
            className="w-full resize-none rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Negative Prompt</label>
          <textarea
            value={negativePrompt}
            onChange={e => setNegativePrompt(e.target.value)}
            disabled={disabled}
            rows={1}
            placeholder="ugly, low quality, blurry..."
            className="w-full resize-none rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>

        <div className="flex items-center gap-2">
          {onRegenerate && (
            <Button size="sm" variant="default" disabled={disabled} onClick={handleRegenerate}>
              <SendIcon className="mr-1 size-3" />
              重新生成
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleCopy}>
            {copied ? <CheckIcon className="mr-1 size-3" /> : <CopyIcon className="mr-1 size-3" />}
            {copied ? '已复制' : '复制'}
          </Button>
          {isModified && (
            <Button size="sm" variant="ghost" onClick={handleReset}>
              <RotateCcwIcon className="mr-1 size-3" />
              重置
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
```

关键设计:
- 无分号、单引号、2 空格缩进（antfu 风格）
- `interface` 定义 props，函数声明式组件
- `cn()` 合并样式，Collapsible 复用 shadcn/ui
- `disabled` 控制 textarea 和按钮（pendingTaskId 存在 或 非最后一条消息时）
- 复制按钮有 1.5s 反馈动画
- 重置按钮仅在内容被修改后显示

**Step 2: Commit**

```bash
git add components/chat/prompt-card.tsx
git commit -m "feat(ui): add PromptCard component for 3D prompt visibility and editing"
```

---

### Task 3: 更新消息渲染路由

**Files:**
- Modify: `components/chat/chat-message.tsx:1-6` (imports)
- Modify: `components/chat/chat-message.tsx:112-136` (generateMascot + retextureMascot branches)

**Step 1: 添加 import**

在 `chat-message.tsx` 顶部 imports 区域，在 `import { AnalysisCard } from './analysis-card'` 之后添加:

```tsx
import { PromptCard } from './prompt-card'
```

**Step 2: 合并 generateMascot/retextureMascot 渲染分支**

将 `chat-message.tsx:112-136` 的两个独立分支:

```tsx
// ModelPreview for generateMascot
if (toolName === 'generateMascot') {
  if (state === 'output-available' && output?.taskId) {
    return <ModelPreview key={`tool-${message.id}-${index}`} taskId={output.taskId as string} />
  }
}

// ... (OptionsButtons 中间不动)

// ModelPreview for retextureMascot (same rendering as generateMascot)
if (toolName === 'retextureMascot') {
  if (state === 'output-available' && output?.taskId) {
    return <ModelPreview key={`tool-${message.id}-${index}`} taskId={output.taskId as string} />
  }
}
```

替换为合并后的单个分支（放在 OptionsButtons 分支之后，原 retextureMascot 位置）:

```tsx
// PromptCard + ModelPreview for generateMascot / retextureMascot
if (toolName === 'generateMascot' || toolName === 'retextureMascot') {
  if (state === 'output-available' && output?.taskId) {
    return (
      <div key={`tool-${message.id}-${index}`} className="space-y-0">
        {output.prompt && (
          <PromptCard
            prompt={output.prompt as string}
            negativePrompt={output.negativePrompt as string | null | undefined}
            title={toolName === 'retextureMascot' ? '纹理重生成提示词' : '吉祥物生成提示词'}
            disabled={!isLast || isStreaming}
            onRegenerate={(p, np) => {
              onSendMessage?.(`请直接使用以下提示词重新生成吉祥物：\n\nprompt: ${p}${np ? `\nnegativePrompt: ${np}` : ''}`)
            }}
          />
        )}
        <ModelPreview taskId={output.taskId as string} />
      </div>
    )
  }
}
```

注意: 删除原来的两个独立分支（generateMascot 在 :112-116，retextureMascot 在 :131-136），用上面的合并版本替代。OptionsButtons 分支 (:119-128) 保持不动，合并分支放在其后面。

**Step 3: Commit**

```bash
git add components/chat/chat-message.tsx
git commit -m "feat(ui): render PromptCard above ModelPreview for mascot generation tools"
```

---

### Task 4: 验证

**Step 1: 类型检查**

运行: `pnpm tsc --noEmit`

预期: 无类型错误。

**Step 2: Lint**

运行: `pnpm eslint components/chat/prompt-card.tsx components/chat/chat-message.tsx app/api/chat/route.ts`

预期: 无 lint 错误（或仅 auto-fixable）。

**Step 3: 手动验证**

启动 dev server: `pnpm dev`

验证场景:
1. 新对话 → 输入生辰 → 排盘 → 分析 → 吉祥物讨论 → 生成模型
2. 确认 PromptCard 出现在 ModelPreview 上方
3. 折叠/展开正常
4. textarea 可编辑，复制按钮有反馈
5. 修改后出现重置按钮，点击重置恢复原始值
6. 模型生成中 textarea 和重新生成按钮 disabled
7. 点击重新生成发送结构化消息到对话
