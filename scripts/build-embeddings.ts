// scripts/build-embeddings.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { embedBatch } from '../lib/bazi/embedding'

interface SourceEntry {
  id: string
  source: string
  chapter: string
  content: string
  keywords: string[]
}

interface ChunkWithEmbedding extends SourceEntry {
  embedding: number[]
}

const BATCH_SIZE = 10
const BATCH_DELAY_MS = 1000

async function main() {
  const sourcesDir = resolve(process.cwd(), 'data/classics/sources')
  const files = readdirSync(sourcesDir).filter(f => f.endsWith('.json'))

  console.log(`Found ${files.length} source files`)

  const allEntries: SourceEntry[] = []
  for (const file of files) {
    const entries: SourceEntry[] = JSON.parse(readFileSync(resolve(sourcesDir, file), 'utf-8'))
    console.log(`  ${file}: ${entries.length} entries`)
    allEntries.push(...entries)
  }

  console.log(`Total: ${allEntries.length} entries to embed`)

  const chunks: ChunkWithEmbedding[] = []

  for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
    const batch = allEntries.slice(i, i + BATCH_SIZE)
    const texts = batch.map(e => e.content)
    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allEntries.length / BATCH_SIZE)}...`)

    const embeddings = await embedBatch(texts)

    for (let j = 0; j < batch.length; j++) {
      chunks.push({ ...batch[j], embedding: embeddings[j] })
    }

    // Rate limit: wait between batches
    if (i + BATCH_SIZE < allEntries.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  const outPath = resolve(process.cwd(), 'data/classics/chunks.json')
  writeFileSync(outPath, JSON.stringify(chunks, null, 2), 'utf-8')
  console.log(`Done! Wrote ${chunks.length} chunks to ${outPath}`)
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
