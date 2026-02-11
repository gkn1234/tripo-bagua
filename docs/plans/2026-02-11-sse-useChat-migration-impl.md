# SSE useChat Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hand-written SSE parsing (`use-mock-chat.ts`) with AI SDK's `useChat` hook, aligning frontend-backend protocol.

**Architecture:** Two-layer hook — `useChatSession` wraps `useChat` from `@ai-sdk/react`, adding IndexedDB persistence and session management. Sub-components updated to consume SDK's `UIMessagePart` types. Backend unchanged.

**Tech Stack:** `ai@6.0.78`, `@ai-sdk/react@3.0.80`, `@ai-sdk/deepseek`, Next.js 16, React 19, Zustand, IndexedDB (idb)

**Design doc:** `docs/plans/2026-02-11-sse-useChat-migration-design.md`

---

### Task 1: Update `chat-db.ts` to use SDK `UIMessage` type

This is the foundation — all other files depend on the message type stored here.

**Files:**
- Modify: `lib/persistence/chat-db.ts`

**Step 1: Update the message type import and interface**

Replace the custom `Message` import with SDK's `UIMessage`:

```typescript
// lib/persistence/chat-db.ts
import type { UIMessage } from 'ai'
import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

interface SessionMessages {
  sessionId: string
  messages: UIMessage[]
}
```

Update function signatures:

```typescript
export async function getSessionMessages(sessionId: string): Promise<UIMessage[]> {
  const db = await getDB()
  const record = await db.get('messages', sessionId)
  return record?.messages ?? []
}

export async function saveSession(session: Session, messages: UIMessage[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['sessions', 'messages'], 'readwrite')
  await tx.objectStore('sessions').put(session)
  await tx.objectStore('messages').put({ sessionId: session.id, messages })
  await tx.done
}
```

Everything else in the file stays the same.

**Step 2: Verify no type errors in this file**

Run: `npx tsc --noEmit lib/persistence/chat-db.ts 2>&1 | head -20`

This will have errors because `use-mock-chat.ts` still imports from this file. That's expected — we'll fix it in Task 2.

**Step 3: Commit**

```bash
git add lib/persistence/chat-db.ts
git commit -m "refactor(persistence): use SDK UIMessage type in chat-db"
```

---

### Task 2: Create `use-chat-session.ts` hook

The core new hook that wraps `useChat` and adds session persistence.

**Files:**
- Create: `hooks/use-chat-session.ts`

**Step 1: Create the hook**

