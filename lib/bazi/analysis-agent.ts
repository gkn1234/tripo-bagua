import type { SourceKey } from './classics'
// lib/bazi/analysis-agent.ts
import type { AnalysisEntry, AnalysisEvent, AnalysisNote, BaziResult, ClassicQueryResult } from './types'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { generateText, streamText, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { searchClassics } from './classics'

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY!,
})

function buildSystemPrompt(): string {
  const now = new Date()
  const timeStr = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`
  return `你是一位命理分析引擎。你的任务是基于排盘数据,产出专业的八字命理分析。

当前时间: ${timeStr}

规则:
- 所有结论必须有命盘数据作为依据,指出具体是哪柱、哪个十神、哪组关系
- 命理分析有多个维度——格局、调候、纳音、神煞、刑冲合会等——它们各有所长,不分主次,根据盘面特征综合运用。排盘数据中的 naYin、gods、relations 字段均为有效分析素材,不要忽略
- 不需要考虑表达风格,不需要说人话,专注于分析的准确性和完整性
- 如果对某个判断不确定,明确标注不确定程度,而非给出模糊的万金油结论
- 分析中遇到特殊格局(从格、化格、专旺格等)时,须特别标注
- 输出格式为 Markdown

工具:
- queryClassics：你的书架上有《穷通宝鉴》（调候用神逐月论述）、《子平真诠》（格局法体系）、《滴天髓》（干支生克理论+实战命例）、《渊海子平》（神煞/格局/赋论）、《三命通会》（纳音/神煞/日时断诀）。分析过程中可随时查阅。引用经典原文时标注出处（如《穷通宝鉴·甲木寅月》、《三命通会·论纳音取象》）。`
}

interface AnalyzeParams {
  rawData: Omit<BaziResult, 'fiveElements'>
  previousNote: AnalysisNote | null
  question: string | null
  gender: 0 | 1
}

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

export async function runAnalysis({ rawData, previousNote, question, gender }: AnalyzeParams): Promise<AnalysisEntry> {
  const userContent = buildUserPrompt({ rawData, previousNote, question, gender })

  const { text } = await generateText({
    model: deepseek('deepseek-chat'),
    system: buildSystemPrompt(),
    prompt: userContent,
    tools: { queryClassics: queryClassicsTool },
    stopWhen: stepCountIs(20),
  })

  return {
    question,
    content: text,
    references: extractReferences(text),
    createdAt: Date.now(),
  }
}

export async function* runAnalysisStream({ rawData, previousNote, question, gender }: AnalyzeParams): AsyncGenerator<AnalysisEvent> {
  const userContent = buildUserPrompt({ rawData, previousNote, question, gender })

  const result = streamText({
    model: deepseek('deepseek-chat'),
    system: buildSystemPrompt(),
    prompt: userContent,
    tools: { queryClassics: queryClassicsTool },
    stopWhen: stepCountIs(20),
  })

  let fullText = ''

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        fullText += part.text
        yield { type: 'text-delta', textDelta: part.text }
        break
      case 'tool-call':
        if (part.toolName === 'queryClassics') {
          const input = part.input as { query: string; source?: string }
          yield {
            type: 'tool-call',
            query: input.query,
            source: input.source ?? 'all',
          }
        }
        break
      case 'tool-result':
        if (part.toolName === 'queryClassics') {
          yield {
            type: 'tool-result',
            results: part.output as ClassicQueryResult[],
          }
        }
        break
    }
  }

  yield {
    type: 'finish',
    entry: {
      question,
      content: fullText,
      references: extractReferences(fullText),
      createdAt: Date.now(),
    },
  }
}

function buildUserPrompt({ rawData, previousNote, question, gender }: AnalyzeParams): string {
  const parts: string[] = []

  // 命主基本信息
  const currentYear = new Date().getFullYear()
  const birthYear = Number.parseInt(rawData.solar.split('-')[0], 10)
  const age = currentYear - birthYear
  parts.push(`## 命主信息\n`)
  parts.push(`- 性别: ${gender === 1 ? '男' : '女'}`)
  parts.push(`- 当前年份: ${currentYear} 年（虚岁约 ${age + 1} 岁）`)
  parts.push('')

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
    parts.push('请对该命盘做全面综合分析。根据盘面特征自行确定分析重点。')
  }

  return parts.join('\n')
}

function extractReferences(text: string): string[] {
  const matches = text.match(/《[^》]+》/g)
  return matches ? [...new Set(matches)] : []
}

export { buildSystemPrompt, buildUserPrompt, extractReferences }
export type { AnalyzeParams }
