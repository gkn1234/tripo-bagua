// hooks/use-chat-session.ts
'use client'

import type { UIMessage } from 'ai'
import type { Session } from '@/lib/persistence/chat-db'
import type { AnalysisNote } from '@/lib/bazi/types'
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
    analysisNote: useChatStore.getState().analysisNote ?? undefined,
  }),
})

/** Remove incomplete tool-call parts (no output yet) to prevent MissingToolResultsError */
function sanitizeMessages(messages: UIMessage[]): UIMessage[] {
  return messages.reduce<UIMessage[]>((acc, msg) => {
    if (msg.role !== 'assistant') {
      acc.push(msg)
      return acc
    }
    const cleanParts = msg.parts.filter((part) => {
      if (!part.type.startsWith('tool-'))
        return true
      return 'state' in part && part.state === 'output-available'
    })
    if (cleanParts.length > 0)
      acc.push({ ...msg, parts: cleanParts })
    return acc
  }, [])
}

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

  // Keep a stable ref to chat.stop for use in callbacks
  const chatStopRef = useRef(chat.stop)
  chatStopRef.current = chat.stop

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

  // Sync analysisNote from AI tool results
  useEffect(() => {
    async function syncAnalysisNote() {
      const session = sessionRef.current
      if (!session) return

      const lastMsg = chat.messages[chat.messages.length - 1]
      if (lastMsg?.role !== 'assistant') return

      for (const part of lastMsg.parts) {
        if (part.type.startsWith('tool-') && 'toolCallId' in part) {
          const toolName = part.type.slice(5)
          if ((toolName === 'analyzeBazi' || toolName === 'deepAnalysis')
            && 'state' in part && part.state === 'output-available'
            && 'output' in part && part.output) {
            const output = part.output as Record<string, unknown>
            if (output.analysisNote) {
              const { saveAnalysisNote } = await import('@/lib/persistence/chat-db')
              const note: AnalysisNote = { ...(output.analysisNote as AnalysisNote), sessionId: session.id }
              await saveAnalysisNote(note)
              useChatStore.getState().setAnalysisNote(note)
            }
          }
        }
      }
    }
    syncAnalysisNote()
  }, [chat.messages])

  // Load latest session on mount
  useEffect(() => {
    async function init() {
      const { getLatestSession, getSessionMessages, getAnalysisNote } = await import('@/lib/persistence/chat-db')
      const latest = await getLatestSession()
      if (latest) {
        const msgs = sanitizeMessages(await getSessionMessages(latest.id))
        setInitialMessages(msgs)
        setCurrentSession(latest)
        setCurrentSessionId(latest.id)
        const note = await getAnalysisNote(latest.id)
        if (note) useChatStore.getState().setAnalysisNote(note)
      }
      else {
        const session = createSession()
        setCurrentSession(session)
        setCurrentSessionId(session.id)
        const { saveSession: save } = await import('@/lib/persistence/chat-db')
        await save(session, [])
      }
    }
    init()
  }, [setCurrentSessionId])

  const loadSession = useCallback(async (sessionId: string) => {
    // Stop active streaming and cancel pending save
    chatStopRef.current()
    clearTimeout(saveTimerRef.current)
    resetStore()
    const { getSessionMessages, listSessions, saveSession, getAnalysisNote } = await import('@/lib/persistence/chat-db')
    const sessions = await listSessions()
    const session = sessions.find(s => s.id === sessionId)
    if (!session)
      return
    const msgs = sanitizeMessages(await getSessionMessages(sessionId))
    const updated = { ...session, updatedAt: Date.now() }
    await saveSession(updated, msgs)
    setCurrentSessionId(updated.id)
    setCurrentSession(updated)
    setInitialMessages(msgs)
    const note = await getAnalysisNote(sessionId)
    useChatStore.getState().setAnalysisNote(note ?? null)
  }, [setCurrentSessionId, resetStore])

  const newSession = useCallback(async () => {
    chatStopRef.current()
    clearTimeout(saveTimerRef.current)
    resetStore()
    const session = createSession()
    setCurrentSessionId(session.id)
    setCurrentSession(session)
    setInitialMessages([])
    const { saveSession } = await import('@/lib/persistence/chat-db')
    await saveSession(session, [])
    useChatStore.getState().setAnalysisNote(null)
  }, [setCurrentSessionId, resetStore])

  return {
    ...chat,
    currentSession,
    loadSession,
    newSession,
  }
}
