# 八字数据类型参考

## 1. 核心概要

八字类型系统定义于 `lib/bazi/types.ts`，以 `BaziInput` 为输入、`BaziResult` 为输出，中间通过 `Pillar`、`TianGan`、`DiZhi` 等接口描述命盘数据。`AnalysisEntry` 和 `AnalysisNote` 构成双 Agent 架构的共享记忆层。`ClassicQueryResult`、`AnalysisEvent`、`AnalysisProgress` 支持流式分析输出。

## 2. 真相来源

- **类型定义：** `lib/bazi/types.ts` - 所有接口的完整定义（BaziInput, BaziResult, Pillar, FourPillars, TianGan, DiZhi, CangGan, FiveElements, DecadeFortune, AnalysisEntry, AnalysisNote, ClassicQueryResult, AnalysisEvent, AnalysisProgress）。
- **核心计算：** `lib/bazi/index.ts` (`calculateBazi`) - BaziResult 的实际生产者。
- **分析 Agent：** `lib/bazi/analysis-agent.ts` (`runAnalysis`, `runAnalysisStream`) - AnalysisEntry 的实际生产者。`runAnalysisStream` 产出 AnalysisEvent 流。
- **五行统计：** `lib/bazi/five-elements.ts` (`countFiveElements`) - FiveElements 的计算实现。
- **颜色映射：** `lib/bazi/colors.ts` (`WU_XING_COLORS`, `getWuXingColor`) - 五行到 OKLCH 颜色的映射表。
- **工具 Schema：** `app/api/chat/route.ts:113-206` - analyzeBazi（保存 currentGender，返回含 gender 字段）和 deepAnalysis（async* execute 生成器，传递 currentGender）工具定义。
- **持久化：** `lib/persistence/chat-db.ts` (`saveAnalysisNote`, `getAnalysisNote`) - AnalysisNote 的 IndexedDB 读写。
- **UI 消费者：** `components/chat/bagua-card.tsx` (`BaguaCard`) - BaziResult 的主要渲染组件，接收 `gender` prop 显示乾造/坤造；`components/chat/analysis-card.tsx` (`AnalysisCard`, `ClassicSubCard`, `SOURCE_LABELS`) - AnalysisProgress 的流式渲染组件，接收 `question` prop 展示追问问题，`SOURCE_LABELS` 映射典籍 ID 到中文书名。
- **架构文档：** `/llmdoc/architecture/bazi-system.md` - 八字系统的完整架构和执行流程。

## 3. 类型层级关系

```
BaziInput (输入)
  -> calculateBazi()
    -> BaziResult (输出)
         |- fourPillars: FourPillars
         |    |- year/month/day/hour: Pillar
         |         |- tianGan: TianGan (name, wuXing, yinYang, shiShen?)
         |         |- diZhi: DiZhi (name, wuXing, yinYang, cangGan[])
         |         |    |- cangGan[]: CangGan (name, shiShen)
         |         |- naYin: string
         |- fiveElements: FiveElements (wood, fire, earth, metal, water)
         |- gods: Record<'year'|'month'|'day'|'hour', string[]> (神煞, 按柱位分组, 来自 cantian-tymext)
         |- decadeFortunes: DecadeFortune[] (ganZhi, startYear, endYear, startAge, endAge)
         |- relations: Record<string, unknown> (刑冲合害, 来自 cantian-tymext)
         |- solar/lunar/bazi/zodiac/dayMaster: string (基础信息)

AnalysisNote (共享记忆层)
  |- sessionId: string (关联会话)
  |- rawData: BaziResult (排盘原始数据)
  |- analyses: AnalysisEntry[] (增量分析条目)
  |    |- question: string | null (null = 首次综合分析)
  |    |- content: string (Markdown 分析结论)
  |    |- references: string[] (引用经典, 如《子平真诠》)
  |    |- createdAt: number
  |- updatedAt: number

ClassicQueryResult (典籍查询结果)
  |- query: string (查询内容)
  |- source: string (典籍来源)
  |- chapter: string (章节)
  |- content: string (原文)
  |- score: number (相关度)

AnalysisEvent (流式事件, runAnalysisStream 产出)
  = { type: 'text-delta', textDelta: string }
  | { type: 'tool-call', query: string, source: string }
  | { type: 'tool-result', results: ClassicQueryResult[] }
  | { type: 'finish', entry: AnalysisEntry }

AnalysisProgress (deepAnalysis yield 快照)
  |- phase: 'started' | 'analyzing' | 'querying' | 'queried' | 'complete'
  |- partialText?: string (累积的分析文本)
  |- query?: string (当前查询)
  |- source?: string (当前查询的典籍)
  |- classicResults?: ClassicQueryResult[] (当前查询结果)
  |- classicQueries?: Array<{ query, source, results }> (所有已完成查询)
  |- analysisNote?: AnalysisNote (complete 时携带)
  |- error?: string
```

## 4. 关键约束

- `BaziInput.gender`: `0 | 1`（0 = 女, 1 = 男），默认值 1，影响大运顺逆和神煞计算。
- `BaziInput.minute`: 可选，默认 0，`tyme4ts` 需要但八字计算主要取决于时辰。
- `TianGan.shiShen`: 日柱天干（日主）无十神，该字段为 `undefined`。
- `gods`: `Record<'year'|'month'|'day'|'hour', string[]>`，来自闭源库 `cantian-tymext`。每个 key 对应一柱的神煞列表。计算失败时所有柱位为空数组。`relations` 来自同一闭源库，计算失败时为空对象。
- `AnalysisEntry.question`: `null` 表示首次综合分析，非 null 表示针对特定问题的补充分析。
- `AnalysisNote.analyses`: 追加式数组，每次分析追加新条目，分析 Agent 可看到所有历史条目。
