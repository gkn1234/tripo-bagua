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
| 八字排盘 | `tyme4ts` | MIT 开源，活跃维护，Lunar.js 升级版 |
| 神煞/刑冲合会 | `cantian-tymext` | bazi-mcp 底层依赖，功能完整 |
| 参数校验 | `zod` | 工具参数 schema 定义 |

> **设计决策**：参考 [cantian-ai/bazi-mcp](https://github.com/cantian-ai/bazi-mcp) 的核心计算逻辑，直接使用其底层依赖 `tyme4ts` + `cantian-tymext`，而非 MCP 协议层。详见 `docs/research-bazi-mcp.md`。

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

> 参考 bazi-mcp 的 `src/lib/bazi.ts` 实现，使用 `tyme4ts` + `cantian-tymext` 作为底层依赖。

### 目录结构

```
lib/bazi/
├── index.ts          # calculateBazi 主函数，组装完整排盘数据
├── types.ts          # TypeScript 类型定义
└── five-elements.ts  # 五行统计（从排盘数据中提取）
```

### 核心实现

```typescript
// lib/bazi/index.ts
import { SolarTime, LunarHour, Gender, ChildLimit, LunarSect2EightCharProvider } from 'tyme4ts';
import { calculateRelation, getShen } from 'cantian-tymext';
import { countFiveElements } from './five-elements';
import type { BaziInput, BaziResult } from './types';

// 使用"早子时当天"的八字算法（更常用）
LunarHour.provider = new LunarSect2EightCharProvider();

export function calculateBazi(input: BaziInput): BaziResult {
  const { year, month, day, hour, minute = 0, gender = 1 } = input;

  // 1. 公历 → SolarTime → LunarHour → EightChar
  const solarTime = SolarTime.fromYmdHms(year, month, day, hour, minute, 0);
  const lunarHour = solarTime.getLunarHour();
  const eightChar = lunarHour.getEightChar();

  // 2. 获取四柱信息
  const yearPillar = eightChar.getYear();
  const monthPillar = eightChar.getMonth();
  const dayPillar = eightChar.getDay();
  const hourPillar = eightChar.getHour();

  const me = dayPillar.getHeavenStem(); // 日主

  // 3. 构建四柱详细数据（含天干、地支、五行、阴阳、十神、藏干、纳音等）
  const fourPillars = {
    year: buildPillarDetail(yearPillar, me, 'year'),
    month: buildPillarDetail(monthPillar, me, 'month'),
    day: buildPillarDetail(dayPillar, me, 'day'),
    hour: buildPillarDetail(hourPillar, me, 'hour'),
  };

  // 4. 神煞（来自 cantian-tymext）
  const baziStr = eightChar.toString(); // "戊寅 己未 己卯 辛未"
  const gods = getShen(baziStr, gender);

  // 5. 刑冲合会（来自 cantian-tymext）
  const relations = calculateRelation({
    year: yearPillar.toString(),
    month: monthPillar.toString(),
    day: dayPillar.toString(),
    hour: hourPillar.toString(),
  });

  // 6. 大运
  const genderEnum = gender === 1 ? Gender.MALE : Gender.FEMALE;
  const childLimit = ChildLimit.fromSolarTime(solarTime, genderEnum);
  const decadeFortunes = buildDecadeFortunes(childLimit, me);

  // 7. 五行统计（自己实现）
  const fiveElements = countFiveElements(fourPillars);

  // 8. 基础信息
  const lunar = solarTime.getLunarDay();

  return {
    // 基础信息
    solar: `${year}年${month}月${day}日 ${hour}:${minute.toString().padStart(2, '0')}`,
    lunar: lunar.toString(),
    bazi: baziStr,
    zodiac: lunar.getYearSixtyCycle().getEarthBranch().getZodiac().getName(),
    dayMaster: me.getName(),

    // 四柱详情
    fourPillars,

    // 五行统计
    fiveElements,

    // 神煞
    gods,

    // 大运
    decadeFortunes,

    // 刑冲合会
    relations,
  };
}

function buildPillarDetail(pillar: SixtyCycle, me: HeavenStem, position: string) {
  const stem = pillar.getHeavenStem();
  const branch = pillar.getEarthBranch();

  return {
    ganZhi: pillar.toString(),
    tianGan: {
      name: stem.getName(),
      wuXing: stem.getElement().getName(),
      yinYang: stem.getYinYang().getName(),
      shiShen: position !== 'day' ? me.getTenStar(stem).getName() : undefined,
    },
    diZhi: {
      name: branch.getName(),
      wuXing: branch.getElement().getName(),
      yinYang: branch.getYinYang().getName(),
      cangGan: branch.getHideHeavenStems().map(h => ({
        name: h.getName(),
        shiShen: me.getTenStar(h).getName(),
      })),
    },
    naYin: pillar.getSound().getName(),
  };
}
```

### 五行统计

```typescript
// lib/bazi/five-elements.ts
import type { FourPillars, FiveElements } from './types';

const WUXING_MAP: Record<string, keyof FiveElements> = {
  '木': 'wood',
  '火': 'fire',
  '土': 'earth',
  '金': 'metal',
  '水': 'water',
};

export function countFiveElements(fourPillars: FourPillars): FiveElements {
  const counts: FiveElements = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };

  for (const pillar of Object.values(fourPillars)) {
    // 天干五行
    const stemElement = WUXING_MAP[pillar.tianGan.wuXing];
    if (stemElement) counts[stemElement]++;

    // 地支五行
    const branchElement = WUXING_MAP[pillar.diZhi.wuXing];
    if (branchElement) counts[branchElement]++;

    // 藏干五行（可选：是否计入统计）
    // for (const cg of pillar.diZhi.cangGan) { ... }
  }

  return counts;
}
```

### 喜用神处理

> **设计决策**：`tyme4ts` 和 `cantian-tymext` 均不提供喜用神判断。喜用神是命理学中主观性较强的分析，不同流派算法不同。
>
> **方案**：由 LLM（DeepSeek）根据完整排盘数据推理喜用神。在 System Prompt 中指导 AI 基于"身强身弱"原则判断。对于吉祥物设计场景，LLM 的命理推理精度已足够。

System Prompt 补充：

```
分析八字时，请根据以下原则判断喜用神：
1. 观察日主五行在四柱中的强弱（得令、得地、得生、得助）
2. 身强者喜克泄耗（官杀、食伤、财星）
3. 身弱者喜生扶（印星、比劫）
4. 结合五行统计，找出缺失或过旺的五行
5. 根据喜用神推荐对应的吉祥物元素
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
    "tyme4ts": "^1.4.2",
    "cantian-tymext": "^0.0.25",
    "zod": "^3.x"
  }
}
```

> **注意**：
> - `tyme4ts`：MIT 开源，活跃维护，提供 90% 的排盘能力
> - `cantian-tymext`：闭源但风险可控，补充神煞和刑冲合会功能
> - 项目要求 **Node.js 22+**（tyme4ts 使用 ESM + top-level await）
