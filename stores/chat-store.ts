import type { AnalysisNote } from '@/lib/bazi/types'
import { create } from 'zustand'

export type Phase = 'chat' | 'split'

interface ChatState {
  phase: Phase
  modelUrl: string | null
  currentSessionId: string | null
  sidebarOpen: boolean
  pendingTaskId: string | null
  analysisNote: AnalysisNote | null
  setPhase: (phase: Phase) => void
  setModelUrl: (url: string) => void
  setCurrentSessionId: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void
  setPendingTaskId: (id: string | null) => void
  setAnalysisNote: (note: AnalysisNote | null) => void
  toggleSidebar: () => void
  reset: () => void
}

export const useChatStore = create<ChatState>(set => ({
  phase: 'chat',
  modelUrl: null,
  currentSessionId: null,
  sidebarOpen: true,
  pendingTaskId: null,
  analysisNote: null,
  setPhase: phase => set({ phase }),
  setModelUrl: url => set({ modelUrl: url, phase: 'split' }),
  setCurrentSessionId: id => set({ currentSessionId: id }),
  setSidebarOpen: open => set({ sidebarOpen: open }),
  setPendingTaskId: id => set({ pendingTaskId: id }),
  setAnalysisNote: note => set({ analysisNote: note }),
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
  reset: () => set({ phase: 'chat', modelUrl: null, pendingTaskId: null, analysisNote: null, sidebarOpen: true }),
}))
