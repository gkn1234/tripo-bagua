// components/chat/chat-message.tsx
'use client'

import type { UIMessage } from 'ai'
import type { AnalysisProgress, BaziResult } from '@/lib/bazi/types'
import { CopyIcon, RefreshCwIcon } from 'lucide-react'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import {
  Tool,
  ToolHeader,
} from '@/components/ai-elements/tool'
import { AnalysisCard } from './analysis-card'
import { BaguaCard } from './bagua-card'
import { ModelPreview } from './model-preview'
import { OptionsButtons } from './options-buttons'
import { PromptCard } from './prompt-card'

const TOOL_TITLES: Record<string, string> = {
  analyzeBazi: '分析八字',
  deepAnalysis: '深入分析',
  generateMascot: '生成 3D 模型',
  retextureMascot: '重新生成纹理',
  presentOptions: '选择',
}

interface ChatMessageProps {
  message: UIMessage
  isLast?: boolean
  isStreaming?: boolean
  onRegenerate?: () => void
  onSendMessage?: (text: string) => void
}

export function ChatMessage({ message, isLast, isStreaming, onRegenerate, onSendMessage }: ChatMessageProps) {
  const textContent = message.parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('')

  const handleCopy = () => {
    navigator.clipboard.writeText(textContent)
  }

  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts.map((part, index) => {
          if (part.type === 'text') {
            return (
              <MessageResponse key={`text-${message.id}-${index}`}>
                {part.text}
              </MessageResponse>
            )
          }

          if (part.type === 'reasoning') {
            return (
              <Reasoning
                key={`reasoning-${message.id}-${index}`}
                isStreaming={isStreaming && isLast}
              >
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            )
          }

          // Tool parts: type is 'tool-<toolName>'
          if (part.type.startsWith('tool-') && 'toolCallId' in part) {
            const toolName = part.type.slice(5)
            const state = 'state' in part ? (part.state as string) : 'input-available'
            const output = 'output' in part ? (part.output as Record<string, unknown>) : undefined

            // BaguaCard for completed analyzeBazi
            if (toolName === 'analyzeBazi' && state === 'output-available' && output) {
              if (output.success && output.data) {
                return (
                  <BaguaCard
                    key={`tool-${message.id}-${index}`}
                    data={output.data as BaziResult}
                    gender={output.gender as 0 | 1 | undefined}
                  />
                )
              }
            }

            // AnalysisCard for deepAnalysis (streaming + completed)
            if (toolName === 'deepAnalysis') {
              if (output) {
                const preliminary = 'preliminary' in part ? Boolean(part.preliminary) : false
                const input = 'input' in part ? (part.input as Record<string, unknown>) : undefined
                const question = input?.question as string | undefined
                return (
                  <AnalysisCard
                    key={`tool-${message.id}-${index}`}
                    progress={output as unknown as AnalysisProgress}
                    state={state}
                    preliminary={preliminary}
                    question={question}
                  />
                )
              }
            }

            // OptionsButtons for presentOptions (execute returns options, hasToolCall stops the loop)
            if (toolName === 'presentOptions' && state === 'output-available' && output?.options) {
              return (
                <OptionsButtons
                  key={`tool-${message.id}-${index}`}
                  options={output.options as { label: string, description?: string }[]}
                  onSelect={(label) => { onSendMessage?.(label) }}
                  disabled={!isLast || isStreaming}
                />
              )
            }

            // PromptCard + ModelPreview for generateMascot / retextureMascot
            if (toolName === 'generateMascot' || toolName === 'retextureMascot') {
              if (state === 'output-available' && output?.taskId) {
                return (
                  <div key={`tool-${message.id}-${index}`} className="space-y-0">
                    {typeof output.prompt === 'string' && (
                      <PromptCard
                        prompt={output.prompt as string}
                        negativePrompt={output.negativePrompt as string | null | undefined}
                        title={toolName === 'retextureMascot' ? '纹理重生成提示词' : '吉祥物生成提示词'}
                        disabled={isStreaming}
                        onRegenerate={(p, np) => {
                          onSendMessage?.(`请直接使用以下提示词重新生成吉祥物：\n\nprompt: ${p}${np ? `\nnegativePrompt: ${np}` : ''}`)
                        }}
                      />
                    )}
                    <ModelPreview taskId={output.taskId as string} />
                  </div>
                )
              }
            }

            return (
              <Tool key={`tool-${message.id}-${index}`}>
                <ToolHeader
                  type={part.type as `tool-${string}`}
                  state={state as 'input-available'}
                  title={TOOL_TITLES[toolName]}
                />
              </Tool>
            )
          }

          return null
        })}
      </MessageContent>

      {message.role === 'assistant' && textContent && !isStreaming && (
        <MessageToolbar>
          <MessageActions>
            <MessageAction tooltip="复制" onClick={handleCopy}>
              <CopyIcon className="size-4" />
            </MessageAction>
            {onRegenerate && (
              <MessageAction tooltip="重新生成" onClick={onRegenerate}>
                <RefreshCwIcon className="size-4" />
              </MessageAction>
            )}
          </MessageActions>
        </MessageToolbar>
      )}
    </Message>
  )
}
