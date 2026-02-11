const WU_XING_COLORS: Record<string, string> = {
  木: 'oklch(0.55 0.15 155)',
  火: 'oklch(0.55 0.18 25)',
  土: 'oklch(0.6 0.14 85)',
  金: 'oklch(0.7 0.1 60)',
  水: 'oklch(0.5 0.14 240)',
}

const FALLBACK = 'oklch(0.65 0 0)'

export function getWuXingColor(wuXing: string): string {
  return WU_XING_COLORS[wuXing] ?? FALLBACK
}
