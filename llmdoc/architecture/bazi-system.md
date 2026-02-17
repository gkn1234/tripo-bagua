# 八字命理系统架构

## 1. 身份

- **定义：** 基于「分析 Agent + 对话 Agent」双 Agent 架构的八字命理系统，集成 tyme4ts/cantian-tymext 排盘、DeepSeek AI 分析与可视化渲染。
- **职责：** 接收用户生辰信息，计算四柱命盘数据，由分析 Agent 产出专业分析结论，对话 Agent 翻译为用户易懂的语言，通过 BaguaCard 可视化展示。

## 2. 核心组件

- `lib/bazi/analysis-agent.ts` (`runAnalysis`, `runAnalysisStream`, `queryClassicsTool`, `buildUserPrompt`, `extractReferences`, `ANALYSIS_SYSTEM_PROMPT`): 分析 Agent 核心。`runAnalysis` 使用 `generateText`（非流式）产出 `AnalysisEntry`；`runAnalysisStream` 使用 `streamText` + `fullStream` 迭代器，yield `AnalysisEvent`（text-delta / tool-call / tool-result / finish 四种事件）。`queryClassicsTool` 已提取为模块级 tool，两个函数共享。
- `lib/bazi/index.ts` (`calculateBazi`, `buildPillarDetail`, `buildDecadeFortunes`): 排盘计算入口，编排公历转换、四柱排盘、五行统计、神煞计算、大运推演的完整流程。
- `lib/bazi/types.ts` (`BaziInput`, `BaziResult`, `AnalysisEntry`, `AnalysisNote`, `ClassicQueryResult`, `AnalysisEvent`, `AnalysisProgress`, `Pillar`, `FourPillars`, `FiveElements`): 完整类型系统，含排盘数据、分析记忆类型、流式分析事件与进度类型。
- `lib/bazi/five-elements.ts` (`countFiveElements`, `WUXING_MAP`): 五行统计，遍历四柱天干地支计数木火土金水。
- `lib/bazi/colors.ts` (`getWuXingColor`, `WU_XING_COLORS`): 五行 OKLCH 颜色映射，供 UI 渲染使用。
- `app/api/chat/route.ts` (`analyzeBazi` tool, `deepAnalysis` tool, `buildAnalysisContext`, `currentNote`): 服务端 API 路由。`analyzeBazi` 为纯计算工具（只调用 `calculateBazi`，不调用 `runAnalysis`）。`deepAnalysis` 负责所有分析（首次综合分析 + 补充分析）。`currentNote` 闭包变量在同一请求内共享状态。`buildAnalysisContext` 将 analysisNote 注入 system prompt。
- `components/chat/bagua-card.tsx` (`BaguaCard`, `PillarColumn`, `FiveElementsBar`): 命盘可视化卡片。
- `lib/bazi/__tests__/analysis-agent.test.ts`: 分析 Agent 单元测试（7 个测试，覆盖 `extractReferences` 和 `buildUserPrompt`）。

## 3. 执行流程（LLM 检索图谱）

### 3.1 双 Agent 架构

- **分析 Agent（内层）：** `lib/bazi/analysis-agent.ts` -- 嵌入 `deepAnalysis` 工具内部执行。提供两种调用方式：`runAnalysis` 使用 `generateText`（非流式，保留向后兼容）；`runAnalysisStream` 使用 `streamText` + `fullStream` 迭代器（流式，为 `deepAnalysis` async* execute 提供事件流）。`queryClassicsTool` 已从 `runAnalysis` 内部提取为模块级 tool 定义，两个函数共享。
- **对话 Agent（外层）：** `app/api/chat/route.ts` 的 `streamText` 调用 -- 负责用户交互，通过 `buildAnalysisContext` 将 analysisNote 注入 system prompt，将分析结论翻译为用户易懂的语言。排盘后自动连续调用 `analyzeBazi` -> `deepAnalysis`（multi-step tool calling）。
- **共享记忆层：** `AnalysisNote` 对象 -- 包含 rawData（排盘结果）和 analyses（分析条目数组），通过 IndexedDB 持久化（`analysisNotes` store），客户端 Zustand 同步，transport body 携带到服务端。
- **闭包状态共享：** `currentNote` 变量在 POST handler 内声明，`analyzeBazi` 写入排盘数据后 `deepAnalysis` 可立即读取，实现同一请求内的跨工具状态传递。

### 3.2 外部库职责

- **tyme4ts（MIT）：** 提供 `SolarTime`、`LunarHour`、`EightChar`、`ChildLimit`、`DecadeFortune` 等类。负责公历/农历转换、干支历推算、天干地支属性、十神计算、纳音、大运排列。
- **cantian-tymext（闭源）：** 提供 `getShen`（神煞计算）和 `calculateRelation`（刑冲合害关系计算）。

### 3.3 完整数据流

