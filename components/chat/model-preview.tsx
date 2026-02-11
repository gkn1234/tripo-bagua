'use client'

import { useEffect, useState } from 'react'
import { Box, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chat-store'
import type { TripoTask } from '@/lib/tripo'

interface ModelPreviewProps {
  taskId: string
}

export function ModelPreview({ taskId }: ModelPreviewProps) {
  const [task, setTask] = useState<TripoTask | null>(null)
  const setModelUrl = useChatStore(s => s.setModelUrl)
  const setPendingTaskId = useChatStore(s => s.setPendingTaskId)

  useEffect(() => {
    let cancelled = false
    setPendingTaskId(taskId)

    const poll = async () => {
      try {
        const res = await fetch(`/api/tripo/task/${taskId}`)
        if (cancelled) return
        if (!res.ok) {
          setPendingTaskId(null)
          clearInterval(interval)
          return
        }
        const data: TripoTask = await res.json()
        setTask(data)

        if (data.status === 'success') {
          setPendingTaskId(null)
          clearInterval(interval)
          if (data.output?.model) setModelUrl(data.output.model)
        }
        if (data.status === 'failed') {
          setPendingTaskId(null)
          clearInterval(interval)
        }
      } catch {
        if (!cancelled) setPendingTaskId(null)
      }
    }

    poll() // immediate first poll
    const interval = setInterval(() => {
      if (!cancelled) poll()
    }, 3000)

    return () => {
      cancelled = true
      clearInterval(interval)
      setPendingTaskId(null)
    }
  }, [taskId, setModelUrl, setPendingTaskId])

  // Failed state
  if (task?.status === 'failed') {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
        <span>3D 模型生成失败</span>
      </div>
    )
  }

  // Success state
  if (task?.status === 'success') {
    const renderedImage = task.output?.rendered_image

    return (
      <div className="mb-3 rounded-lg border border-border bg-card p-3">
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
        <div className="flex justify-center">
          <Button size="sm" onClick={() => task.output?.model && setModelUrl(task.output.model)}>
            查看 3D 模型
          </Button>
        </div>
      </div>
    )
  }

  // Pending / running state (default)
  const progress = task?.progress ?? 0

  return (
    <div className="mb-3 rounded-lg border border-primary/50 bg-primary/5 px-3 py-4">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="text-sm">正在生成 3D 模型...</span>
        <span className="ml-auto text-xs text-muted-foreground">{progress}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/20">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
