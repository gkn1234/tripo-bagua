// components/chat/bagua-card.tsx
'use client'

import type { BaziResult, Pillar } from '@/lib/bazi/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { getWuXingColor } from '@/lib/bazi/colors'
import { cn } from '@/lib/utils'

interface BaguaCardProps {
  data: BaziResult
}

const WU_XING_LABELS: Record<string, string> = {
  wood: '木',
  fire: '火',
  earth: '土',
  metal: '金',
  water: '水',
}

function PillarColumn({ pillar, label, isMain }: { pillar: Pillar, label: string, isMain?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center gap-1', isMain && 'relative')}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div
        className={cn(
          'flex flex-col items-center rounded-lg border px-3 py-2 min-w-[3.5rem]',
          isMain ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
        )}
      >
        <span
          className="text-lg font-bold"
          style={{ color: getWuXingColor(pillar.tianGan.wuXing) }}
        >
          {pillar.tianGan.name}
        </span>
        <span
          className="text-lg"
          style={{ color: getWuXingColor(pillar.diZhi.wuXing) }}
        >
          {pillar.diZhi.name}
        </span>
      </div>
      {pillar.tianGan.shiShen && (
        <span className="text-[10px] text-muted-foreground">{pillar.tianGan.shiShen}</span>
      )}
    </div>
  )
}

function FiveElementsBar({ elements }: { elements: BaziResult['fiveElements'] }) {
  const entries = Object.entries(elements) as [keyof typeof WU_XING_LABELS, number][]
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <div className="space-y-1.5">
      {entries.map(([key, count]) => (
        <div key={key} className="flex items-center gap-2 text-xs">
          <span
            className="w-4 text-center font-medium"
            style={{ color: getWuXingColor(WU_XING_LABELS[key]) }}
          >
            {WU_XING_LABELS[key]}
          </span>
          <div className="h-2 flex-1 rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(count / max) * 100}%`,
                backgroundColor: getWuXingColor(WU_XING_LABELS[key]),
              }}
            />
          </div>
          <span className="w-4 text-right text-muted-foreground">{count}</span>
        </div>
      ))}
    </div>
  )
}

export function BaguaCard({ data }: BaguaCardProps) {
  const [expanded, setExpanded] = useState(false)
  const pillars: { pillar: Pillar, label: string, isMain?: boolean }[] = [
    { pillar: data.fourPillars.year, label: '年柱' },
    { pillar: data.fourPillars.month, label: '月柱' },
    { pillar: data.fourPillars.day, label: '日柱', isMain: true },
    { pillar: data.fourPillars.hour, label: '时柱' },
  ]

  return (
    <div className="mb-3 rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold font-[var(--font-display)]">八字命盘</h3>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? '收起' : '展开详情'}
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </button>
      </div>

      {/* Four Pillars */}
      <div className="mb-4 flex justify-center gap-3">
        {pillars.map(p => (
          <PillarColumn key={p.label} {...p} />
        ))}
      </div>

      {/* Five Elements Bar */}
      <div className="mb-3">
        <FiveElementsBar elements={data.fiveElements} />
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground">
        {'日主 '}
        {data.dayMaster}
        {' · 属'}
        {data.zodiac}
        {' · '}
        {data.bazi}
      </p>

      {/* Expanded Details */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300',
          expanded ? 'mt-4 max-h-[800px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="space-y-3 border-t border-border pt-3">
          {/* Hidden Stems */}
          <div>
            <h4 className="mb-1 text-xs font-medium text-muted-foreground">藏干</h4>
            <div className="space-y-0.5 text-xs">
              {(['year', 'month', 'day', 'hour'] as const).map(key => (
                <div key={key} className="flex gap-2">
                  <span className="w-8 text-muted-foreground">
                    {{ year: '年', month: '月', day: '日', hour: '时' }[key]}
                    :
                  </span>
                  <span>
                    {data.fourPillars[key].diZhi.cangGan
                      .map(cg => `${cg.name}(${cg.shiShen})`)
                      .join(' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Na Yin */}
          <div>
            <h4 className="mb-1 text-xs font-medium text-muted-foreground">纳音</h4>
            <p className="text-xs">
              {(['year', 'month', 'day', 'hour'] as const)
                .map(key => `${{ year: '年', month: '月', day: '日', hour: '时' }[key]}: ${data.fourPillars[key].naYin}`)
                .join('  ')}
            </p>
          </div>

          {/* Gods */}
          {data.gods && data.gods.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium text-muted-foreground">神煞</h4>
              <p className="text-xs">
                {data.gods.flat().join(' · ')}
              </p>
            </div>
          )}

          {/* Decade Fortunes */}
          {data.decadeFortunes && data.decadeFortunes.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium text-muted-foreground">
                大运（
                {data.decadeFortunes.length}
                步）
              </h4>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {data.decadeFortunes.map(df => (
                  <span key={df.ganZhi}>
                    {df.ganZhi}
                    (
                    {df.startAge}
                    -
                    {df.endAge}
                    )
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
