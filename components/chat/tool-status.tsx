'use client'

import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolStatusProps {
  name: string
  status: 'calling' | 'complete' | 'error'
  result?: string
}

const TOOL_LABELS: Record<string, string> = {
  generate_3d_model: '生成 3D 模型',
  analyze_bazi: '分析八字',
}

export function ToolStatus({ name, status, result }: ToolStatusProps) {
  const label = TOOL_LABELS[name] || name

  return (
    <div
      className={cn(
        'mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
        status === 'calling' && 'border-primary/50 bg-primary/5',
        status === 'complete' && 'border-green-500/50 bg-green-500/5',
        status === 'error' && 'border-destructive/50 bg-destructive/5',
      )}
    >
      {status === 'calling' && (
        <Loader2 className="size-4 animate-spin text-primary" />
      )}
      {status === 'complete' && (
        <CheckCircle className="size-4 text-green-500" />
      )}
      {status === 'error' && (
        <AlertCircle className="size-4 text-destructive" />
      )}
      <span>
        {status === 'calling' && `正在${label}...`}
        {status === 'complete' && `${label}完成`}
        {status === 'error' && `${label}失败`}
      </span>
      {result && status === 'complete' && (
        <span className="ml-auto text-xs text-muted-foreground">
          查看结果 →
        </span>
      )}
    </div>
  )
}
