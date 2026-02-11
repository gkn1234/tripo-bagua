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
    id: currentSession?.id,
    messages: initialMessages,
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
