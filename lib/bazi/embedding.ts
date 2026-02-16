// lib/bazi/embedding.ts
const ZHIPU_API_BASE = 'https://open.bigmodel.cn/api/paas/v4'

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${ZHIPU_API_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ZHIPU_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'embedding-3',
      input: text,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`ZhiPu Embedding API error: ${res.status} ${(err as Record<string, Record<string, string>>).error?.message ?? ''}`)
  }

  const data = await res.json()
  return data.data[0].embedding
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${ZHIPU_API_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ZHIPU_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'embedding-3',
      input: texts,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`ZhiPu Embedding API error: ${res.status} ${(err as Record<string, Record<string, string>>).error?.message ?? ''}`)
  }

  const data = await res.json()
  return data.data.map((d: { embedding: number[] }) => d.embedding)
}
