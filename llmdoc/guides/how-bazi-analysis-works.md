# 八字分析工作流程指南

从用户输入到命盘渲染的完整流程说明（含双 Agent 架构），以及如何修改或扩展八字计算与分析逻辑。

## 端到端工作流程

1. **用户输入生辰：** 用户在聊天输入框中以自然语言提供出生日期时间和性别。

2. **对话 Agent 确认：** 对话 Agent 复述生辰信息（年月日时、性别），等用户明确确认。硬性规则：确认前绝不调用 analyzeBazi。参考 `app/api/chat/route.ts:25-83`（systemPrompt）。

3. **排盘（纯计算）：** `analyzeBazi.execute`（`app/api/chat/route.ts:113-140`）只做纯计算：
   - 调用 `calculateBazi(input)` 同步计算排盘（四柱、五行、神煞、大运、刑冲合害）
   - 保存 `currentGender` 闭包变量（供后续 `deepAnalysis` 传递给分析 Agent）
   - 创建初始 `currentNote`（只有 rawData，analyses 保留已有或空数组）
   - 返回 `{ success: true, data: BaziResult, analysisNote: currentNote, gender: currentGender }`（gender 供前端 BaguaCard 显示乾造/坤造）
   - **不调用 `runAnalysis`**，排盘瞬间返回

4. **综合分析（自动触发，流式）：** 模型自动连续调用 `deepAnalysis`（不传 question），`app/api/chat/route.ts:142-206` 的 `async* execute` 生成器消费 `runAnalysisStream`（传入 `currentGender`）。`buildUserPrompt` 在排盘数据前注入命主信息（性别、当前年份、虚岁），分析 Agent 使用 `stepCountIs(20)` 允许最多 20 步工具调用，通过 150ms 节流 yield `AnalysisProgress` 快照。前端 `AnalysisCard` 实时展示分析文本和典籍查阅过程。五个 phase：
   - `started`：初始骨架屏
   - `analyzing`：流式文本渲染 + 光标闪烁
   - `querying`：显示正在查阅的典籍（LoaderIcon 旋转）
   - `queried`：典籍结果作为可展开子卡片（ClassicSubCard）
   - `complete`：自动折叠为摘要行，显示引用典籍数量

5. **前端 analysisNote 同步：** `hooks/use-chat-session.ts:81-107` 的 effect 只匹配 `output-available` 状态中的 `output.analysisNote`，保存到 IndexedDB 和 Zustand。AI SDK 6.x 的 `async* execute` 中间 yield 和最终 yield 均为 `state: 'output-available'`，通过 `preliminary: true` 字段区分；中间 yield 的 output 不含 `analysisNote`，因此 `output.analysisNote` 检查自然过滤了中间状态。下次请求时 transport body 自动携带。

6. **对话 Agent 解读：** `buildAnalysisContext`（`app/api/chat/route.ts:85-104`）将分析结论注入 system prompt，对话 Agent 用大白话翻译给用户。

7. **BaguaCard 渲染命盘：** `components/chat/bagua-card.tsx` 展示四柱列、五行分布条形图、日主/生肖摘要。标题根据 `gender` prop 显示"乾造"（男）或"坤造"（女）。展开模式显示藏干、纳音、神煞、大运。

## 补充分析（deepAnalysis）

1. **用户追问：** 用户提出已有分析未覆盖的问题（如"事业方向怎么看？"）。
2. **对话 Agent 判断：** 若已有 analysisNote 中的分析不足以回答，调用 `deepAnalysis` 工具并传入具体 `question`。
3. **分析 Agent 定向分析（流式）：** `app/api/chat/route.ts:142-206` 的 `async* execute` 消费 `runAnalysisStream` 带具体 `question`（和 `currentGender`），分析 Agent 基于排盘数据和已有分析做深入分析，前端 `AnalysisCard` 实时展示分析过程，标题显示追问问题「xxx」。
4. **记忆更新：** 新 `AnalysisEntry` 追加到 `AnalysisNote.analyses` 数组，前端在 `output-available` 状态自动同步。

## 如何扩展八字计算

1. **新增计算字段：** 在 `lib/bazi/types.ts` 的 `BaziResult` 接口添加新字段，然后在 `lib/bazi/index.ts` 的 `calculateBazi` 函数中补充计算逻辑，最后在 `BaguaCard` 展开区域添加对应渲染。

2. **修改分析 Agent 提示词：** 编辑 `lib/bazi/analysis-agent.ts` 的 `ANALYSIS_SYSTEM_PROMPT`，调整分析规则和输出格式要求。

3. **修改五行统计规则：** 当前 `countFiveElements`（`lib/bazi/five-elements.ts`）仅统计天干和地支本气。如需纳入藏干，修改该函数遍历 `pillar.diZhi.cangGan` 数组。

4. **调整颜色方案：** 修改 `lib/bazi/colors.ts` 中 `WU_XING_COLORS` 的 OKLCH 值。

5. **验证修改：** 运行 `npx vitest run lib/bazi` 执行分析 Agent 单元测试。BaguaCard 渲染可在聊天中输入测试日期验证。
