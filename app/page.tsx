'use client'

import { useState } from 'react'
import { Chat } from '@/components/chat'
import { ModelViewer } from '@/components/model-viewer'
import { OrderModal } from '@/components/order-modal'
import { Button } from '@/components/ui/button'

export default function Home() {
  const [modelUrl, setModelUrl] = useState<string | null>(null)
  const [orderModalOpen, setOrderModalOpen] = useState(false)

  // 阶段一：对话全屏
  if (!modelUrl) {
    return (
      <main className="h-screen">
        <Chat onModelReady={setModelUrl} />
      </main>
    )
  }

  // 阶段二：对话半屏 + 3D 工作台半屏
  return (
    <main className="flex h-screen">
      <div className="w-1/2 border-r">
        <Chat onModelReady={setModelUrl} />
      </div>
      <div className="relative w-1/2">
        <ModelViewer modelUrl={modelUrl} />
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <Button size="lg" onClick={() => setOrderModalOpen(true)}>
            下单打印
          </Button>
        </div>
      </div>
      <OrderModal
        open={orderModalOpen}
        onOpenChange={setOrderModalOpen}
        modelUrl={modelUrl}
      />
    </main>
  )
}
