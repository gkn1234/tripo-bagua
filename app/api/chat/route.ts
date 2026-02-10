// app/api/chat/route.ts
import type { NextRequest } from 'next/server'

const MOCK_RESPONSES = [
  {
    thinking: '让我分析一下您的出生日期...\n\n根据八字理论，我需要将公历日期转换为农历，然后计算天干地支...',
    text: '根据您提供的信息，我来为您分析八字：\n\n**您的八字排盘**\n- 年柱：甲子\n- 月柱：丙寅\n- 日柱：戊辰\n- 时柱：壬午\n\n**五行分析**\n您的八字中木、火较旺，土为日主，整体格局偏向「食神生财」。\n\n您希望我为您生成一个什么样的吉祥物呢？可以告诉我您的偏好，比如：\n- 动物类（龙、凤、麒麟等）\n- 植物类（莲花、竹子等）\n- 抽象类（祥云、如意等）',
  },
  {
    thinking: '用户想要一个龙形吉祥物，结合他的八字特点，我来设计一个适合的造型...',
    text: '好的！基于您的八字特点，我为您设计了一个**祥龙献瑞**吉祥物：\n\n🐉 **设计理念**\n- 龙身环绕祥云，象征腾飞\n- 龙爪握宝珠，寓意财运亨通\n- 底座为莲花，取「和谐」之意\n\n正在为您生成 3D 模型，请稍候...',
    toolCall: {
      name: 'generate_3d_model',
      status: 'calling',
    },
  },
  {
    text: '✨ **3D 模型生成完成！**\n\n您的专属吉祥物已经准备好了，可以在右侧查看和旋转模型。\n\n如果满意，可以点击「下单打印」将它变成实物！',
    toolCall: {
      name: 'generate_3d_model',
      status: 'complete',
      result: 'https://example.com/model.glb',
    },
    modelReady: true,
  },
]

let responseIndex = 0

export async function POST(req: NextRequest) {
  const { messages } = await req.json()
  const isFirstMessage = messages.length <= 1

  // 根据对话轮次选择响应
  const mockResponse = MOCK_RESPONSES[Math.min(responseIndex, MOCK_RESPONSES.length - 1)]
  responseIndex = isFirstMessage ? 0 : responseIndex + 1

  // 创建流式响应
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      // 发送思考过程
      if (mockResponse.thinking) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'reasoning',
          content: mockResponse.thinking,
        })}\n\n`))
        await delay(500)
      }

      // 发送工具调用状态
      if (mockResponse.toolCall?.status === 'calling') {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'tool-call',
          name: mockResponse.toolCall.name,
          status: 'calling',
        })}\n\n`))
        await delay(300)
      }

      // 流式发送文本
      const chars = mockResponse.text.split('')
      for (const char of chars) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'text-delta',
          content: char,
        })}\n\n`))
        await delay(20)
      }

      // 发送工具调用完成
      if (mockResponse.toolCall?.status === 'complete') {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'tool-call',
          name: mockResponse.toolCall.name,
          status: 'complete',
          result: mockResponse.toolCall.result,
        })}\n\n`))
      }

      // 发送模型就绪信号
      if (mockResponse.modelReady) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'model-ready',
          url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
        })}\n\n`))
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
