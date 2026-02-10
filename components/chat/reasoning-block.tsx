'use client'

import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ReasoningBlockProps {
  content: string
  isStreaming?: boolean
}

export function ReasoningBlock({ content, isStreaming = false }: ReasoningBlockProps) {
  const [isExpanded, setIsExpanded] = useState(isStreaming)

  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <Brain className="size-4" />
        <span>{isStreaming ? '思考中...' : '思考过程'}</span>
        {isExpanded
          ? (
              <ChevronDown className="ml-auto size-4" />
            )
          : (
              <ChevronRight className="ml-auto size-4" />
            )}
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isExpanded ? 'max-h-96' : 'max-h-0',
        )}
      >
        <div className="border-t border-border px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap">
          {content}
        </div>
      </div>
    </div>
  )
}
