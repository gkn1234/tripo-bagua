'use client'

import type { AnalysisProgress, ClassicQueryResult } from '@/lib/bazi/types'
import { BookOpenIcon, CheckCircleIcon, ChevronDownIcon, LoaderIcon, SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { MessageResponse } from '@/components/ai-elements/message'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface AnalysisCardProps {
  progress: AnalysisProgress
  state: string
}

function ClassicSubCard({ query, source, results, isLoading }: {
  query: string
  source: string
  results?: ClassicQueryResult[]
  isLoading?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-muted bg-muted/30">
      <CollapsibleTrigger className="flex w-full items-center gap-2 p-2 text-xs">
        {isLoading
          ? <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
          : <BookOpenIcon className="size-3.5 text-muted-foreground" />}
        <span className="flex-1 text-left">
          {isLoading ? `正在查阅《${source}》...` : `查阅《${source}》`}
        </span>
        {!isLoading && results && (
          <Badge variant="secondary" className="text-[10px]">
            {results.length}
            {' '}
            条
          </Badge>
        )}
        {!isLoading && (
          <ChevronDownIcon className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        )}
      </CollapsibleTrigger>
      {!isLoading && results && (
        <CollapsibleContent className="border-t border-muted px-3 py-2 text-xs text-muted-foreground space-y-2">
          <div className="text-[10px] text-muted-foreground/60">
            查询:
            {' '}
            {query}
          </div>
          {results.map((r, i) => (
            <blockquote key={i} className="border-l-2 border-primary/30 pl-2">
              <div className="font-medium text-foreground/80">
                {r.source}
                {' '}
                ·
                {' '}
                {r.chapter}
              </div>
              <div className="mt-0.5 line-clamp-3">{r.content}</div>
            </blockquote>
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export function AnalysisCard({ progress, state }: AnalysisCardProps) {
  const isComplete = state === 'output-available' || progress.phase === 'complete'
  const [collapsed, setCollapsed] = useState(false)

  const shouldCollapse = isComplete && !progress.error

  const classicCount = progress.classicQueries?.length ?? 0
  const summaryText = progress.error
    ? `分析失败: ${progress.error}`
    : `分析完成 · 引用 ${classicCount} 部典籍`

  return (
    <Collapsible
      open={shouldCollapse ? !collapsed : true}
      onOpenChange={(open) => {
        if (shouldCollapse)
          setCollapsed(!open)
      }}
      className="not-prose mb-4 w-full rounded-md border"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 p-3">
        <div className="flex items-center gap-2">
          {isComplete
            ? <CheckCircleIcon className="size-4 text-green-600" />
            : <SearchIcon className="size-4 animate-pulse text-primary" />}
          <span className="font-medium text-sm">
            {isComplete ? summaryText : '命盘深入分析'}
          </span>
          {!isComplete && progress.phase !== 'started' && (
            <Badge variant="secondary" className="text-xs">分析中</Badge>
          )}
        </div>
        {isComplete && (
          <ChevronDownIcon className={cn(
            'size-4 text-muted-foreground transition-transform',
            !collapsed && 'rotate-180',
          )}
          />
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 border-t px-4 py-3">
        {/* Streaming analysis text */}
        {progress.partialText && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MessageResponse>{progress.partialText}</MessageResponse>
            {!isComplete && <span className="inline-block h-4 w-0.5 animate-pulse bg-primary" />}
          </div>
        )}

        {/* Shimmer skeleton when started but no text yet */}
        {progress.phase === 'started' && !progress.partialText && (
          <div className="space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        )}

        {/* Completed classic queries as sub-cards */}
        {progress.classicQueries?.map((cq, i) => (
          <ClassicSubCard
            key={`done-${i}`}
            query={cq.query}
            source={cq.source}
            results={cq.results}
          />
        ))}

        {/* Currently loading classic query */}
        {progress.phase === 'querying' && progress.query && progress.source && (
          <ClassicSubCard
            query={progress.query}
            source={progress.source}
            isLoading
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
