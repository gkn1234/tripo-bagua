# SSE Stream Protocol Migration: useMockChat → useChat

## Goal

Replace hand-written SSE parsing (`use-mock-chat.ts`) with Vercel AI SDK's `useChat` hook. Ensure frontend-backend protocol alignment. Eliminate the "mock" naming.

## Architecture

Two-layer separation:

```
useChatSession (hooks/use-chat-session.ts)
├─ Session management: load / new / switch
├─ Persistence: debounced IndexedDB writes
└─ Delegates to ↓

useChat (@ai-sdk/react)
├─ SSE streaming (DefaultChatTransport)
├─ Message parsing (standard parts format)
└─ POST /api/chat ← backend unchanged
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `hooks/use-mock-chat.ts` | Delete | Fully replaced |
| `hooks/use-chat-session.ts` | Create | Wrapper hook: persistence + session management |
| `components/chat/index.tsx` | Modify | Switch from `useMockChat` to `useChatSession` |
| `components/chat/chat-message.tsx` | Modify | Align with SDK `UIMessagePart` types |
| `components/chat/bagua-card.tsx` | Modify | Data source from `toolInvocation.output` |
| `components/chat/model-preview.tsx` | Modify | Data source from `toolInvocation.output` |
| `components/chat/tool-status.tsx` | Modify | Status mapping: `state` instead of `status` |
| `components/chat/reasoning-block.tsx` | Modify | `.reasoning` instead of `.content` |
| `lib/persistence/chat-db.ts` | Modify | Store `UIMessage` format instead of custom `Message` |
| `app/api/chat/route.ts` | No change | Already uses `streamText` + `toUIMessageStreamResponse()` |

## useChatSession Hook Design

```typescript
export function useChatSession() {
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([])

  const chat = useChat({
    chatId: currentSession?.id,
    initialMessages,
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })

  // Persistence: watch messages, debounce save to IndexedDB
  useEffect(() => {
    if (!currentSession) return
    debounce(() => saveSession(currentSession, chat.messages), 300)
  }, [chat.messages, currentSession])

  // Model URL detection: extract from generateMascot tool output
  useEffect(() => {
    const lastMsg = chat.messages.at(-1)
    if (lastMsg?.role !== 'assistant') return
    const mascotPart = lastMsg.parts.find(
      p => p.type === 'tool-invocation'
        && p.toolInvocation.toolName === 'generateMascot'
        && p.toolInvocation.state === 'output-available'
    )
    if (mascotPart) {
      const output = mascotPart.toolInvocation.output
      if (output?.success && output.modelUrl) setModelUrl(output.modelUrl)
    }
  }, [chat.messages])

  // Session operations
  async function loadSession(sessionId: string) { /* load from IndexedDB, set initialMessages, switch chatId */ }
  function newSession() { /* create session, clear initialMessages */ }

  // Mount: load latest session or create new
  useEffect(() => { loadLatestOrCreate() }, [])

  return { ...chat, currentSession, loadSession, newSession }
}
```

Key decisions:
- `chatId` bound to `currentSession.id` — SDK auto-resets on session switch
- Persistence via `useEffect` watching `chat.messages` — covers all message types
- Return value spreads `useChat` return + session operations — minimal API change for consumers

## Message Format Alignment

```
Custom MessagePart              →  AI SDK UIMessagePart
────────────────────────────────────────────────────────
{ type: 'text',                 →  { type: 'text',
  content: string }             →    text: string }

{ type: 'reasoning',            →  { type: 'reasoning',
  content: string }             →    reasoning: string }

{ type: 'tool-call',            →  { type: 'tool-invocation',
  name: string,                 →    toolInvocation: {
  status: 'calling'|'complete', →      toolName: string,
  result: string }              →      toolCallId: string,
                                →      state: 'call'|'output-available',
                                →      input: object,
                                →      output: object } }
```

## Backend

No changes required. Current `route.ts` already uses:
- `streamText()` + `toUIMessageStreamResponse()` → standard SSE format
- `convertToModelMessages()` → accepts standard `UIMessage` input
- `tool()` definitions → SDK handles tool calling protocol

`useChat` + `DefaultChatTransport` is the native consumer of this format.

## Data Persistence

- `chat-db.ts` stores `UIMessage[]` (SDK type) instead of custom `Message[]`
- No migration needed — product has no existing user data
