'use client'

import { useState } from 'react'
import { Chat } from '@/components/chat'
import { ModelViewer } from '@/components/model-viewer'
import { OrderModal } from '@/components/order-modal'
import { Sidebar } from '@/components/sidebar'
import { Button } from '@/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { useChatStore } from '@/stores/chat-store'

export default function Home() {
  const { phase, modelUrl } = useChatStore()
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const { currentSession, loadSession, newSession, ui: chatUI } = Chat()

  const isSplit = phase === 'split' && !!modelUrl
  console.warn('[Home] render:', { phase, modelUrl: modelUrl ? modelUrl.slice(0, 60) : null, isSplit })

  return (
    <main className="flex h-screen">
      <Sidebar
        currentSessionId={currentSession?.id ?? null}
        onSelectSession={loadSession}
        onNewSession={newSession}
      />

      <ResizablePanelGroup id="main-layout" orientation="horizontal" className="min-w-0 flex-1">
        <ResizablePanel id="chat" minSize={30}>
          <div className="h-full overflow-hidden">
            {chatUI}
          </div>
        </ResizablePanel>

        {isSplit && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel id="model" defaultSize={300} minSize={100}>
              <div className="relative h-full overflow-hidden">
                <ModelViewer modelUrl={modelUrl} />
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
                  <Button size="lg" onClick={() => setOrderModalOpen(true)}>
                    下单打印
                  </Button>
                </div>
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <OrderModal
        open={orderModalOpen}
        onOpenChange={setOrderModalOpen}
        modelUrl={modelUrl || ''}
      />
    </main>
  )
}
