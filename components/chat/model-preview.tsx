'use client'

import type { TripoTask } from '@/lib/tripo'
import { Box, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chat-store'

interface ModelPreviewProps {
  taskId: string
}

function proxyUrl(url: string) {
  return `/api/tripo/proxy?url=${encodeURIComponent(url)}`
}

export function ModelPreview({ taskId }: ModelPreviewProps) {
  const [task, setTask] = useState<TripoTask | null>(null)
  const setModelUrl = useChatStore(s => s.setModelUrl)
  const setPendingTaskId = useChatStore(s => s.setPendingTaskId)

  useEffect(() => {
    let cancelled = false
    let interval: ReturnType<typeof setInterval>
    setPendingTaskId(taskId)

    const poll = async () => {
      try {
        const res = await fetch(`/api/tripo/task/${taskId}`)
        if (cancelled)
          return
        if (!res.ok) {
          setPendingTaskId(null)
          clearInterval(interval)
          return
        }
        const data: TripoTask = await res.json()
        console.warn('[ModelPreview] poll result:', { taskId, status: data.status, progress: data.progress, output: data.output })
        setTask(data)

        if (data.status === 'success') {
          clearInterval(interval)
          const pendingId = useChatStore.getState().pendingTaskId
          console.warn('[ModelPreview] success guard:', { pendingId, taskId, match: pendingId === taskId, pbr_model: data.output?.pbr_model })
          // Guard: only set modelUrl if this task is still the active one
          // (resetStore() clears pendingTaskId on session switch)
          if (data.output?.pbr_model && pendingId === taskId) {
            const url = proxyUrl(data.output.pbr_model)
            console.warn('[ModelPreview] calling setModelUrl:', url)
            setModelUrl(url)
          }
          setPendingTaskId(null)
        }
        if (data.status === 'failed') {
          setPendingTaskId(null)
          clearInterval(interval)
        }
      }
      catch {
        if (!cancelled)
          setPendingTaskId(null)
      }
    }

    poll() // immediate first poll
    interval = setInterval(() => {
      if (!cancelled)
        poll()
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
          <Button size="sm" onClick={() => {
          if (task.output?.pbr_model) {
            setModelUrl(proxyUrl(task.output.pbr_model))
          }
        }}>
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
        <span className="ml-auto text-xs text-muted-foreground">
          {progress}
          %
        </span>
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
