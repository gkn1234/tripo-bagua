// lib/bazi/classics.ts

export interface ClassicChunk {
  id: string            // 唯一 ID，如 "qiongtong-jia-yin"
  content: string       // 原文段落（含白话注释）
  source: string        // 书名：穷通宝鉴 / 子平真诠 / 滴天髓 / 渊海子平 / 三命通会
  chapter: string       // 章节名
  keywords: string[]    // 人工标注关键词，如 ["甲木", "寅月", "调候"]
  embedding: number[]   // 智谱 Embedding-3 向量
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
