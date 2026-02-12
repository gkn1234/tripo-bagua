// components/chat/index.tsx
'use client'

import { useChatSession } from '@/hooks/use-chat-session'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input'
import { ChatMessage } from './chat-message'

export function Chat() {
  const {
    messages,
    sendMessage,
    regenerate,
    status,
    stop,
    currentSession,
    loadSession,
    newSession,
  } = useChatSession()

  const isLoading = status === 'submitted' || status === 'streaming'

  return {
    currentSession,
    loadSession,
    newSession,
    ui: (
      <div className="flex h-full flex-col overflow-hidden">
        <Conversation className="min-h-0 flex-1">
          <ConversationContent>
            {messages.length === 0
              ? (
                  <ConversationEmptyState
                    title="开始对话"
                    description="输入你的出生日期，开始八字分析"
                  />
                )
              : messages.map((message, index) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isLast={index === messages.length - 1}
                    isStreaming={isLoading}
                    onRegenerate={message.role === 'assistant' ? regenerate : undefined}
                  />
                ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-border p-4">
          <PromptInput
            onSubmit={({ text }) => {
              if (text.trim()) {
                sendMessage({ text })
              }
            }}
          >
            <PromptInputTextarea
              placeholder="输入您的出生日期，开始八字分析..."
              disabled={isLoading}
            />
            <PromptInputFooter>
              <div />
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    ),
  }
}
