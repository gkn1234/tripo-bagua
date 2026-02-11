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
  description: 'Analyze Bazi (Four Pillars of Destiny) based on birth date and time, returns complete chart data',
  inputSchema: z.object({
    year: z.number().describe('Birth year, e.g. 1990'),
    month: z.number().min(1).max(12).describe('Birth month'),
    day: z.number().min(1).max(31).describe('Birth day'),
    hour: z.number().min(0).max(23).describe('Birth hour (24-hour format)'),
    gender: z.number().min(0).max(1).optional().describe('Gender: 0-female, 1-male, default 1'),
  }),
  execute: async ({ year, month, day, hour, gender }) => {
    try {
      const result = calculateBazi({
        year,
        month,
        day,
        hour,
        gender: (gender ?? 1) as 0 | 1,
      });
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Bazi calculation failed',
      };
    }
  },
});

const generateMascot = tool({
  description: 'Generate 3D mascot model based on description',
  inputSchema: z.object({
    prompt: z.string().describe('Detailed mascot description including form, color, pose, accessories'),
    style: z.string().optional().describe('Style preference, e.g. cute, majestic, chibi'),
  }),
  execute: async ({ prompt, style }) => {
    try {
      const fullPrompt = style ? `${prompt}, ${style} style` : prompt;
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
        error: error instanceof Error ? error.message : '3D model generation failed',
      };
    }
  },
});

const systemPrompt = `You are an expert Bazi fortune teller and mascot designer.

## Workflow
1. When user provides birth date, call analyzeBazi to analyze their Bazi chart
2. Based on the Bazi analysis, design a mascot that aligns with their destiny
3. Call generateMascot to create a 3D model
4. Explain the mascot's meaning and its connection to their fortune

## Bazi Analysis Guidelines
When analyzing Bazi, determine favorable elements based on:
1. Observe Day Master's strength in the four pillars (seasonal timing, rooting, support)
2. Strong Day Master favors: controlling/draining elements (Officer, Output, Wealth)
3. Weak Day Master favors: supporting elements (Resource, Companion)
4. Check five elements distribution for deficiency or excess
5. Recommend mascot elements based on favorable elements

## Mascot Design Principles
- Be specific about form, color, pose, and accessories
- Choose elements based on favorable five elements:
  - Water: Black Tortoise, turtles, fish - black/blue colors
  - Wood: Azure Dragon, Qilin - green/cyan colors
  - Fire: Vermillion Bird, Phoenix - red/orange colors
  - Metal: White Tiger, Pixiu - white/gold colors
  - Earth: Yellow Dragon, auspicious beasts - yellow/brown colors
- Style should be refined and compact, suitable as a desk ornament`;

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
