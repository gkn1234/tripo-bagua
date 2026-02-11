// components/sidebar/session-item.tsx
'use client'

import type { Session } from '@/lib/persistence/chat-db'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SessionItemProps {
  session: Session
  isActive: boolean
  collapsed: boolean
  onClick: () => void
  onDelete: () => void
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function SessionItem({ session, isActive, collapsed, onClick, onDelete }: SessionItemProps) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex size-8 items-center justify-center rounded-md text-xs',
          isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50',
        )}
        title={session.title}
      >
        {session.title.charAt(0)}
      </button>
    )
  }

  return (
    <div
      className={cn(
        'group flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5',
        isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50',
      )}
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{session.title}</p>
        <p className="text-[10px] text-muted-foreground">{formatDate(session.updatedAt)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  )
}
