// lib/bazi/types.ts

export interface BaziInput {
  year: number
  month: number
  day: number
  hour: number
  minute?: number
  gender?: 0 | 1 // 0: female, 1: male
}

export interface TianGan {
  name: string // Heavenly Stem name, e.g. "甲"
  wuXing: string // Five Elements, e.g. "木" (Wood)
  yinYang: string // Yin/Yang, e.g. "阳" (Yang)
  shiShen?: string // Ten Gods, e.g. "正官" (day pillar has no shiShen)
}

export interface CangGan {
  name: string // Hidden Stem name, e.g. "甲"
  shiShen: string // Ten Gods
}

export interface DiZhi {
  name: string // Earthly Branch name, e.g. "寅"
  wuXing: string // Five Elements
  yinYang: string // Yin/Yang
  cangGan: CangGan[] // Hidden Stems (main, middle, residual qi)
}

export interface Pillar {
  ganZhi: string // Stem-Branch pair, e.g. "甲寅"
  tianGan: TianGan
  diZhi: DiZhi
  naYin: string // Na Yin (sound), e.g. "大溪水"
}

export interface FourPillars {
  year: Pillar
  month: Pillar
  day: Pillar
  hour: Pillar
}

export interface FiveElements {
  wood: number
  fire: number
  earth: number
  metal: number
  water: number
}

export interface DecadeFortune {
  ganZhi: string
  startYear: number
  endYear: number
  startAge: number
  endAge: number
}

export interface BaziResult {
  // Basic info
  solar: string
  lunar: string
  bazi: string
  zodiac: string
  dayMaster: string

  // Four Pillars detail
  fourPillars: FourPillars

  // Five Elements count
  fiveElements: FiveElements

  // Spirit Sha (gods) - array of [pillar, shenSha[]] pairs
  gods: string[][]

  // Decade Fortunes
  decadeFortunes: DecadeFortune[]

  // Punishment/Clash/Combination relations
  relations: Record<string, unknown>
}

export interface AnalysisEntry {
  question: string | null // 触发问题（null = 首次综合分析）
  content: string // 分析结论（Markdown）
  references: string[] // 引用的经典出处
  createdAt: number
}

export interface AnalysisNote {
  sessionId: string
  rawData: BaziResult
  analyses: AnalysisEntry[]
  updatedAt: number
}
