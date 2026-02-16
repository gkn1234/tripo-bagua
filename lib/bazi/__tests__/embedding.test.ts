import { afterEach, describe, expect, it, vi } from 'vitest'
import { embedBatch, embedText } from '../embedding'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

afterEach(() => {
  mockFetch.mockReset()
})

describe('embedText', () => {
  it('should call ZhiPu API and return embedding vector', async () => {
    const fakeEmbedding = [0.1, 0.2, 0.3]
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: fakeEmbedding }] }),
    })

    const result = await embedText('甲木寅月调候')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://open.bigmodel.cn/api/paas/v4/embeddings')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.model).toBe('embedding-3')
    expect(body.input).toBe('甲木寅月调候')
    expect(result).toEqual(fakeEmbedding)
  })

  it('should throw on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Unauthorized' } }),
    })

    await expect(embedText('test')).rejects.toThrow()
  })
})

describe('embedBatch', () => {
  it('should send array of texts and return array of embeddings', async () => {
    const fakeEmbeddings = [[0.1, 0.2], [0.3, 0.4]]
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: fakeEmbeddings.map(e => ({ embedding: e })),
      }),
    })

    const result = await embedBatch(['text1', 'text2'])

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.input).toEqual(['text1', 'text2'])
    expect(result).toEqual(fakeEmbeddings)
  })
})