```typescript
// hooks/use-chat-session.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { UIMessage } from 'ai'
import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/react'
import { useChatStore } from '@/stores/chat-store'
import type { Session } from '@/lib/persistence/chat-db'

function createSession(title = '新对话'): Session {
  const now = Date.now()
  return { id: crypto.randomUUID(), title, createdAt: now, updatedAt: now }
}

const transport = new DefaultChatTransport({ api: '/api/chat' })

export function useChatSession() {
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([])
  const setModelUrl = useChatStore(state => state.setModelUrl)
  const setCurrentSessionId = useChatStore(state => state.setCurrentSessionId)
  const resetStore = useChatStore(state => state.reset)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const chat = useChat({
    chatId: currentSession?.id,
    initialMessages,
    transport,
  })

  // Debounce save messages to IndexedDB
  useEffect(() => {
    if (!currentSession || chat.messages.length === 0) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const { saveSession } = await import('@/lib/persistence/chat-db')
      const firstUserMsg = chat.messages.find(m => m.role === 'user')
      const textPart = firstUserMsg?.parts.find(p => p.type === 'text')
      const title = (textPart && 'text' in textPart ? textPart.text : '').slice(0, 20) || '新对话'
      const updated = { ...currentSession, title, updatedAt: Date.now() }
      await saveSession(updated, chat.messages)
      setCurrentSession(updated)
    }, 300)
    return () => clearTimeout(saveTimerRef.current)
  }, [chat.messages, currentSession])

  // Detect modelUrl from generateMascot tool output
  useEffect(() => {
    const lastMsg = chat.messages.at(-1)
    if (!lastMsg || lastMsg.role !== 'assistant') return

    for (const part of lastMsg.parts) {
      if (
        part.type.startsWith('tool-')
        && 'toolCallId' in part
        && 'state' in part
        && part.state === 'output-available'
        && 'output' in part
      ) {
        const output = part.output as Record<string, unknown> | undefined
        if (output?.success && typeof output.modelUrl === 'string') {
          setModelUrl(output.modelUrl)
        }
      }
    }
  }, [chat.messages, setModelUrl])

  // Load latest session on mount
  useEffect(() => {
    async function init() {
      const { getLatestSession, getSessionMessages } = await import('@/lib/persistence/chat-db')
      const latest = await getLatestSession()
      if (latest) {
        const msgs = await getSessionMessages(latest.id)
        setInitialMessages(msgs)
        setCurrentSession(latest)
        setCurrentSessionId(latest.id)
      } else {
        const session = createSession()
        setCurrentSession(session)
        setCurrentSessionId(session.id)
      }
    }
    init()
  }, [setCurrentSessionId])

  const loadSession = useCallback(async (sessionId: string) => {
    const { getSessionMessages, listSessions } = await import('@/lib/persistence/chat-db')
    const sessions = await listSessions()
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return
    const msgs = await getSessionMessages(sessionId)
    setInitialMessages(msgs)
    setCurrentSession(session)
    setCurrentSessionId(session.id)
    resetStore()
  }, [setCurrentSessionId, resetStore])

  const newSession = useCallback(() => {
    const session = createSession()
    setInitialMessages([])
    setCurrentSession(session)
    setCurrentSessionId(session.id)
    resetStore()
  }, [setCurrentSessionId, resetStore])

  return {
    ...chat,
    currentSession,
    loadSession,
    newSession,
  }
}
```

**Step 2: Verify the file compiles**

Run: `npx tsc --noEmit hooks/use-chat-session.ts 2>&1 | head -20`

**Step 3: Commit**

```bash
git add hooks/use-chat-session.ts
git commit -m "feat(hooks): add useChatSession wrapping AI SDK useChat"
```

---

### Task 3: Update sub-components for SDK part types

Update the four sub-components that render message parts. These are independent of each other.

**Files:**
- Modify: `components/chat/reasoning-block.tsx`
- Modify: `components/chat/tool-status.tsx`
- Modify: `components/chat/model-preview.tsx`
- Modify: `components/chat/bagua-card.tsx`

**Step 1: Update `reasoning-block.tsx`**

No changes needed — it already takes `content: string` as a prop. The parent (`chat-message.tsx`) will pass the correct field. Interface stays the same.

**Step 2: Update `tool-status.tsx`**

Change props from custom status to SDK state:

```typescript
// components/chat/tool-status.tsx
'use client'

import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolStatusProps {
  name: string
  state: string
}

const TOOL_LABELS: Record<string, string> = {
  analyzeBazi: '分析八字',
  generateMascot: '生成 3D 模型',
}

export function ToolStatus({ name, state }: ToolStatusProps) {
  const label = TOOL_LABELS[name] || name
  const isLoading = state !== 'output-available' && state !== 'output-error'
  const isError = state === 'output-error'
  const isDone = state === 'output-available'

  return (
    <div
      className={cn(
        'mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
        isLoading && 'border-primary/50 bg-primary/5',
        isDone && 'border-green-500/50 bg-green-500/5',
        isError && 'border-destructive/50 bg-destructive/5',
      )}
    >
      {isLoading && (
        <Loader2 className="size-4 animate-spin text-primary" />
      )}
      {isDone && (
        <CheckCircle className="size-4 text-green-500" />
      )}
      {isError && (
        <AlertCircle className="size-4 text-destructive" />
      )}
      <span>
        {isLoading && `正在${label}...`}
        {isDone && `${label}完成`}
        {isError && `${label}失败`}
      </span>
    </div>
  )
}
```

**Step 3: Update `model-preview.tsx`**

Change from `status: string` + `result: string` to SDK tool output:

