# Chat Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the chat backend API with DeepSeek integration, Bazi analysis tool, and Tripo 3D generation tool.

**Architecture:** Next.js API Route using Vercel AI SDK's `streamText` with multi-step tool execution. Two tools: `analyzeBazi` (powered by tyme4ts + cantian-tymext) and `generateMascot` (Tripo API with internal polling). LLM infers 喜用神 from structured bazi data.

**Tech Stack:** `ai@5`, `@ai-sdk/deepseek`, `tyme4ts`, `cantian-tymext`, `zod`

**Design Doc:** `docs/plans/2026-02-11-chat-backend-design.md`

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install core dependencies**

Run:
```bash
pnpm add ai @ai-sdk/deepseek tyme4ts cantian-tymext zod
```

**Step 2: Verify installation**

Run:
```bash
pnpm list ai @ai-sdk/deepseek tyme4ts cantian-tymext zod
```

Expected: All packages listed with versions

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add backend dependencies (ai-sdk, tyme4ts, cantian-tymext)"
```

---

## Task 2: Create Bazi Types

**Files:**
- Create: `lib/bazi/types.ts`

**Step 1: Write type definitions**

```typescript
// lib/bazi/types.ts

export interface BaziInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  gender?: 0 | 1; // 0: female, 1: male
}

export interface TianGan {
  name: string;      // 天干名，如 "甲"
  wuXing: string;    // 五行，如 "木"
  yinYang: string;   // 阴阳，如 "阳"
  shiShen?: string;  // 十神，如 "正官"（日柱天干无十神）
}

export interface CangGan {
  name: string;      // 藏干名，如 "甲"
  shiShen: string;   // 十神
}

export interface DiZhi {
  name: string;       // 地支名，如 "寅"
  wuXing: string;     // 五行
  yinYang: string;    // 阴阳
  cangGan: CangGan[]; // 藏干（主气、中气、余气）
}

export interface Pillar {
  ganZhi: string;     // 干支，如 "甲寅"
  tianGan: TianGan;
  diZhi: DiZhi;
  naYin: string;      // 纳音，如 "大溪水"
}

export interface FourPillars {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: Pillar;
}

export interface FiveElements {
  wood: number;
  fire: number;
  earth: number;
  metal: number;
  water: number;
}

export interface DecadeFortune {
  ganZhi: string;
  startYear: number;
  endYear: number;
  startAge: number;
  endAge: number;
}

export interface BaziResult {
  // 基础信息
  solar: string;
  lunar: string;
  bazi: string;
  zodiac: string;
  dayMaster: string;

  // 四柱详情
  fourPillars: FourPillars;

  // 五行统计
  fiveElements: FiveElements;

  // 神煞
  gods: Record<string, string[]>;

  // 大运
  decadeFortunes: DecadeFortune[];

  // 刑冲合会
  relations: Record<string, unknown>;
}
```

**Step 2: Commit**

```bash
git add lib/bazi/types.ts
git commit -m "feat(bazi): add TypeScript type definitions"
```

---

## Task 3: Implement Five Elements Counter

**Files:**
- Create: `lib/bazi/five-elements.ts`
- Test: `lib/bazi/__tests__/five-elements.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/bazi/__tests__/five-elements.test.ts
import { describe, it, expect } from 'vitest';
import { countFiveElements } from '../five-elements';
import type { FourPillars } from '../types';

