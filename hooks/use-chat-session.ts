// hooks/use-chat-session.ts
'use client'

import type { UIMessage } from 'ai'
import type { Session } from '@/lib/persistence/chat-db'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'

function createSession(title = '新对话'): Session {
  const now = Date.now()
  return { id: crypto.randomUUID(), title, createdAt: now, updatedAt: now }
}

const transport = new DefaultChatTransport({
  api: '/api/chat',
  body: () => ({
    pendingTaskId: useChatStore.getState().pendingTaskId ?? undefined,
  }),
})

export function useChatSession() {
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([])
  const setCurrentSessionId = useChatStore(state => state.setCurrentSessionId)
  const resetStore = useChatStore(state => state.reset)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = currentSession

  const chat = useChat({
    id: currentSession?.id,
    messages: initialMessages,
    transport,
  })

  // Debounce save messages to IndexedDB
  useEffect(() => {
    const session = sessionRef.current
    if (!session || chat.messages.length === 0)
      return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const { saveSession } = await import('@/lib/persistence/chat-db')
      const firstUserMsg = chat.messages.find(m => m.role === 'user')
      const textPart = firstUserMsg?.parts.find(p => p.type === 'text')
      const title = (textPart && 'text' in textPart ? textPart.text : '').slice(0, 20) || '新对话'
      const updated = { ...session, title, updatedAt: Date.now() }
      await saveSession(updated, chat.messages)
      setCurrentSession(updated)
    }, 300)
    return () => clearTimeout(saveTimerRef.current)
  }, [chat.messages])

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
      }
      else {
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
    if (!session)
      return
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
