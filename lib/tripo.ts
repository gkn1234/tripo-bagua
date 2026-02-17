// lib/tripo.ts
const TRIPO_API_BASE = 'https://api.tripo3d.ai/v2/openapi'

export interface TripoTask {
  task_id: string
  status: 'queued' | 'running' | 'success' | 'failed'
  progress?: number
  output?: {
    pbr_model: string
    rendered_image?: string
  }
}

export interface TripoCreateTaskResponse {
  code: number
  message?: string
  data: {
    task_id: string
  }
}

export interface TripoGetTaskResponse {
  code: number
  message?: string
  data: TripoTask
}

export const tripoClient = {
  async createTask(
    prompt: string,
    options?: { negativePrompt?: string },
  ): Promise<string> {
    const res = await fetch(`${TRIPO_API_BASE}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TRIPO_API_KEY}`,
      },
      body: JSON.stringify({
        type: 'text_to_model',
        prompt,
        negative_prompt: options?.negativePrompt ?? 'blurry, low quality, multiple heads, floating parts, disconnected geometry, extra limbs, deformed',
        model_version: 'v3.0-20250812',
        texture_quality: 'detailed',
      }),
    })

    const data: TripoCreateTaskResponse = await res.json()

    if (data.code !== 0) {
      throw new Error(data.message || `Tripo API error: code ${data.code}`)
    }

    return data.data.task_id
  },

  async getTask(taskId: string): Promise<TripoTask> {
    const res = await fetch(`${TRIPO_API_BASE}/task/${taskId}`, {
      headers: {
        Authorization: `Bearer ${process.env.TRIPO_API_KEY}`,
      },
    })

    const data: TripoGetTaskResponse = await res.json()

    if (data.code !== 0) {
      throw new Error(data.message || `Tripo API error: code ${data.code}`)
    }

    return data.data
  },

  async waitForCompletion(
    taskId: string,
    options: { timeout: number, interval: number } = { timeout: 120_000, interval: 3_000 },
  ): Promise<TripoTask> {
    const startTime = Date.now()

    while (Date.now() - startTime < options.timeout) {
      const task = await this.getTask(taskId)

      if (task.status === 'success') {
        return task
      }

      if (task.status === 'failed') {
        throw new Error('3D model generation failed')
      }

      await new Promise(resolve => setTimeout(resolve, options.interval))
    }

    throw new Error('3D model generation timeout')
  },

  async retextureModel(
    originalTaskId: string,
    options?: {
      prompt?: string
      textureSeed?: number
      textureQuality?: 'standard' | 'detailed'
    },
  ): Promise<string> {
    const body: Record<string, unknown> = {
      type: 'texture_model',
      original_model_task_id: originalTaskId,
      texture: true,
      pbr: true,
      texture_quality: options?.textureQuality ?? 'standard',
    }
    if (options?.prompt) {
      body.texture_prompt = { text: options.prompt }
    }
    if (options?.textureSeed != null) {
      body.texture_seed = options.textureSeed
    }

    const res = await fetch(`${TRIPO_API_BASE}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TRIPO_API_KEY}`,
      },
      body: JSON.stringify(body),
    })

    const data: TripoCreateTaskResponse = await res.json()

    if (data.code !== 0) {
      throw new Error(data.message || `Tripo API error: code ${data.code}`)
    }

    return data.data.task_id
  },
}
