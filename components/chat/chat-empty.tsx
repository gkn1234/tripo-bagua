'use client'

import { Sparkles } from 'lucide-react'

export function ChatEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
      <Sparkles className="mb-4 size-12 text-primary/50" />
      <p className="text-lg">开始对话，输入你的出生日期</p>
    </div>
  )
}
