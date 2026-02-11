// components/chat/chat-message.tsx
'use client'

import type { UIMessage } from 'ai'
import type { BaziResult } from '@/lib/bazi/types'
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

  // Extract full text content
  const textContent = message.parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
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
          // Text parts are rendered separately below the parts loop
          if (part.type === 'text')
            return null

          if (part.type === 'reasoning') {
            return (
              <ReasoningBlock
                key={`reasoning-${index}`}
                content={part.text}
                isStreaming={isStreaming}
              />
            )
          }

          // Tool parts: type is 'tool-<toolName>'
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
                    data={output.data as BaziResult}
                  />
                )
              }
            }

            // ModelPreview for generateMascot
            if (toolName === 'generateMascot') {
              if (state === 'output-available' && output?.taskId) {
                return <ModelPreview key={`tool-${index}`} taskId={output.taskId as string} />
              }
              return <ToolStatus key={`tool-${index}`} name={toolName} state={state} />
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

        <div className="whitespace-pre-wrap">{textContent}</div>

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
