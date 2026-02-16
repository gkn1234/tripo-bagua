import { afterEach, describe, expect, it, vi } from 'vitest'
import { cosineSimilarity, searchClassics } from '../classics'

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = [1, 2, 3]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5)
  })

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })

  it('should return -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5)
  })

  it('should handle high-dimensional vectors', () => {
    const a = Array.from({ length: 1024 }, (_, i) => Math.sin(i))
    const b = Array.from({ length: 1024 }, (_, i) => Math.cos(i))
    const result = cosineSimilarity(a, b)
    expect(result).toBeGreaterThanOrEqual(-1)
    expect(result).toBeLessThanOrEqual(1)
  })
})

// Mock embedding module
vi.mock('../embedding', () => ({
  embedText: vi.fn().mockResolvedValue([1, 0, 0]),
}))

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue(JSON.stringify([
    {
      id: 'qiongtong-jia-yin',
      content: '甲木生于寅月，阳气初生',
      source: '穷通宝鉴',
      chapter: '甲木·寅月',
      keywords: ['甲木', '寅月'],
      embedding: [1, 0, 0],
    },
    {
      id: 'ziping-ch1',
      content: '论用神',
      source: '子平真诠',
      chapter: '第一章',
      keywords: ['用神'],
      embedding: [0, 1, 0],
    },
    {
      id: 'ditian-ch1',
      content: '天道',
      source: '滴天髓',
      chapter: '通神论',
      keywords: ['天道'],
      embedding: [0.9, 0.1, 0],
    },
  ])),
  existsSync: vi.fn().mockReturnValue(true),
}))

describe('searchClassics', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return top results sorted by similarity', async () => {
    const results = await searchClassics('甲木寅月', 'all')
    expect(results).toHaveLength(3)
    expect(results[0].id).toBe('qiongtong-jia-yin')
    expect(results[1].id).toBe('ditian-ch1')
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })

  it('should filter by source when specified', async () => {
    const results = await searchClassics('test', 'qiongtong')
    expect(results.every(r => r.source === '穷通宝鉴')).toBe(true)
  })

  it('should not include embedding in results', async () => {
    const results = await searchClassics('test', 'all')
    for (const r of results) {
      expect(r).not.toHaveProperty('embedding')
    }
  })
})
