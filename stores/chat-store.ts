import { create } from 'zustand'

export type Phase = 'chat' | 'split'

interface ChatState {
  phase: Phase
  modelUrl: string | null
  currentSessionId: string | null
  sidebarOpen: boolean
  pendingTaskId: string | null
  setPhase: (phase: Phase) => void
  setModelUrl: (url: string) => void
  setCurrentSessionId: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void
  setPendingTaskId: (id: string | null) => void
  toggleSidebar: () => void
  reset: () => void
}

export const useChatStore = create<ChatState>(set => ({
  phase: 'chat',
  modelUrl: null,
  currentSessionId: null,
  sidebarOpen: true,
  pendingTaskId: null,
  setPhase: phase => set({ phase }),
  setModelUrl: (url) => {
    console.warn('[ChatStore] setModelUrl called:', url)
    set({ modelUrl: url, phase: 'split' })
  },
  setCurrentSessionId: id => set({ currentSessionId: id }),
  setSidebarOpen: open => set({ sidebarOpen: open }),
  setPendingTaskId: (id) => {
    console.warn('[ChatStore] setPendingTaskId:', id)
    set({ pendingTaskId: id })
  },
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
  reset: () => {
    console.warn('[ChatStore] reset called')
    set({ phase: 'chat', modelUrl: null, pendingTaskId: null, sidebarOpen: true })
  },
}))
