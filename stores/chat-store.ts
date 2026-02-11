import { create } from 'zustand'

export type Phase = 'chat' | 'split'

interface ChatState {
  phase: Phase
  modelUrl: string | null
  currentSessionId: string | null
  sidebarOpen: boolean
  setPhase: (phase: Phase) => void
  setModelUrl: (url: string) => void
  setCurrentSessionId: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  reset: () => void
}

export const useChatStore = create<ChatState>(set => ({
  phase: 'chat',
  modelUrl: null,
  currentSessionId: null,
  sidebarOpen: true,
  setPhase: phase => set({ phase }),
  setModelUrl: url => set({ modelUrl: url, phase: 'split' }),
  setCurrentSessionId: id => set({ currentSessionId: id }),
  setSidebarOpen: open => set({ sidebarOpen: open }),
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
  reset: () => set({ phase: 'chat', modelUrl: null }),
}))