- **1. 用户输入：** 用户在聊天中提供出生年月日时 + 性别。
- **2. 对话 Agent 确认：** 外层 Agent 复述生辰信息，等用户确认后调用 `analyzeBazi`。
- **3. 排盘计算（纯计算）：** `app/api/chat/route.ts:121-137` -- `analyzeBazi.execute` 调用 `calculateBazi(input)` 同步完成排盘，创建初始 `currentNote`（只有 rawData，analyses 保留已有或空数组），返回排盘数据。不调用 `runAnalysis`。
- **4. 自动触发综合分析（流式）：** 模型自动连续调用 `deepAnalysis`（不传 question），`app/api/chat/route.ts:140-203` 的 `async* execute` 生成器消费 `runAnalysisStream`，通过 150ms 节流 yield `AnalysisProgress` 快照。五个 phase：`started` -> `analyzing`（文本流入）-> `querying`（查阅典籍中）-> `queried`（典籍结果返回）-> `complete`（分析完成，含最终 analysisNote）。
- **5. 组装 AnalysisNote：** `runAnalysisStream` 的 `finish` 事件携带完整 `AnalysisEntry`，`deepAnalysis` 在收到 finish 后追加到 `currentNote.analyses`，最终 yield `{ phase: 'complete', analysisNote: currentNote }`。
- **6. 前端流式渲染：** `components/chat/chat-message.tsx:97-110` 在 `output-available` 状态且有 output 时渲染 `AnalysisCard`（`components/chat/analysis-card.tsx`）。从 tool part 提取 `preliminary` 字段传给 AnalysisCard，`isComplete = state === 'output-available' && !preliminary` 判断是否为最终结果。中间 yield（`preliminary: true`）和最终 yield（`preliminary` 为 falsy）均被渲染，UI 根据 `AnalysisProgress.phase` 和完成状态展示不同界面。
- **7. 前端同步：** `hooks/use-chat-session.ts:81-107` -- `syncAnalysisNote` effect 只匹配 `output-available` 状态中的 `output.analysisNote`。中间 yield 的 output 不含 `analysisNote`，因此 `output.analysisNote` 检查自然过滤了中间状态，只有最终 yield 触发持久化。
- **8. 对话 Agent 解读：** 下一轮请求时 `buildAnalysisContext` 将分析结论注入 system prompt，对话 Agent 翻译为用户友好的语言。
- **9. UI 渲染：** `chat-message.tsx` 路由到 `BaguaCard` 展示排盘数据；`AnalysisCard` 展示分析过程和结果。

### 3.4 补充分析流程（deepAnalysis）

- **1. 用户追问：** 用户提出已有分析未覆盖的问题。
- **2. 对话 Agent 判断：** 外层 Agent 发现已有分析不足以回答，调用 `deepAnalysis` 工具并传入具体 `question`。
- **3. 分析 Agent 补充（流式）：** `app/api/chat/route.ts:140-203` -- `async* execute` 消费 `runAnalysisStream` 带具体 `question`，分析 Agent 基于排盘数据和已有分析做定向深入分析，通过流式 yield 实时展示分析过程。
- **4. 记忆更新：** 新 entry 追加到 AnalysisNote，前端在 `output-available` 状态同步保存。

## 4. 设计要点

- **职责分离：** analyzeBazi 纯计算（同步、瞬间返回），deepAnalysis 负责所有 AI 分析（首次综合 + 补充分析）。分析 Agent 专注准确性和完整性，对话 Agent 专注用户体验和表达。
- **闭包状态共享：** `currentNote` 在 POST handler 作用域内声明为 `let`，`analyzeBazi` 写入后 `deepAnalysis` 可立即读取，无需等待前端同步往返。这使得 multi-step tool calling（analyzeBazi -> deepAnalysis）在单次请求内完成。
- **增量分析：** AnalysisNote 采用追加式设计，每次分析都能看到之前的结论，避免重复分析，支持渐进深入。
- **流式分析 UX：** `runAnalysisStream` 将 `streamText` 的 `fullStream` 事件拆分为四种 `AnalysisEvent`（text-delta / tool-call / tool-result / finish），`deepAnalysis` 的 `async* execute` 消费事件流并 yield `AnalysisProgress` 快照（150ms 节流），前端 `AnalysisCard` 根据 phase 和 `preliminary` prop 实时渲染分析文本、典籍查阅状态。AI SDK 6.x 中 `async* execute` 的中间 yield 和最终 yield 均为 `state: 'output-available'`，通过 `preliminary: true` 字段区分中间 yield。
- **流式属性名注意：** AI SDK 6.x `streamText.fullStream` 中：text-delta 事件用 `part.text`（非 textDelta），tool-call 事件用 `part.input`（非 args），tool-result 事件用 `part.output`（非 result）。
- **早子时算法：** `LunarHour.provider = new LunarSect2EightCharProvider()` 配置"早子时算当日"。
- **容错设计：** `getShen` 和 `calculateRelation` 均包裹在 try-catch 中，闭源库异常不会阻断主流程。
- **纯函数计算：** `calculateBazi` 为纯同步函数，无副作用，便于测试和复用。
- **Prompt 策略：** 移除了固定的五行→瑞兽对应和分析方法论约束，改为约束输出质量和分析准确性。
