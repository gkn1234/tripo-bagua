// lib/bazi/analysis-agent.ts
import type { AnalysisEntry, AnalysisNote, BaziResult } from './types'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { generateText, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import type { SourceKey } from './classics'
import { searchClassics } from './classics'

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY!,
})

const ANALYSIS_SYSTEM_PROMPT = `你是一位命理分析引擎。你的任务是基于排盘数据,产出专业的八字命理分析。

规则:
- 所有结论必须有命盘数据作为依据,指出具体是哪柱、哪个十神、哪组关系
- 不需要考虑表达风格,不需要说人话,专注于分析的准确性和完整性
- 如果对某个判断不确定,明确标注不确定程度,而非给出模糊的万金油结论
- 分析中遇到特殊格局(从格、化格、专旺格等)时,须特别标注
- 输出格式为 Markdown

工具:
- queryClassics：查阅穷通宝鉴、子平真诠、滴天髓、渊海子平、三命通会等经典。需要查阅调候用法、格局论述、纳音论述、神煞论述、干支关系时主动调用。引用经典原文时标注出处（如《穷通宝鉴·甲木寅月》、《三命通会·论纳音取象》）。`

interface AnalyzeParams {
  rawData: Omit<BaziResult, 'fiveElements'>
  previousNote: AnalysisNote | null
  question: string | null
}

export async function runAnalysis({ rawData, previousNote, question }: AnalyzeParams): Promise<AnalysisEntry> {
  const userContent = buildUserPrompt({ rawData, previousNote, question })

  const queryClassicsTool = tool({
    description: '查阅命理经典著作（穷通宝鉴、子平真诠、滴天髓、渊海子平、三命通会），可查术语释义、调候用法、格局论述、纳音、神煞、干支关系、命例分析等',
    inputSchema: z.object({
      query: z.string().describe('查询内容，如"伤官配印"、"甲木寅月用神"、"身弱财旺"、"天乙贵人"、"甲子海中金"'),
      source: z.enum(['all', 'ziping', 'ditian', 'qiongtong', 'yuanhai', 'sanming'])
        .optional()
        .default('all')
        .describe('指定经典：ziping=子平真诠, ditian=滴天髓, qiongtong=穷通宝鉴, yuanhai=渊海子平, sanming=三命通会, all=全部'),
    }),
    execute: async ({ query, source }) => {
      const results = await searchClassics(query, source as SourceKey | 'all')
      return results.map(r => ({
        content: r.content,
        source: r.source,
        chapter: r.chapter,
        score: r.score,
      }))
    },
  })

  const { text } = await generateText({
    model: deepseek('deepseek-chat'),
    system: ANALYSIS_SYSTEM_PROMPT,
    prompt: userContent,
    tools: { queryClassics: queryClassicsTool },
    stopWhen: stepCountIs(5),
  })

  return {
    question,
    content: text,
    references: extractReferences(text),
    createdAt: Date.now(),
  }
}

function buildUserPrompt({ rawData, previousNote, question }: AnalyzeParams): string {
  const parts: string[] = []

  parts.push('## 排盘数据\n')
  parts.push('```json')
  parts.push(JSON.stringify(rawData, null, 2))
  parts.push('```\n')

  if (previousNote && previousNote.analyses.length > 0) {
    parts.push('## 已有分析\n')
    for (const entry of previousNote.analyses) {
      if (entry.question) {
        parts.push(`### 问题:${entry.question}\n`)
      }
      else {
        parts.push('### 综合分析\n')
      }
      parts.push(entry.content)
      parts.push('')
    }
  }

  if (question) {
    parts.push('## 本次分析任务\n')
    parts.push(`请针对以下问题做深入分析:${question}`)
    parts.push('基于排盘数据和已有分析,给出专业论断。')
  }
  else {
    parts.push('## 本次分析任务\n')
    parts.push('请对该命盘做全面综合分析。涵盖日主强弱、格局特征、核心矛盾、大运走势等关键维度。')
  }

  return parts.join('\n')
}

function extractReferences(text: string): string[] {
  const matches = text.match(/《[^》]+》/g)
  return matches ? [...new Set(matches)] : []
}

export { ANALYSIS_SYSTEM_PROMPT, buildUserPrompt, extractReferences }
export type { AnalyzeParams }