```typescript
// components/chat/model-preview.tsx
'use client'

import { Box, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chat-store'

interface ModelPreviewProps {
  state: string
  output?: Record<string, unknown>
}

export function ModelPreview({ state, output }: ModelPreviewProps) {
  const setModelUrl = useChatStore(state => state.setModelUrl)

  const isLoading = state !== 'output-available' && state !== 'output-error'

  if (isLoading) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/5 px-3 py-4">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="text-sm">正在生成 3D 模型...</span>
      </div>
    )
  }

  if (state === 'output-error') {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
        <span>3D 模型生成失败</span>
      </div>
    )
  }

  // state === 'output-available'
  const modelUrl = output?.modelUrl as string | undefined
  const renderedImage = output?.renderedImage as string | undefined

  if (!modelUrl) return null

  return (
    <div className="mb-3 rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
        {renderedImage
          ? (
              <img
                src={renderedImage}
                alt="3D 模型预览"
                className="h-full w-full object-cover"
              />
            )
          : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Box className="size-8" />
                <span className="text-xs">3D 模型已生成</span>
              </div>
            )}
      </div>
      <div className="flex justify-center">
        <Button size="sm" onClick={() => setModelUrl(modelUrl)}>
          查看 3D 模型
        </Button>
      </div>
    </div>
  )
}
```

**Step 4: `bagua-card.tsx` — no changes needed**

It already takes `data: BaziResult` as a prop. The parent will extract data from the tool output.

**Step 5: Commit**

```bash
git add components/chat/tool-status.tsx components/chat/model-preview.tsx
git commit -m "refactor(chat): update sub-components for SDK part types"
```

---

### Task 4: Update `chat-message.tsx` for SDK message types

The main message renderer that switches on part types.

**Files:**
- Modify: `components/chat/chat-message.tsx`

**Step 1: Rewrite chat-message.tsx**

```typescript
// components/chat/chat-message.tsx
'use client'

import type { UIMessage } from 'ai'
import { Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BaguaCard } from './bagua-card'
import { ModelPreview } from './model-preview'
import { ReasoningBlock } from './reasoning-block'
import { ToolStatus } from './tool-status'

interface ChatMessageProps {
  message: UIMessage
  isStreaming?: boolean
  onRegenerate?: () => void
}

export function ChatMessage({ message, isStreaming, onRegenerate }: ChatMessageProps) {
  const isUser = message.role === 'user'

  // Extract full text content for copy
  const textContent = message.parts
    .filter(p => p.type === 'text')
    .map(p => p.text)
    .join('')

  const handleCopy = () => {
    navigator.clipboard.writeText(textContent)
  }

  return (
    <div
      className={cn(
        'group mb-4',
        isUser && 'flex justify-end',
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-card',
        )}
      >
        {!isUser && message.parts.map((part, index) => {
          if (part.type === 'reasoning') {
            return (
              <ReasoningBlock
                key={`reasoning-${index}`}
                content={part.text}
                isStreaming={isStreaming}
              />
            )
          }

          // Tool parts have type 'tool-<toolName>'
          if (part.type.startsWith('tool-') && 'toolCallId' in part) {
            const toolName = part.type.slice(5) // remove 'tool-' prefix
            const state = 'state' in part ? (part.state as string) : 'input-available'
            const output = 'output' in part ? (part.output as Record<string, unknown>) : undefined

            // BaguaCard for completed analyzeBazi
            if (toolName === 'analyzeBazi' && state === 'output-available' && output) {
              if (output.success && output.data) {
                return (
                  <BaguaCard
                    key={`tool-${index}`}
                    data={output.data as import('@/lib/bazi/types').BaziResult}
                  />
                )
              }
            }

            // ModelPreview for generateMascot
            if (toolName === 'generateMascot') {
              return (
                <ModelPreview
                  key={`tool-${index}`}
                  state={state}
                  output={output}
                />
              )
            }

            return (
              <ToolStatus
                key={`tool-${index}`}
                name={toolName}
                state={state}
              />
            )
          }

          return null
        })}

        {/* Render text content */}
        {textContent && (
          <div className="whitespace-pre-wrap">{textContent}</div>
        )}

        {/* User message: just show text */}
        {isUser && (
          <div className="whitespace-pre-wrap">{textContent}</div>
        )}

        {!isUser && textContent && !isStreaming && (
          <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleCopy}
            >
              <Copy className="size-3.5" />
            </Button>
            {onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={onRegenerate}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add components/chat/chat-message.tsx
git commit -m "refactor(chat): update chat-message for SDK UIMessagePart types"
```

