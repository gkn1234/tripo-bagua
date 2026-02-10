'use client'

import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (e?: React.FormEvent) => void
  isLoading?: boolean
}

export function ChatInput({ value, onChange, onSubmit, isLoading }: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入您的出生日期，开始八字分析..."
        className="min-h-[44px] max-h-32 resize-none"
        rows={1}
        disabled={isLoading}
      />
      <Button
        type="submit"
        size="icon"
        disabled={!value.trim() || isLoading}
        className="shrink-0"
      >
        <Send className="size-4" />
      </Button>
    </form>
  )
}
