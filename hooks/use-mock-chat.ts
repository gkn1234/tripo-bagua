// hooks/use-mock-chat.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import type { Session } from '@/lib/persistence/chat-db'

export interface MessagePart {
  type: 'text' | 'reasoning' | 'tool-call'
  content?: string
  name?: string
  status?: 'calling' | 'complete' | 'error'
  result?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts: MessagePart[]
  createdAt: Date
}

function createSession(title = '新对话'): Session {
  const now = Date.now()
  return { id: crypto.randomUUID(), title, createdAt: now, updatedAt: now }
}

export function useMockChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [input, setInput] = useState('')
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const setModelUrl = useChatStore(state => state.setModelUrl)
  const setCurrentSessionId = useChatStore(state => state.setCurrentSessionId)
  const resetStore = useChatStore(state => state.reset)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Load latest session on mount
  useEffect(() => {
    async function init() {
      const { getLatestSession, getSessionMessages } = await import('@/lib/persistence/chat-db')
      const latest = await getLatestSession()
      if (latest) {
        setCurrentSession(latest)
        setCurrentSessionId(latest.id)
        const msgs = await getSessionMessages(latest.id)
        setMessages(msgs.map(m => ({ ...m, createdAt: new Date(m.createdAt) })))
      } else {
        const session = createSession()
        setCurrentSession(session)
        setCurrentSessionId(session.id)
      }
    }
    init()
  }, [setCurrentSessionId])

  // Debounce save messages to IndexedDB
  useEffect(() => {
    if (!currentSession) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const { saveSession } = await import('@/lib/persistence/chat-db')
      const title = messages.find(m => m.role === 'user')?.content.slice(0, 20) || '新对话'
      const updated = { ...currentSession, title, updatedAt: Date.now() }
      await saveSession(updated, messages)
      setCurrentSession(updated)
    }, 300)
    return () => clearTimeout(saveTimerRef.current)
  }, [messages, currentSession])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading)
      return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      parts: [{ type: 'text', content }],
      createdAt: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      parts: [],
      createdAt: new Date(),
    }

    setMessages(prev => [...prev, assistantMessage])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] }),
      })

      const reader = response.body?.getReader()
      if (!reader)
        return

      const decoder = new TextDecoder()
      let textContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: '))
            continue
          const data = line.slice(6)
          if (data === '[DONE]')
            continue

          try {
            const parsed = JSON.parse(data)

            if (parsed.type === 'model-ready') {
              setTimeout(() => setModelUrl(parsed.url), 0)
              continue
            }

            if (parsed.type === 'text-delta') {
              textContent += parsed.content
            }

            setMessages((prev) => {
              const updated = [...prev]
              const lastMsg = updated[updated.length - 1]
              if (lastMsg.role !== 'assistant')
                return prev

              if (parsed.type === 'text-delta') {
                lastMsg.content = textContent
                const textPartIndex = lastMsg.parts.findIndex(p => p.type === 'text')
                if (textPartIndex >= 0) {
                  lastMsg.parts[textPartIndex].content = textContent
                }
                else {
                  lastMsg.parts.push({ type: 'text', content: textContent })
                }
              }
              else if (parsed.type === 'reasoning') {
                lastMsg.parts = [
                  { type: 'reasoning', content: parsed.content },
                  ...lastMsg.parts.filter(p => p.type !== 'reasoning'),
                ]
              }
              else if (parsed.type === 'tool-call') {
                const existingIndex = lastMsg.parts.findIndex(
                  p => p.type === 'tool-call' && p.name === parsed.name,
                )
                const toolPart: MessagePart = {
                  type: 'tool-call',
                  name: parsed.name,
                  status: parsed.status,
                  result: parsed.result,
                }
                if (existingIndex >= 0) {
                  lastMsg.parts[existingIndex] = toolPart
                }
                else {
                  lastMsg.parts.push(toolPart)
                }
              }

              return updated
            })
          }
          catch {
            // ignore parse errors
          }
        }
      }
    }
    catch (error) {
      console.error('Chat error:', error)
    }
    finally {
      setIsLoading(false)
    }
  }, [isLoading, messages, setModelUrl])

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    sendMessage(input)
  }, [input, sendMessage])

  const reload = useCallback(() => {
    if (isLoading) return
    const lastUserIndex = messages.findLastIndex(m => m.role === 'user')
    if (lastUserIndex === -1) return
    const lastUserContent = messages[lastUserIndex].content
    setMessages(prev => prev.slice(0, lastUserIndex + 1))
    setTimeout(() => sendMessage(lastUserContent), 0)
  }, [isLoading, messages, sendMessage])

  const loadSession = useCallback(async (sessionId: string) => {
    const { getSessionMessages, listSessions } = await import('@/lib/persistence/chat-db')
    const sessions = await listSessions()
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return
    setCurrentSession(session)
    setCurrentSessionId(session.id)
    resetStore()
    const msgs = await getSessionMessages(sessionId)
    setMessages(msgs.map(m => ({ ...m, createdAt: new Date(m.createdAt) })))
  }, [setCurrentSessionId, resetStore])

  const newSession = useCallback(() => {
    const session = createSession()
    setCurrentSession(session)
    setCurrentSessionId(session.id)
    setMessages([])
    setInput('')
    resetStore()
  }, [setCurrentSessionId, resetStore])

  return {
    messages,
    input,
    setInput,
    isLoading,
    handleSubmit,
    reload,
    currentSession,
    loadSession,
    newSession,
  }
}
