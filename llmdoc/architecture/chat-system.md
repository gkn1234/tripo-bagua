# 聊天系统架构

## 1. 身份

- **定义：** 基于 Vercel AI SDK 的全栈聊天系统，集成八字分析（双 Agent）与 3D 吉祥物生成能力。
- **职责：** 管理用户与 AI 的实时对话、工具调用执行、analysisNote 共享记忆同步、消息流式渲染、会话持久化。

## 2. 核心组件

- `app/api/chat/route.ts` (`POST`, `buildAnalysisContext`, `analyzeBazi`, `deepAnalysis`, `generateMascot`, `retextureMascot`, `presentOptions`, `currentNote`): 服务端 API 路由，使用 `streamText` 调用 DeepSeek，定义五个工具。`analyzeBazi` 为纯计算工具，`deepAnalysis` 的 `question` 参数可选（不传做综合分析，传入做补充分析）。`currentNote` 闭包变量在同一请求内共享工具状态。`stopWhen` 配置为 `[stepCountIs(10), hasToolCall('presentOptions')]`（OR 语义）。
- `hooks/use-chat-session.ts` (`useChatSession`, `createSession`, `transport`, `sanitizeMessages`): 会话管理核心 Hook，封装 AI SDK `useChat`、IndexedDB 持久化、自定义 Transport（携带 `pendingTaskId` + `analysisNote`）、analysisNote 自动同步。`sanitizeMessages` 过滤不完整 tool call parts 防止 `MissingToolResultsError`。会话切换时先停止 streaming + 取消待执行 save。
- `stores/chat-store.ts` (`useChatStore`, `ChatState`, `Phase`): Zustand 全局状态，管理 phase/modelUrl/pendingTaskId/sidebarOpen/analysisNote。`reset()` 同时清空 analysisNote。
- `lib/persistence/chat-db.ts` (`ChatDB`, `saveSession`, `listSessions`, `getSessionMessages`, `saveAnalysisNote`, `getAnalysisNote`, `deleteAnalysisNote`): IndexedDB 持久化层，三个 ObjectStore（sessions + messages + analysisNotes），DB_VERSION=2。
- `components/chat/index.tsx` (`Chat`): 聊天主容器，组合 Conversation + PromptInput + ChatMessage。
- `components/chat/chat-message.tsx` (`ChatMessage`, `TOOL_TITLES`): 消息路由渲染器，支持 `onSendMessage` prop。
- `components/chat/options-buttons.tsx` (`OptionsButtons`): 选项按钮组件。
- `components/chat/model-preview.tsx` (`ModelPreview`): 3D 模型异步轮询组件。

## 3. 执行流程（LLM 检索图谱）

### 3.1 三层架构

- **UI 层：** `components/ai-elements/*` + `components/chat/*` -- Vercel AI Elements 复合组件 + 业务自定义组件。
- **状态层：** `stores/chat-store.ts`（Zustand 瞬时 UI 状态 + analysisNote）+ `hooks/use-chat-session.ts`（useChat 消息流 + 会话管理 + analysisNote 同步）。
- **服务层：** `app/api/chat/route.ts`（Next.js API Route + 双 Agent 协作）+ DeepSeek API。

### 3.2 消息发送流程

1. **用户输入：** `components/chat/index.tsx` -- PromptInput `onSubmit` 调用 `sendMessage({ text })`。
2. **Transport 注入：** `hooks/use-chat-session.ts:17-23` -- DefaultChatTransport 从 Zustand `getState()` 读取 `pendingTaskId` 和 `analysisNote` 注入请求体。
3. **API 处理：** `app/api/chat/route.ts:106-107` -- POST handler 解构 `{ messages, pendingTaskId, analysisNote }`。
4. **analysisNote 注入：** `app/api/chat/route.ts:85-104` -- `buildAnalysisContext(existingNote)` 将分析结论格式化后拼接到 system prompt 末尾。
5. **流式响应：** `streamText` 配置五个工具和 `stopWhen` 停止条件，返回 `UIMessageStreamResponse`。
6. **消息更新：** `useChat` 自动解析流并更新 `messages` 数组。
7. **analysisNote 同步：** `hooks/use-chat-session.ts:58-85` -- effect 检测 `analyzeBazi`/`deepAnalysis` 工具输出中的 `analysisNote`，保存到 IndexedDB + Zustand。
8. **防抖持久化：** `hooks/use-chat-session.ts:40-56` -- 300ms 防抖后将消息写入 IndexedDB。

### 3.3 消息渲染管线

1. **消息列表：** `components/chat/index.tsx` -- `messages.map()` 遍历渲染 `ChatMessage`。
2. **Parts 路由：** `components/chat/chat-message.tsx` -- 遍历 `message.parts`，按 `type` 分发：
   - `text` -> `MessageResponse`（Streamdown Markdown 渲染）
   - `reasoning` -> `Reasoning`（可折叠推理面板）
   - `tool-analyzeBazi`（output-available）-> `BaguaCard`（八字命盘卡片）
   - `tool-generateMascot`（output-available + taskId）-> `ModelPreview`
   - `tool-retextureMascot`（output-available + taskId）-> `ModelPreview`
   - `tool-presentOptions`（output-available + output.options）-> `OptionsButtons`
   - `tool-deepAnalysis`（output-available + output）-> `AnalysisCard`（流式分析卡片，从 tool part 提取 `preliminary` 字段区分中间/最终 yield，根据 AnalysisProgress.phase 渲染不同状态）
   - `tool-*`（其他状态）-> `Tool`

