'use client'

import type { Message } from '@/hooks/use-mock-chat'
import { Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ReasoningBlock } from './reasoning-block'
import { ToolStatus } from './tool-status'

interface ChatMessageProps {
  message: Message
  isStreaming?: boolean
  onRegenerate?: () => void
}

export function ChatMessage({ message, isStreaming, onRegenerate }: ChatMessageProps) {
  const isUser = message.role === 'user'

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
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
          if (part.type === 'reasoning' && part.content) {
            return (
              <ReasoningBlock
                key={`reasoning-${index}`}
                content={part.content}
                isStreaming={isStreaming}
              />
            )
          }
          if (part.type === 'tool-call' && part.name && part.status) {
            return (
              <ToolStatus
                key={`tool-${index}`}
                name={part.name}
                status={part.status}
                result={part.result}
              />
            )
          }
          return null
        })}

        <div className="whitespace-pre-wrap">{message.content}</div>

        {!isUser && message.content && !isStreaming && (
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
