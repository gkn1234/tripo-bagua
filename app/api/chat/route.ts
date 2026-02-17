// app/api/chat/route.ts
import type { AnalysisNote, AnalysisProgress } from '@/lib/bazi/types'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { convertToModelMessages, hasToolCall, stepCountIs, streamText, tool } from 'ai'
import { z } from 'zod'
import { calculateBazi } from '@/lib/bazi'
import { runAnalysisStream } from '@/lib/bazi/analysis-agent'
import { tripoClient } from '@/lib/tripo'

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY!,
})

const presentOptions = tool({
  description: '向用户展示可选项按钮,引导下一步操作。需要用户做选择时必须调用此工具。',
  inputSchema: z.object({
    options: z.array(z.object({
      label: z.string().describe('按钮上显示的文字'),
      description: z.string().optional().describe('选项的简短说明'),
    })).describe('选项列表'),
  }),
  execute: async ({ options }) => ({ options }),
})

const systemPrompt = `## 你是谁

你是一位年轻但眼光毒辣的命理师。
你的风格是铁口直断——看到什么说什么,不兜圈子,不堆砌术语故作高深。
该夸的地方一笔带过,该提醒的地方绝不含糊。
你说话轻松直接,偶尔带点幽默,但从不油滑。
用户找你,是想听真话,不是听客套。

## 怎么做事

你遵循以下原则:

- 一次只做一件事。做完当前这步,停下来,让用户决定下一步。
- 动手之前先开口。任何生成操作(排盘、生成模型、换材质)前,先描述你打算做什么,等用户确认。
- 给选择不给指令。需要用户做决定时,调用 presentOptions 提供选项,让用户主导节奏。
- 改完不急着收工。每次生成或修改完成后,先问满不满意。不满意就接着聊怎么改,聊完确认了再动手。
- 用户说了生辰信息,你必须先复述确认(年月日时、性别),然后停下来等用户回复"对的"或纠正。在用户明确确认之前,绝对不要调用 analyzeBazi。这是硬性规则,没有例外。

## 八字解读

你的上下文中包含分析 Agent 产出的专业分析结论。
你的职责是把这些结论翻译成用户听得懂的话。

规则:
- 先给一个简洁有力的总体判断,铁口直断
- 用大白话解释,不堆砌术语
- 该提醒的地方不含糊,该夸的一笔带过
- 分析结论中标注了不确定的判断,不要把这些当作确定结论呈现给用户
- 用户追问时,优先从已有分析结论中提取相关内容
- 如果已有分析不足以回答用户的问题,调用 deepAnalysis 让分析 Agent 补充

## 吉祥物设计

根据分析结论中的喜用神方向,推荐吉祥物方案。不要局限于固定的五行-瑞兽对应,发挥创意。
描述吉祥物时要具体:造型、姿态、配饰、颜色、材质质感都要说清楚。
风格适合做桌面摆件,精致小巧。
先推荐你认为最合适的方案,再问用户的偏好和想法。
吉祥物方案在生成前必须和用户充分讨论——你先推荐,用户可以提自己的想法,最终方案双方都满意了才生成。

调用 generateMascot 时,prompt 遵循以下结构(英文):
"A [style] figurine of [creature], [key pose/action],
[1-2 material descriptors], [1-2 color descriptors],
desktop collectible, smooth LOD transitions"

## 工具使用

analyzeBazi — 排盘工具,只做纯计算,瞬间返回四柱数据。必须在用户确认生辰信息后才能调用。排盘完成后必须紧接着调用 deepAnalysis 做综合分析。

deepAnalysis — 分析工具。排盘后必须立即调用(不传 question)做综合分析;用户追问时传入具体问题做补充分析。

presentOptions — 每次回复末尾如果存在分支选择,就调用此工具提供选项按钮。不要用纯文字罗列选项来替代它。

generateMascot — 仅在用户明确确认吉祥物方案后调用。prompt 参数要包含详细的造型描述(形态、颜色、姿态、配饰、材质)。

retextureMascot — 用户对已生成的模型想做小范围调整(换颜色、换材质、换纹理风格)时使用,不改变造型。

调用 generateMascot 或 retextureMascot 后会返回 { taskId, status: 'pending' },
表示任务已提交异步生成,前端会自动轮询进度并展示结果。
用户可能随时要求用修改后的提示词重新生成,如果当前状态显示有模型正在生成,告知用户并询问是否确认替换,得到确认后再调用工具。`

function buildAnalysisContext(note: AnalysisNote | null): string {
  if (!note || note.analyses.length === 0)
    return ''

  const parts = ['\n\n## 命盘分析结论（由分析 Agent 产出，供你参考和引用）\n']
  for (const entry of note.analyses) {
    if (entry.question) {
      parts.push(`### 关于「${entry.question}」\n`)
    }
    else {
      parts.push('### 综合分析\n')
    }
    parts.push(entry.content)
    if (entry.references.length > 0) {
      parts.push(`\n引用经典：${entry.references.join('、')}`)
    }
    parts.push('')
  }
  return parts.join('\n')
}