### 3.4 工具调用流程

- **analyzeBazi：** `app/api/chat/route.ts:112-138` -- 纯计算工具，调用 `calculateBazi` 排盘，创建初始 `currentNote`（只有 rawData，无 analyses），返回 `{ data, analysisNote }`。不调用 `runAnalysis`。
- **deepAnalysis：** `app/api/chat/route.ts:140-203` -- `async* execute` 生成器工具（AI SDK 6.x 特性）。`question` 参数可选。消费 `runAnalysisStream` async generator，通过 150ms 节流 yield `AnalysisProgress` 快照。五个 phase：`started` -> `analyzing`（文本 delta 累积）-> `querying`（查阅典籍中）-> `queried`（典籍结果返回）-> `complete`（含最终 analysisNote）。AI SDK 6.x 的 `async* execute` 没有 `partial-output-available` 状态：中间 yield 和最终 yield 均为 `state: 'output-available'`，中间 yield 带 `preliminary: true` 字段区分。
- **generateMascot：** `app/api/chat/route.ts:178-198` -- 检查 `pendingTaskId` 防重复，支持 `negativePrompt` 参数，调用 `tripoClient.createTask` 返回 taskId。
- **retextureMascot：** `app/api/chat/route.ts:200-222` -- 对已生成模型重新生成纹理，检查 `pendingTaskId` 防重复。
- **presentOptions：** `app/api/chat/route.ts:14-23` -- execute 返回 `{ options }` 填充 tool result。`hasToolCall('presentOptions')` 停止 multi-step loop。

### 3.5 防重复提交机制

1. **前端标记：** `ModelPreview` 挂载时 `setPendingTaskId(taskId)` 写入 Zustand。
2. **Transport 传递：** 每次请求携带 `pendingTaskId`。
3. **后端拦截：** `generateMascot.execute` 和 `retextureMascot.execute` 检查 `pendingTaskId` 非空则拒绝。
4. **守卫清理：** `ModelPreview` 轮询成功时校验 `getState().pendingTaskId === taskId`，防止会话切换后误更新。

### 3.6 会话切换防御机制

- **问题：** 会话切换时，若上一个会话有活跃 streaming 或待执行的 save timer，不完整的 tool call parts（state 不是 `output-available`）会被写入 IndexedDB，下次加载时触发 AI SDK 的 `MissingToolResultsError`。
- **sanitizeMessages：** `hooks/use-chat-session.ts:26-41` -- 过滤 assistant 消息中 state 不为 `output-available` 的 tool-* parts，应用于 init 加载和 loadSession 加载两个入口。
- **停止 streaming：** `loadSession` 和 `newSession` 在切换前调用 `chatStopRef.current()` 停止活跃的 AI 流式响应。
- **取消待执行 save：** `clearTimeout(saveTimerRef.current)` 取消 300ms 防抖定时器，防止不完整消息写入 IndexedDB。

### 3.7 会话持久化策略

- **Zustand（内存层）：** 管理 phase、modelUrl、pendingTaskId、analysisNote -- 页面刷新后重置，会话切换时 `reset()` 清空（含 analysisNote）。
- **IndexedDB（持久层）：** 数据库名 `tripo-bagua`，DB_VERSION=2，三个 ObjectStore：`sessions`（by-updated 索引）、`messages`（sessionId 为主键）、`analysisNotes`（sessionId 为主键，v2 新增）。
- **写入时机：** 消息变化后 300ms 防抖 -> `saveSession()`；analysisNote 变化时 -> `saveAnalysisNote()` 立即写入。
- **读取时机：** 页面加载 -> `getLatestSession()` + `getAnalysisNote()` 恢复；会话切换 -> `getSessionMessages()` + `getAnalysisNote()` 加载。
- **删除：** `deleteSession` 事务性删除 sessions + messages + analysisNotes。

## 4. 设计要点

- **presentOptions 必须有 execute：** 没有 execute 时 tool part state 是 `input-available`，但对话历史缺少 tool result 会导致 DeepSeek API 拒绝后续请求。
- **stopWhen 数组语义是 OR：** 任一条件满足即停止。
- **Transport body 携带 analysisNote：** 每次请求将内存中的 analysisNote 传给服务端，服务端用于 `buildAnalysisContext` 注入 system prompt 和 `runAnalysis` 的上下文。
- **analysisNote 同步兼容性：** `hooks/use-chat-session.ts` 的 `syncAnalysisNote` effect 只匹配 `output-available` 状态中的 `output.analysisNote`，中间 yield（`preliminary: true`）的 output 中不含 `analysisNote`，因此 `output.analysisNote` 检查自然过滤了中间状态。`sanitizeMessages` 无需改动。
- **async* execute 生成器工具：** AI SDK 6.x 特性。`deepAnalysis` 使用 `async*` 函数签名，中间 yield 和最终 yield 在前端 tool part 上均为 `state: 'output-available'`，通过 `preliminary: true` 字段区分中间 yield。最终 yield 的 `preliminary` 为 falsy。前端 `chat-message.tsx:100` 从 tool part 提取 `preliminary` 传给 `AnalysisCard`。
- **Chat 组件返回模式：** `Chat()` 返回 `{ currentSession, loadSession, newSession, ui }` 对象，分离数据控制与 UI 渲染。
- **动态导入持久化模块：** `await import('@/lib/persistence/chat-db')` 减少初始包体积。
