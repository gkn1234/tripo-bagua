// components/sidebar/index.tsx
'use client'

import type { Session } from '@/lib/persistence/chat-db'
import { Menu, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useMobile } from '@/hooks/use-mobile'
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
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useChatStore()
  const [sessions, setSessions] = useState<Session[]>([])
  const isMobile = useMobile()

  const collapsed = !sidebarOpen

  // Close sidebar on mobile by default
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false)
    }
  }, [isMobile, setSidebarOpen])

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

  const handleSelectSession = useCallback((sessionId: string) => {
    onSelectSession(sessionId)
    if (isMobile) setSidebarOpen(false)
  }, [onSelectSession, isMobile, setSidebarOpen])

  const handleNewSession = useCallback(() => {
    onNewSession()
    if (isMobile) setSidebarOpen(false)
  }, [onNewSession, isMobile, setSidebarOpen])

  // Shared sidebar content (used in both mobile and desktop modes)
  const sidebarContent = (
    <>
      {/* Header */}
      <div className={cn('flex items-center gap-2 border-b border-sidebar-border p-2', !isMobile && collapsed && 'justify-center')}>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={isMobile ? () => setSidebarOpen(false) : toggleSidebar}>
          {isMobile ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
        {(isMobile || !collapsed) && (
          <span className="truncate text-sm font-semibold font-[var(--font-display)]">开运造物</span>
        )}
      </div>

      {/* New chat button */}
      <div className={cn('p-2', !isMobile && collapsed && 'flex justify-center')}>
        {!isMobile && collapsed
          ? (
              <Button variant="ghost" size="icon" className="size-8" onClick={handleNewSession} title="新对话">
                <Plus className="size-4" />
              </Button>
            )
          : (
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={handleNewSession}>
                <Plus className="size-4" />
                新对话
              </Button>
            )}
      </div>

      {/* Session list */}
      <div className={cn('flex-1 overflow-y-auto p-2', !isMobile && collapsed && 'flex flex-col items-center gap-1')}>
        {sessions.map(session => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === currentSessionId}
            collapsed={!isMobile && collapsed}
            onClick={() => handleSelectSession(session.id)}
            onDelete={() => handleDelete(session.id)}
          />
        ))}
      </div>

      {/* Footer: theme toggle */}
      <div className={cn('border-t border-sidebar-border p-2', !isMobile && collapsed && 'flex justify-center')}>
        {!isMobile && collapsed
          ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => {
                  document.documentElement.classList.toggle('dark')
                  const isDark = document.documentElement.classList.contains('dark')
                  localStorage.setItem('theme', isDark ? 'dark' : 'light')
                }}
              >
                <span className="text-xs">🌓</span>
              </Button>
            )
          : <ThemeToggle />}
      </div>
    </>
  )

  // Mobile: drawer overlay
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Drawer */}
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-300 safe-area-top',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {sidebarContent}
        </div>
      </>
    )
  }

  // Desktop / Tablet: inline sidebar
  return (
    <div
      className={cn(
        'hidden md:flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300',
        collapsed ? 'w-12' : 'w-60',
      )}
    >
      {sidebarContent}
    </div>
  )
}
