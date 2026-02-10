'use client'

import { useState } from 'react'
import { Chat } from '@/components/chat'
import { ModelViewer } from '@/components/model-viewer'
import { OrderModal } from '@/components/order-modal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/stores/chat-store'

export default function Home() {
  const { phase, modelUrl } = useChatStore()
  const [orderModalOpen, setOrderModalOpen] = useState(false)

  return (
    <main className="flex h-screen">
      <div
        className={cn(
          'transition-all duration-400 ease-out',
          phase === 'chat' ? 'w-full' : 'w-[40%] border-r border-border',
        )}
      >
        <Chat />
      </div>

      {phase === 'split' && modelUrl && (
        <div className="relative w-[60%]">
          <ModelViewer modelUrl={modelUrl} />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <Button size="lg" onClick={() => setOrderModalOpen(true)}>
              下单打印
            </Button>
          </div>
        </div>
      )}

      <OrderModal
        open={orderModalOpen}
        onOpenChange={setOrderModalOpen}
        modelUrl={modelUrl || ''}
      />
    </main>
  )
}