describe('countFiveElements', () => {
  it('counts five elements from four pillars', () => {
    const fourPillars: FourPillars = {
      year: {
        ganZhi: '戊寅',
        tianGan: { name: '戊', wuXing: '土', yinYang: '阳', shiShen: '劫财' },
        diZhi: { name: '寅', wuXing: '木', yinYang: '阳', cangGan: [] },
        naYin: '城头土',
      },
      month: {
        ganZhi: '己未',
        tianGan: { name: '己', wuXing: '土', yinYang: '阴', shiShen: '比肩' },
        diZhi: { name: '未', wuXing: '土', yinYang: '阴', cangGan: [] },
        naYin: '天上火',
      },
      day: {
        ganZhi: '己卯',
        tianGan: { name: '己', wuXing: '土', yinYang: '阴' },
        diZhi: { name: '卯', wuXing: '木', yinYang: '阴', cangGan: [] },
        naYin: '城头土',
      },
      hour: {
        ganZhi: '辛未',
        tianGan: { name: '辛', wuXing: '金', yinYang: '阴', shiShen: '食神' },
        diZhi: { name: '未', wuXing: '土', yinYang: '阴', cangGan: [] },
        naYin: '路旁土',
      },
    };

    const result = countFiveElements(fourPillars);

    expect(result).toEqual({
      wood: 2,  // 寅 + 卯
      fire: 0,
      earth: 5, // 戊 + 未 + 己 + 己 + 未
      metal: 1, // 辛
      water: 0,
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/bazi/__tests__/five-elements.test.ts`

Expected: FAIL - module not found

**Step 3: Write implementation**

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
  }

  return counts;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/bazi/__tests__/five-elements.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add lib/bazi/five-elements.ts lib/bazi/__tests__/five-elements.test.ts
git commit -m "feat(bazi): implement five elements counter with tests"
```

---

## Task 4: Implement Bazi Calculator

**Files:**
- Create: `lib/bazi/index.ts`
- Test: `lib/bazi/__tests__/index.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/bazi/__tests__/index.test.ts
import { describe, it, expect } from 'vitest';
import { calculateBazi } from '../index';

describe('calculateBazi', () => {
  it('calculates bazi for a known date', () => {
    // 1998年7月31日 14:10 → 戊寅 己未 己卯 辛未
    const result = calculateBazi({
      year: 1998,
      month: 7,
      day: 31,
      hour: 14,
      minute: 10,
      gender: 1,
    });

    expect(result.bazi).toBe('戊寅 己未 己卯 辛未');
    expect(result.zodiac).toBe('虎');
    expect(result.dayMaster).toBe('己');
    expect(result.fourPillars.year.ganZhi).toBe('戊寅');
    expect(result.fourPillars.month.ganZhi).toBe('己未');
    expect(result.fourPillars.day.ganZhi).toBe('己卯');
    expect(result.fourPillars.hour.ganZhi).toBe('辛未');
  });

  it('includes five elements count', () => {
    const result = calculateBazi({
      year: 1998,
      month: 7,
      day: 31,
      hour: 14,
      gender: 1,
    });

    expect(result.fiveElements).toBeDefined();
    expect(result.fiveElements.earth).toBeGreaterThan(0);
  });

  it('includes decade fortunes', () => {
    const result = calculateBazi({
      year: 1998,
      month: 7,
      day: 31,
      hour: 14,
      gender: 1,
    });

    expect(result.decadeFortunes).toBeDefined();
    expect(result.decadeFortunes.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/bazi/__tests__/index.test.ts`

Expected: FAIL - module not found

**Step 3: Write implementation**

```typescript
// lib/bazi/index.ts
import {
  SolarTime,
  LunarHour,
  Gender,
  ChildLimit,
  LunarSect2EightCharProvider,
  type SixtyCycle,
  type HeavenStem,
} from 'tyme4ts';
import { calculateRelation, getShen } from 'cantian-tymext';
import { countFiveElements } from './five-elements';
import type { BaziInput, BaziResult, Pillar, DecadeFortune } from './types';

// 使用"早子时当天"的八字算法
LunarHour.provider = new LunarSect2EightCharProvider();

export function calculateBazi(input: BaziInput): BaziResult {
  const { year, month, day, hour, minute = 0, gender = 1 } = input;

  // 1. 公历 → SolarTime → LunarHour → EightChar
  const solarTime = SolarTime.fromYmdHms(year, month, day, hour, minute, 0);
  const lunarHour = solarTime.getLunarHour();
  const eightChar = lunarHour.getEightChar();

  // 2. 获取四柱
  const yearPillar = eightChar.getYear();
  const monthPillar = eightChar.getMonth();
  const dayPillar = eightChar.getDay();
  const hourPillar = eightChar.getHour();

  const me = dayPillar.getHeavenStem(); // 日主

  // 3. 构建四柱详细数据
  const fourPillars = {
    year: buildPillarDetail(yearPillar, me, 'year'),
    month: buildPillarDetail(monthPillar, me, 'month'),
    day: buildPillarDetail(dayPillar, me, 'day'),
    hour: buildPillarDetail(hourPillar, me, 'hour'),
  };

  // 4. 神煞
  const baziStr = eightChar.toString();
  let gods: Record<string, string[]> = {};
  try {
    gods = getShen(baziStr, gender);
  } catch {
    // cantian-tymext 可能抛出异常，忽略
  }

  // 5. 刑冲合会
  let relations: Record<string, unknown> = {};
  try {
    relations = calculateRelation({
      year: yearPillar.toString(),
      month: monthPillar.toString(),
      day: dayPillar.toString(),
      hour: hourPillar.toString(),
    });
  } catch {
    // 忽略异常
  }

  // 6. 大运
  const genderEnum = gender === 1 ? Gender.MALE : Gender.FEMALE;
  const decadeFortunes = buildDecadeFortunes(solarTime, genderEnum, me);

  // 7. 五行统计
  const fiveElements = countFiveElements(fourPillars);

  // 8. 基础信息
  const lunar = solarTime.getLunarDay();

  return {
    solar: `${year}年${month}月${day}日 ${hour}:${minute.toString().padStart(2, '0')}`,
    lunar: lunar.toString(),
    bazi: baziStr,
    zodiac: lunar.getYearSixtyCycle().getEarthBranch().getZodiac().getName(),
    dayMaster: me.getName(),
    fourPillars,
    fiveElements,
    gods,
    decadeFortunes,
    relations,
  };
}

function buildPillarDetail(
  pillar: SixtyCycle,
  me: HeavenStem,
  position: 'year' | 'month' | 'day' | 'hour'
): Pillar {
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
      cangGan: branch.getHideHeavenStems().map((h) => ({
        name: h.getName(),
        shiShen: me.getTenStar(h).getName(),
      })),
    },
    naYin: pillar.getSound().getName(),
  };
}

function buildDecadeFortunes(
  solarTime: SolarTime,
  gender: Gender,
  _me: HeavenStem
): DecadeFortune[] {
  try {
    const childLimit = ChildLimit.fromSolarTime(solarTime, gender);
    const startFortune = childLimit.getStartDecadeFortune();
    const fortunes: DecadeFortune[] = [];

    let current = startFortune;
    for (let i = 0; i < 10; i++) {
      fortunes.push({
        ganZhi: current.getSixtyCycle().toString(),
        startYear: current.getStartLunarYear().getYear(),
        endYear: current.getEndLunarYear().getYear(),
        startAge: current.getStartAge(),
        endAge: current.getEndAge(),
      });
      current = current.next(1);
    }

    return fortunes;
  } catch {
    return [];
  }
}

export type { BaziInput, BaziResult } from './types';
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/bazi/__tests__/index.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add lib/bazi/index.ts lib/bazi/__tests__/index.test.ts
git commit -m "feat(bazi): implement bazi calculator with tyme4ts"
```

---

## Task 5: Implement Tripo Client

**Files:**
- Modify: `lib/tripo.ts` (replace placeholder)

**Step 1: Read existing placeholder**

Check current content: `lib/tripo.ts`

**Step 2: Write implementation**

```typescript
// lib/tripo.ts
const TRIPO_API_BASE = 'https://api.tripo3d.ai/v2/openapi';

export interface TripoTask {
  task_id: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  progress?: number;
  output?: {
    model: string;
    rendered_image?: string;
  };
}

export interface TripoCreateTaskResponse {
  code: number;
  message?: string;
  data: {
    task_id: string;
  };
}

export interface TripoGetTaskResponse {
  code: number;
  message?: string;
  data: TripoTask;
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

    const data: TripoCreateTaskResponse = await res.json();

    if (data.code !== 0) {
      throw new Error(data.message || `Tripo API error: code ${data.code}`);
    }

    return data.data.task_id;
  },

  async getTask(taskId: string): Promise<TripoTask> {
    const res = await fetch(`${TRIPO_API_BASE}/task/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.TRIPO_API_KEY}`,
      },
    });

    const data: TripoGetTaskResponse = await res.json();

    if (data.code !== 0) {
      throw new Error(data.message || `Tripo API error: code ${data.code}`);
    }

    return data.data;
  },

  async waitForCompletion(
    taskId: string,
    options: { timeout: number; interval: number } = { timeout: 120_000, interval: 3_000 }
  ): Promise<TripoTask> {
    const startTime = Date.now();

    while (Date.now() - startTime < options.timeout) {
      const task = await this.getTask(taskId);

      if (task.status === 'success') {
        return task;
      }

      if (task.status === 'failed') {
        throw new Error('3D model generation failed');
      }

      await new Promise((resolve) => setTimeout(resolve, options.interval));
    }

    throw new Error('3D model generation timeout');
  },
};
```

**Step 3: Commit**

```bash
git add lib/tripo.ts
git commit -m "feat(tripo): implement Tripo API client with polling"
```

---

## Task 6: Create Chat API Route

**Files:**
- Modify: `app/api/chat/route.ts` (replace placeholder)

**Step 1: Read existing placeholder**

Check current content: `app/api/chat/route.ts`

**Step 2: Write implementation**

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

const analyzeBazi = tool({
  description: '根据出生日期时间分析八字命理，返回完整的八字排盘数据',
  parameters: z.object({
    year: z.number().describe('出生年份，如 1990'),
    month: z.number().min(1).max(12).describe('出生月份'),
    day: z.number().min(1).max(31).describe('出生日期'),
    hour: z.number().min(0).max(23).describe('出生时辰（24小时制）'),
    gender: z.number().min(0).max(1).optional().describe('性别：0-女，1-男，默认1'),
  }),
  execute: async (input) => {
    try {
      const result = calculateBazi({
        ...input,
        gender: (input.gender ?? 1) as 0 | 1,
      });
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '八字计算失败',
      };
    }
  },
});

const generateMascot = tool({
  description: '根据吉祥物描述生成 3D 模型',
  parameters: z.object({
    prompt: z.string().describe('吉祥物的详细描述，包括形态、颜色、姿态、配饰等'),
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
        modelUrl: result.output?.model,
        taskId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '3D 模型生成失败',
      };
    }
  },
});

const systemPrompt = `你是一位精通八字命理的吉祥物设计师。

## 工作流程
1. 用户提供出生日期时，调用 analyzeBazi 分析八字
2. 根据八字分析结果，设计一个契合用户命理的吉祥物
3. 调用 generateMascot 生成 3D 模型
4. 向用户介绍吉祥物的寓意和命理关联

## 八字分析指南
分析八字时，请根据以下原则判断喜用神：
1. 观察日主五行在四柱中的强弱（得令、得地、得生、得助）
2. 身强者喜克泄耗（官杀、食伤、财星）
3. 身弱者喜生扶（印星、比劫）
4. 结合五行统计，找出缺失或过旺的五行
5. 根据喜用神推荐对应的吉祥物元素

## 吉祥物设计原则
- 描述要具体（形态、颜色、姿态、配饰）
- 结合五行喜用神选择合适的元素：
  - 水：玄武、龟、鱼类，黑色/蓝色
  - 木：青龙、麒麟，青色/绿色
  - 火：朱雀、凤凰，红色/橙色
  - 金：白虎、貔貅，白色/金色
  - 土：黄龙、瑞兽，黄色/褐色
- 风格偏向精致小巧，适合作为摆件`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: deepseek('deepseek-chat'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: { analyzeBazi, generateMascot },
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
```

**Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(api): implement chat route with AI tools"
```

---

## Task 7: Update Environment Variables

**Files:**
- Modify: `.env.example`

**Step 1: Add required variables**

```bash
# .env.example
DEEPSEEK_API_KEY=your-deepseek-api-key
TRIPO_API_KEY=your-tripo-api-key
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add DEEPSEEK_API_KEY to env template"
```

---

## Task 8: Integration Test (Manual)

**Step 1: Start development server**

Run: `pnpm dev`

**Step 2: Test bazi calculation endpoint**

Create a test file or use curl:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "我是1998年7月31日下午2点出生的男生"}
    ]
  }'
```

**Step 3: Verify response**

Expected: Streaming response with bazi analysis tool call, followed by AI interpretation.

---

## Task 9: Final Cleanup and Documentation

**Step 1: Run linter**

Run: `pnpm lint:fix`

**Step 2: Run all tests**

Run: `pnpm vitest run`

Expected: All tests pass

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: lint and cleanup"
```

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| 1 | Install dependencies | - |
| 2 | Create Bazi types | - |
| 3 | Implement five elements counter | - |
| 4 | Implement Bazi calculator | - |
| 5 | Implement Tripo client | - |
| 6 | Create Chat API route | - |
| 7 | Update environment variables | - |
| 8 | Integration test | - |
| 9 | Final cleanup | - |

**Total estimated time:** 30-45 minutes
