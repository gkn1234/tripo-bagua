'use client'

import { Box, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chat-store'

interface ModelPreviewProps {
  status: 'calling' | 'complete' | 'error'
  result?: string
}

export function ModelPreview({ status, result }: ModelPreviewProps) {
  const setModelUrl = useChatStore(state => state.setModelUrl)

  if (status === 'calling') {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/5 px-3 py-4">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="text-sm">正在生成 3D 模型...</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
        <span>3D 模型生成失败</span>
      </div>
    )
  }

  // status === 'complete'
  let modelUrl: string | undefined
  let renderedImage: string | undefined

  if (result) {
    try {
      const parsed = JSON.parse(result)
      if (parsed.success) {
        modelUrl = parsed.modelUrl
        renderedImage = parsed.renderedImage
      }
    }
    catch { /* ignore */ }
  }

  if (!modelUrl) return null

  return (
    <div className="mb-3 rounded-lg border border-border bg-card p-3">
      {/* Thumbnail area */}
      <div className="mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
        {renderedImage
          ? (
              <img
                src={renderedImage}
                alt="3D 模型预览"
                className="h-full w-full object-cover"
              />
            )
          : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Box className="size-8" />
                <span className="text-xs">3D 模型已生成</span>
              </div>
            )}
      </div>

      {/* Action button */}
      <div className="flex justify-center">
        <Button size="sm" onClick={() => setModelUrl(modelUrl!)}>
          查看 3D 模型
        </Button>
      </div>
    </div>
  )
}
