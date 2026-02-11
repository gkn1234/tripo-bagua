// components/sidebar/index.tsx
'use client'

import type { Session } from '@/lib/persistence/chat-db'
import { Menu, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/stores/chat-store'
import { SessionItem } from './session-item'
import { ThemeToggle } from './theme-toggle'

interface SidebarProps {
  currentSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
}

export function Sidebar({ currentSessionId, onSelectSession, onNewSession }: SidebarProps) {
  const { sidebarOpen, toggleSidebar, phase } = useChatStore()
  const [sessions, setSessions] = useState<Session[]>([])

  // Auto-collapse in split mode
  const collapsed = !sidebarOpen || phase === 'split'

  const loadSessions = useCallback(async () => {
    const { listSessions } = await import('@/lib/persistence/chat-db')
    const list = await listSessions()
    setSessions(list)
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions, currentSessionId])

  const handleDelete = useCallback(async (sessionId: string) => {
    const { deleteSession } = await import('@/lib/persistence/chat-db')
    await deleteSession(sessionId)
    await loadSessions()
    if (sessionId === currentSessionId) {
      onNewSession()
    }
  }, [currentSessionId, loadSessions, onNewSession])

  return (
    <div
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300',
        collapsed ? 'w-12' : 'w-60',
      )}
    >
      {/* Header */}
      <div className={cn('flex items-center gap-2 border-b border-sidebar-border p-2', collapsed && 'justify-center')}>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={toggleSidebar}>
          <Menu className="size-4" />
        </Button>
        {!collapsed && (
          <span className="truncate text-sm font-semibold font-[var(--font-display)]">Tripo Bagua</span>
        )}
      </div>

      {/* New chat button */}
      <div className={cn('p-2', collapsed && 'flex justify-center')}>
        {collapsed
          ? (
              <Button variant="ghost" size="icon" className="size-8" onClick={onNewSession} title="新对话">
                <Plus className="size-4" />
              </Button>
            )
          : (
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onNewSession}>
                <Plus className="size-4" />
                新对话
              </Button>
            )}
      </div>

      {/* Session list */}
      <div className={cn('flex-1 overflow-y-auto p-2', collapsed && 'flex flex-col items-center gap-1')}>
        {sessions.map(session => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === currentSessionId}
            collapsed={collapsed}
            onClick={() => onSelectSession(session.id)}
            onDelete={() => handleDelete(session.id)}
          />
        ))}
      </div>

      {/* Footer: theme toggle */}
      <div className={cn('border-t border-sidebar-border p-2', collapsed && 'flex justify-center')}>
        {collapsed
          ? (
              <Button variant="ghost" size="icon" className="size-8" onClick={() => {
                document.documentElement.classList.toggle('dark')
                const isDark = document.documentElement.classList.contains('dark')
                localStorage.setItem('theme', isDark ? 'dark' : 'light')
              }}>
                <span className="text-xs">🌓</span>
              </Button>
            )
          : <ThemeToggle />}
      </div>
    </div>
  )
}
