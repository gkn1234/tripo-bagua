'use client'

import { useState } from 'react'
import { ArrowLeft, Menu } from 'lucide-react'
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
import { useMobile } from '@/hooks/use-mobile'
import { useChatStore } from '@/stores/chat-store'

export default function Home() {
  const { phase, modelUrl, setSidebarOpen } = useChatStore()
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [mobileModelOpen, setMobileModelOpen] = useState(false)
  const { currentSession, loadSession, newSession, ui: chatUI } = Chat()
  const isMobile = useMobile()

  const isSplit = phase === 'split' && !!modelUrl

  return (
    <main className="flex h-screen">
      <Sidebar
        currentSessionId={currentSession?.id ?? null}
        onSelectSession={loadSession}
        onNewSession={newSession}
      />

      {isMobile ? (
        // Mobile layout: full-screen chat + optional model overlay
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Mobile header with hamburger */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5 safe-area-top">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setSidebarOpen(true)}>
              <Menu className="size-4" />
            </Button>
            <span className="text-sm font-semibold font-[var(--font-display)]">开运造物</span>
            {isSplit && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => setMobileModelOpen(true)}
              >
                查看模型
              </Button>
            )}
          </div>

          {/* Chat content */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {chatUI}
          </div>

          {/* Mobile 3D model fullscreen overlay */}
          {mobileModelOpen && modelUrl && (
            <div className="fixed inset-0 z-30 flex flex-col bg-background safe-area-top">
              <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setMobileModelOpen(false)}>
                  <ArrowLeft className="size-4" />
                </Button>
                <span className="text-sm font-semibold">3D 模型预览</span>
              </div>
              <div className="relative min-h-0 flex-1">
                <ModelViewer modelUrl={modelUrl} />
                <div className="safe-area-bottom absolute bottom-6 left-1/2 -translate-x-1/2">
                  <Button size="lg" onClick={() => setOrderModalOpen(true)}>
                    下单打印
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Desktop / Tablet: resizable split layout
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
      )}

      <OrderModal
        open={orderModalOpen}
        onOpenChange={setOrderModalOpen}
        modelUrl={modelUrl || ''}
      />
    </main>
  )
}
