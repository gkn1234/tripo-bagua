import { describe, expect, it } from 'vitest'
import type { AnalysisEntry, AnalysisNote, BaziResult } from '../types'

describe('AnalysisNote types', () => {
  it('should allow creating a valid AnalysisEntry', () => {
    const entry: AnalysisEntry = {
      question: null,
      content: '日主甲木生于寅月...',
      references: ['《子平真诠》格局篇'],
      createdAt: Date.now(),
    }
    expect(entry.question).toBeNull()
    expect(entry.references).toHaveLength(1)
  })

  it('should allow creating a valid AnalysisNote', () => {
    const note: AnalysisNote = {
      sessionId: 'test-session',
      rawData: {} as BaziResult,
      analyses: [],
      updatedAt: Date.now(),
    }
    expect(note.analyses).toHaveLength(0)
  })
})
