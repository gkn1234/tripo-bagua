# 聊天后端设计方案

> 日期：2026-02-11
> 状态：待实施

## 概述

为 Tripo Bagua（八字吉祥物 3D 生成）项目设计后端 API，支持 AI 对话、八字分析工具、Tripo 3D 生成工具调用。

## 技术选型

| 模块 | 选择 | 理由 |
|------|------|------|
| AI SDK | Vercel AI SDK (`ai`) | 流式响应、Tool Calling、多步执行 |
| DeepSeek 接入 | `@ai-sdk/deepseek` | 官方 provider，类型完整 |
| 农历计算 | `@yhjs/lunar` | 寿星万年历算法，精确可靠 |
| 参数校验 | `zod` | 工具参数 schema 定义 |

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  POST /api/chat                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  streamText()                                         │  │
│  │  ├── model: @ai-sdk/deepseek                         │  │
│  │  ├── stopWhen: stepCountIs(10)                       │  │
│  │  └── tools:                                          │  │
│  │      ├── analyzeBazi    → lib/bazi 计算              │  │
│  │      └── generateMascot → lib/tripo 调用             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

典型执行流程（3-4 步）：
Step 1: AI 解析用户输入，调用 analyzeBazi
Step 2: AI 分析八字结果，生成吉祥物描述，调用 generateMascot
Step 3: generateMascot 内部轮询 Tripo（等待 30s-2min）
Step 4: AI 生成最终回复，包含模型信息
```

## 目录结构

```
lib/
├── bazi/
│   ├── index.ts           # calculateBazi 主函数
│   ├── five-elements.ts   # 五行解析、日主分析、喜用神判断
│   └── mascot.ts          # 吉祥物推荐逻辑
│
├── tripo.ts               # Tripo API 客户端
│
└── deepseek.ts            # DeepSeek provider 配置（可选封装）

app/api/
├── chat/
│   └── route.ts           # 主聊天 API（streamText + tools）
│
└── tripo/                  # 保留，供调试/独立调用
    ├── generate/route.ts
    └── task/[id]/route.ts
```

## 工具定义

### analyzeBazi

分析八字命理，返回结构化数据供前端展示。

```typescript
const analyzeBazi = tool({
  description: '根据出生日期时间分析八字命理',
  inputSchema: z.object({
    year: z.number().describe('出生年份，如 1990'),
    month: z.number().min(1).max(12).describe('出生月份'),
    day: z.number().min(1).max(31).describe('出生日期'),
    hour: z.number().min(0).max(23).describe('出生时辰（24小时制）'),
  }),
  execute: async (input) => {
    try {
      const result = calculateBazi(input);
      return {
        success: true,
        fourPillars: result.fourPillars,      // 四柱（年月日时的天干地支）
        fiveElements: result.fiveElements,    // 五行统计
        favorable: result.favorable,          // 喜用神
        unfavorable: result.unfavorable,      // 忌神
        mascotTraits: result.mascotTraits,    // 推荐吉祥物特征
      };
    } catch (e) {
      return { success: false, error: '八字计算失败，请检查日期是否正确' };
    }
  },
});
```

### generateMascot

调用 Tripo API 生成 3D 吉祥物模型。

```typescript
const generateMascot = tool({
  description: '根据吉祥物描述生成 3D 模型',
  inputSchema: z.object({
    prompt: z.string().describe('吉祥物的详细描述'),
    style: z.string().optional().describe('风格偏好，如可爱、威严、Q版'),
  }),
  execute: async ({ prompt, style }) => {
    try {
      const fullPrompt = style ? `${prompt}，${style}风格` : prompt;
      const taskId = await tripoClient.createTask(fullPrompt);
      const result = await tripoClient.waitForCompletion(taskId, {
        timeout: 120_000,
        interval: 3_000,
      });
      return {
        success: true,
        modelUrl: result.output.model,
        taskId,
      };
    } catch (e) {
      return { success: false, error: e.message || '3D 模型生成失败' };
    }
  },
});
```

## API 路由实现

```typescript
// app/api/chat/route.ts
import { createDeepSeek } from '@ai-sdk/deepseek';
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { z } from 'zod';
import { calculateBazi } from '@/lib/bazi';
import { tripoClient } from '@/lib/tripo';

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

const tools = { analyzeBazi, generateMascot };