---

### Task 5: Update `chat-input.tsx` for new API

The `useChat` v6 uses `sendMessage({ text })` instead of `handleSubmit`. The input state is managed by the consumer, not the hook.

**Files:**
- Modify: `components/chat/chat-input.tsx`

**Step 1: Update ChatInput props**

The props interface changes: `onSubmit` now takes a `string` argument (the text to send), and accepts `ChatStatus` instead of `isLoading`:

```typescript
// components/chat/chat-input.tsx
'use client'

import { Send } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ChatInputProps {
  onSend: (text: string) => void
  isLoading?: boolean
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [value, setValue] = useState('')

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!value.trim() || isLoading) return
    onSend(value)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入您的出生日期，开始八字分析..."
        className="min-h-[44px] max-h-32 resize-none"
        rows={1}
        disabled={isLoading}
      />
      <Button
        type="submit"
        size="icon"
        disabled={!value.trim() || isLoading}
        className="shrink-0"
      >
        <Send className="size-4" />
      </Button>
    </form>
  )
}
```

**Step 2: Commit**

```bash
git add components/chat/chat-input.tsx
git commit -m "refactor(chat): simplify ChatInput with self-managed input state"
```

---

### Task 6: Update `components/chat/index.tsx` to use `useChatSession`

Wire everything together — replace `useMockChat` with `useChatSession`.

**Files:**
- Modify: `components/chat/index.tsx`

**Step 1: Rewrite the Chat component**

```typescript
// components/chat/index.tsx
'use client'

import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useChatSession } from '@/hooks/use-chat-session'
import { ChatEmpty } from './chat-empty'
import { ChatInput } from './chat-input'
import { ChatMessage } from './chat-message'

export function Chat() {
  const {
    messages,
    sendMessage,
    regenerate,
    status,
    currentSession,
    loadSession,
    newSession,
  } = useChatSession()
  const scrollRef = useRef<HTMLDivElement>(null)

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = (text: string) => {
    sendMessage({ text })
  }

  return {
    currentSession,
    loadSession,
    newSession,
    ui: (
      <div className="flex h-full flex-col overflow-hidden">
        <ScrollArea ref={scrollRef} className="min-h-0 flex-1 p-4">
          {messages.length === 0
            ? <ChatEmpty />
            : messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isStreaming={isLoading && index === messages.length - 1}
                  onRegenerate={message.role === 'assistant' ? regenerate : undefined}
                />
              ))}
        </ScrollArea>
        <div className="border-t border-border p-4">
          <ChatInput
            onSend={handleSend}
            isLoading={isLoading}
          />
        </div>
      </div>
    ),
  }
}
```

**Step 2: Commit**

```bash
git add components/chat/index.tsx
git commit -m "refactor(chat): switch to useChatSession hook"
```

---

### Task 7: Delete `use-mock-chat.ts` and verify build

**Files:**
- Delete: `hooks/use-mock-chat.ts`

**Step 1: Delete the old hook**

```bash
rm hooks/use-mock-chat.ts
```

**Step 2: Search for any remaining references**

Run: `grep -r "use-mock-chat\|useMockChat" --include="*.ts" --include="*.tsx" .`

Expected: No output. If there are hits, update those files to remove the import.

**Step 3: Run the build**

Run: `npm run build`

Expected: Build succeeds with no type errors.

If there are errors, fix them before proceeding.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove use-mock-chat, migration to useChat complete"
```

---

### Task 8: Smoke test

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Verify in browser**

Open `http://localhost:3000` and verify:
1. Chat page loads without console errors
2. Empty state shows correctly
3. Type a message and press Enter — message appears in chat
4. If API keys are configured: assistant responds with streaming text
5. No references to "mock" in the UI or console

**Step 3: Run existing tests**

Run: `npx vitest run`

Expected: All existing tests pass (bazi tests are unaffected by this migration).
