// lib/bazi/classics.ts

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { embedText } from './embedding'

export interface ClassicChunk {
  id: string // 唯一 ID，如 "qiongtong-jia-yin"
  content: string // 原文段落（含白话注释）
  source: string // 书名：穷通宝鉴 / 子平真诠 / 滴天髓 / 渊海子平 / 三命通会
  chapter: string // 章节名
  keywords: string[] // 人工标注关键词，如 ["甲木", "寅月", "调候"]
  embedding: number[] // 智谱 Embedding-3 向量
}

export type SourceKey = 'qiongtong' | 'ziping' | 'ditian' | 'yuanhai' | 'sanming'

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export const SOURCE_MAP: Record<SourceKey, string> = {
  qiongtong: '穷通宝鉴',
  ziping: '子平真诠',
  ditian: '滴天髓',
  yuanhai: '渊海子平',
  sanming: '三命通会',
}

let chunksCache: ClassicChunk[] | null = null

export function loadChunks(): ClassicChunk[] {
  if (chunksCache)
    return chunksCache
  const filePath = resolve(process.cwd(), 'data/classics/chunks.json')
  if (!existsSync(filePath))
    return []
  chunksCache = JSON.parse(readFileSync(filePath, 'utf-8'))
  return chunksCache!
}

export interface SearchResult {
  id: string
  content: string
  source: string
  chapter: string
  score: number
}

export async function searchClassics(
  query: string,
  source: SourceKey | 'all',
  topK = 3,
): Promise<SearchResult[]> {
  const queryEmbedding = await embedText(query)
  const chunks = loadChunks()
  const candidates = source === 'all'
    ? chunks
    : chunks.filter(c => c.source === SOURCE_MAP[source])

  return candidates
    .map(c => ({
      id: c.id,
      content: c.content,
      source: c.source,
      chapter: c.chapter,
      score: cosineSimilarity(queryEmbedding, c.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