const systemPrompt = `你是一位精通八字命理的吉祥物设计师。

工作流程：
1. 用户提供出生日期时，调用 analyzeBazi 分析八字
2. 根据八字分析结果，设计一个契合用户命理的吉祥物
3. 调用 generateMascot 生成 3D 模型
4. 向用户介绍吉祥物的寓意和命理关联

注意：
- 吉祥物描述要具体（形态、颜色、姿态、配饰）
- 结合五行喜用神选择合适的元素
- 风格偏向精致小巧，适合作为摆件`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: deepseek('deepseek-chat'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
```

## Tripo 客户端封装

```typescript
// lib/tripo.ts
const TRIPO_API_BASE = 'https://api.tripo3d.ai/v2/openapi';

interface TripoTask {
  task_id: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  output?: { model: string };
}

export const tripoClient = {
  async createTask(prompt: string): Promise<string> {
    const res = await fetch(`${TRIPO_API_BASE}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TRIPO_API_KEY}`,
      },
      body: JSON.stringify({
        type: 'text_to_model',
        prompt,
        model_version: 'v2.5-20250123',
      }),
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(data.message || '创建任务失败');
    return data.data.task_id;
  },

  async getTask(taskId: string): Promise<TripoTask> {
    const res = await fetch(`${TRIPO_API_BASE}/task/${taskId}`, {
      headers: { 'Authorization': `Bearer ${process.env.TRIPO_API_KEY}` },
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(data.message || '查询任务失败');
    return data.data;
  },

  async waitForCompletion(
    taskId: string,
    options: { timeout: number; interval: number }
  ): Promise<TripoTask> {
    const startTime = Date.now();
    while (Date.now() - startTime < options.timeout) {
      const task = await this.getTask(taskId);
      if (task.status === 'success') return task;
      if (task.status === 'failed') throw new Error('3D 生成失败');
      await new Promise((r) => setTimeout(r, options.interval));
    }
    throw new Error('3D 生成超时');
  },
};
```

## 八字计算库

```typescript
// lib/bazi/index.ts
import { LunarDate } from '@yhjs/lunar';
import { parseElement, analyzeDayMaster } from './five-elements';
import { recommendMascot } from './mascot';

interface BaziInput {
  year: number;
  month: number;
  day: number;
  hour: number;
}

export function calculateBazi(input: BaziInput): BaziResult {
  // 1. 使用 @yhjs/lunar 获取四柱干支
  const date = new LunarDate(input.year, input.month, input.day);

  const fourPillars = {
    year: date.ganZhiYear(),    // "甲辰"
    month: date.ganZhiMonth(),  // "丙寅"
    day: date.ganZhiDay(),      // "壬午"
    hour: date.ganZhiHour(input.hour),  // "庚辰"
  };

  // 2. 解析五行统计
  const fiveElements = parseElement(fourPillars);

  // 3. 分析日主强弱、喜用神
  const analysis = analyzeDayMaster(fourPillars, fiveElements);

  // 4. 推荐吉祥物
  const mascotTraits = recommendMascot(analysis);

  return {
    fourPillars,
    fiveElements,
    favorable: analysis.favorable,
    unfavorable: analysis.unfavorable,
    mascotTraits,
  };
}
```

```typescript
// lib/bazi/five-elements.ts
const STEM_ELEMENT: Record<string, string> = {
  '甲': '木', '乙': '木',
  '丙': '火', '丁': '火',
  '戊': '土', '己': '土',
  '庚': '金', '辛': '金',
  '壬': '水', '癸': '水',
};

const BRANCH_ELEMENT: Record<string, string> = {
  '寅': '木', '卯': '木',
  '巳': '火', '午': '火',
  '辰': '土', '戌': '土', '丑': '土', '未': '土',
  '申': '金', '酉': '金',
  '亥': '水', '子': '水',
};

export function parseElement(fourPillars: FourPillars): FiveElements {
  const counts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };

  for (const pillar of Object.values(fourPillars)) {
    const stem = pillar[0];   // 天干
    const branch = pillar[1]; // 地支

    // 统计五行
    increment(counts, STEM_ELEMENT[stem]);
    increment(counts, BRANCH_ELEMENT[branch]);
  }

  return counts;
}

export function analyzeDayMaster(fourPillars: FourPillars, elements: FiveElements) {
  const dayMaster = STEM_ELEMENT[fourPillars.day[0]]; // 日主五行

  // 日主强弱分析、喜用神判断逻辑
  // ...
}
```

## 错误处理策略

- **可恢复错误**：工具返回 `{ success: false, error: "..." }`，让 AI 生成友好回复
- **对话流不中断**：AI 可以根据错误信息提供替代方案或建议

## 多轮对话支持

- 前端 `useChat` 维护完整消息历史
- 每次请求发送 `{ messages: [...] }`
- 历史包含工具调用结果，AI 可以：
  - 记住之前的八字分析
  - 重新生成不同风格的吉祥物
  - 回答关于八字的问题

## 依赖清单

```json
{
  "dependencies": {
    "ai": "^5.0.0",
    "@ai-sdk/deepseek": "^1.0.0",
    "@yhjs/lunar": "latest",
    "zod": "^3.x"
  }
}
```