export async function POST(req: Request) {
  const { messages, pendingTaskId, analysisNote: existingNote } = await req.json()

  // Mutable state shared across tool calls within this request
  let currentNote: AnalysisNote | null = existingNote ?? null
  let currentGender: 0 | 1 = 1

  const analyzeBazi = tool({
    description: '根据出生日期时间排八字命盘,返回四柱数据(纯计算,不含分析)',
    inputSchema: z.object({
      year: z.number().describe('出生年份,如 1990'),
      month: z.number().min(1).max(12).describe('出生月份'),
      day: z.number().min(1).max(31).describe('出生日'),
      hour: z.number().min(0).max(23).describe('出生时辰(24 小时制)'),
      gender: z.number().min(0).max(1).optional().describe('性别:0 女 1 男,默认 1'),
    }),
    execute: async ({ year, month, day, hour, gender }) => {
      try {
        currentGender = (gender ?? 1) as 0 | 1
        const result = calculateBazi({ year, month, day, hour, gender: currentGender })

        currentNote = {
          sessionId: '',
          rawData: result,
          analyses: currentNote?.analyses ?? [],
          updatedAt: Date.now(),
        }

        return { success: true, data: result, analysisNote: currentNote, gender: currentGender }
      }
      catch (error) {
        return { success: false, error: error instanceof Error ? error.message : '八字计算失败' }
      }
    },
  })

  const deepAnalysis = tool({
    description: '对命盘做专业分析。排盘后必须立即调用(不传 question)做综合分析;用户追问时传入具体问题做补充分析。',
    inputSchema: z.object({
      question: z.string().optional().describe('需要分析的具体问题,首次综合分析时不传'),
    }),
    async* execute({ question }) {
      if (!currentNote?.rawData) {
        return { phase: 'complete', error: '尚未排盘，请先调用 analyzeBazi' } as AnalysisProgress
      }

      const { fiveElements, ...dataForAnalysis } = currentNote.rawData

      yield { phase: 'started' } as AnalysisProgress

      let partialText = ''
      const classicQueries: NonNullable<AnalysisProgress['classicQueries']> = []
      let currentQuery: { query: string, source: string } | null = null
      let lastYieldTime = 0
      const THROTTLE_MS = 150

      try {
        for await (const event of runAnalysisStream({
          rawData: dataForAnalysis,
          previousNote: currentNote,
          question: question ?? null,
          gender: currentGender,
        })) {
          switch (event.type) {
            case 'text-delta':
              partialText += event.textDelta
              if (Date.now() - lastYieldTime > THROTTLE_MS) {
                yield { phase: 'analyzing', partialText, classicQueries } as AnalysisProgress
                lastYieldTime = Date.now()
              }
              break

            case 'tool-call':
              currentQuery = { query: event.query, source: event.source }
              yield { phase: 'querying', query: event.query, source: event.source, partialText, classicQueries } as AnalysisProgress
              break

            case 'tool-result':
              if (currentQuery) {
                classicQueries.push({ query: currentQuery.query, source: currentQuery.source, results: event.results })
              }
              yield { phase: 'queried', classicResults: event.results, partialText, classicQueries } as AnalysisProgress
              currentQuery = null
              break

            case 'finish':
              currentNote = {
                ...currentNote!,
                analyses: [...currentNote!.analyses, event.entry],
                updatedAt: Date.now(),
              }
              yield { phase: 'complete', analysisNote: currentNote, partialText, classicQueries } as AnalysisProgress
              break
          }
        }
      }
      catch (error) {
        yield { phase: 'complete', error: error instanceof Error ? error.message : '分析失败' } as AnalysisProgress
      }
    },
  })

  const generateMascot = tool({
    description: '根据描述生成 3D 吉祥物模型,返回 taskId 用于异步轮询',
    inputSchema: z.object({
      prompt: z.string().describe('详细的吉祥物描述,包含造型、颜色、姿态、配饰'),
      style: z.string().optional().describe('风格偏好,如 cute、majestic、chibi'),
      negativePrompt: z.string().optional().describe('不希望出现的特征,英文'),
    }),
    execute: async ({ prompt, style, negativePrompt }) => {
      try {
        const fullPrompt = style ? `${prompt}, ${style} style` : prompt
        const taskId = await tripoClient.createTask(fullPrompt, { negativePrompt })
        return { success: true, taskId, status: 'pending', prompt: fullPrompt, negativePrompt: negativePrompt ?? null }
      }
      catch (error) {
        return { success: false, error: error instanceof Error ? error.message : '3D 模型生成失败' }
      }
    },
  })

  const retextureMascot = tool({
    description: '对已生成的 3D 模型重新生成纹理,保留造型不变,可指定新的材质/颜色/风格',
    inputSchema: z.object({
      taskId: z.string().describe('原始模型的 taskId'),
      prompt: z.string().describe('期望的纹理效果描述,如"金属金色表面"'),
      textureQuality: z.enum(['standard', 'detailed']).optional().describe('纹理质量,默认 standard'),
    }),
    execute: async ({ taskId, prompt, textureQuality }) => {
      try {
        const newTaskId = await tripoClient.retextureModel(taskId, {
          prompt,
          textureQuality: textureQuality ?? 'standard',
        })
        return { success: true, taskId: newTaskId, status: 'pending', prompt }
      }
      catch (error) {
        return { success: false, error: error instanceof Error ? error.message : '纹理重生成失败' }
      }
    },
  })

  const analysisContext = buildAnalysisContext(existingNote ?? null)
  const now = new Date()
  const timeContext = `\n\n## 当前时间\n${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`
  const pendingContext = pendingTaskId
    ? '\n\n## 当前状态\n有一个 3D 模型正在生成中。'
    : '\n\n## 当前状态\n当前没有模型在生成,忽略对话历史中的 taskId 和 status: pending。'

  const result = streamText({
    model: deepseek('deepseek-chat'),
    system: systemPrompt + analysisContext + pendingContext + timeContext,
    messages: await convertToModelMessages(messages),
    tools: { analyzeBazi, generateMascot, retextureMascot, presentOptions, deepAnalysis },
    stopWhen: [stepCountIs(10), hasToolCall('presentOptions')],
  })

  return result.toUIMessageStreamResponse()
}
