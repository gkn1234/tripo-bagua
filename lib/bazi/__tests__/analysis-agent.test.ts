// lib/bazi/__tests__/analysis-agent.test.ts
import type { AnalysisNote, BaziResult } from '../types'
import { describe, expect, it } from 'vitest'
import { buildUserPrompt, extractReferences } from '../analysis-agent'

describe('extractReferences', () => {
  it('should extract book references from text', () => {
    const text = '根据《子平真诠》格局篇,此命为正官格。《滴天髓》亦云...'
    const refs = extractReferences(text)
    expect(refs).toEqual(['《子平真诠》', '《滴天髓》'])
  })

  it('should deduplicate references', () => {
    const text = '《穷通宝鉴》指出...再参照《穷通宝鉴》...'
    const refs = extractReferences(text)
    expect(refs).toEqual(['《穷通宝鉴》'])
  })

  it('should return empty array when no references', () => {
    const refs = extractReferences('日主偏弱,需要印星帮扶')
    expect(refs).toEqual([])
  })
})

describe('buildUserPrompt', () => {
  const mockRawData = {
    solar: '1990-5-15 10:00',
    lunar: '庚午年四月廿一',
    bazi: '庚午 辛巳 甲申 己巳',
    zodiac: '马',
    dayMaster: '甲',
    fourPillars: {} as BaziResult['fourPillars'],
    gods: { year: [], month: [], day: [], hour: [] },
    decadeFortunes: [],
    relations: {},
  }

  it('should include raw data section', () => {
    const prompt = buildUserPrompt({ rawData: mockRawData, previousNote: null, question: null, gender: 1 })
    expect(prompt).toContain('## 排盘数据')
    expect(prompt).toContain('"dayMaster": "甲"')
  })

  it('should include comprehensive analysis instruction when no question', () => {
    const prompt = buildUserPrompt({ rawData: mockRawData, previousNote: null, question: null, gender: 1 })
    expect(prompt).toContain('全面综合分析')
  })

  it('should include specific question when provided', () => {
    const prompt = buildUserPrompt({ rawData: mockRawData, previousNote: null, question: '事业方向', gender: 1 })
    expect(prompt).toContain('事业方向')
  })

  it('should include previous analyses when available', () => {
    const note: AnalysisNote = {
      sessionId: 'test',
      rawData: {} as BaziResult,
      analyses: [{
        question: null,
        content: '日主甲木偏弱...',
        references: [],
        createdAt: Date.now(),
      }],
      updatedAt: Date.now(),
    }
    const prompt = buildUserPrompt({ rawData: mockRawData, previousNote: note, question: '婚姻', gender: 1 })
    expect(prompt).toContain('## 已有分析')
    expect(prompt).toContain('日主甲木偏弱')
    expect(prompt).toContain('婚姻')
  })

  it('should include gender and current year', () => {
    const prompt = buildUserPrompt({ rawData: mockRawData, previousNote: null, question: null, gender: 0 })
    expect(prompt).toContain('性别: 女')
    expect(prompt).toContain(`当前年份: ${new Date().getFullYear()}`)
  })
})
