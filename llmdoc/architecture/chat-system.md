# 聊天系统架构

## 1. 身份

- **定义：** 基于 Vercel AI SDK 的全栈聊天系统，集成八字分析与 3D 吉祥物生成能力。
- **职责：** 管理用户与 AI 的实时对话、工具调用执行、消息流式渲染、会话持久化。

## 2. 核心组件

- `app/api/chat/route.ts` (`POST`, `analyzeBazi`, `generateMascot`, `retextureMascot`, `presentOptions`): 服务端 API 路由，使用 `streamText` 调用 DeepSeek 模型，定义四个工具并返回 `UIMessageStreamResponse`。`stopWhen` 配置为数组 `[stepCountIs(10), hasToolCall('presentOptions')]`（OR 语义，任一条件满足即停止 multi-step loop）。系统提示词为全中文，AI 人设为"铁口直断"的年轻命理师，在行为层和工具层双重强化"先确认再排盘"的硬性规则。
- `hooks/use-chat-session.ts` (`useChatSession`, `createSession`, `transport`): 会话管理核心 Hook，封装 AI SDK `useChat`、IndexedDB 持久化、自定义 Transport。
- `stores/chat-store.ts` (`useChatStore`, `ChatState`, `Phase`): Zustand 全局状态，管理 UI 阶段（chat/split）、modelUrl、pendingTaskId、sidebarOpen。
- `lib/persistence/chat-db.ts` (`ChatDB`, `saveSession`, `listSessions`, `getSessionMessages`): IndexedDB 持久化层，两个 ObjectStore（sessions + messages），事务性读写。
- `components/chat/index.tsx` (`Chat`): 聊天主容器，组合 Conversation + PromptInput + ChatMessage，返回会话控制函数和 UI。
- `components/chat/chat-message.tsx` (`ChatMessage`, `TOOL_TITLES`): 消息路由渲染器，遍历 `UIMessage.parts` 按类型分发到不同 UI 组件。支持 `onSendMessage` prop 用于选项按钮点击时发送消息。
- `components/chat/options-buttons.tsx` (`OptionsButtons`): 选项按钮组件，渲染 `presentOptions` 工具返回的选项列表为按钮组，支持 `disabled` 状态控制。点击按钮通过 `onSelect` 回调发送消息。
- `components/chat/model-preview.tsx` (`ModelPreview`): 3D 模型异步轮询组件，管理 pendingTaskId 生命周期和守卫机制。
- `components/ai-elements/` (Conversation, Message, PromptInput, Reasoning, Tool): Vercel AI Elements 组件库，提供对话容器、消息渲染、输入框、推理折叠、工具状态展示。

## 3. 执行流程（LLM 检索图谱）

### 3.1 三层架构

- **UI 层：** `components/ai-elements/*` + `components/chat/*` -- Vercel AI Elements 复合组件 + 业务自定义组件。
- **状态层：** `stores/chat-store.ts`（Zustand 瞬时 UI 状态）+ `hooks/use-chat-session.ts`（useChat 消息流 + 会话管理）。
- **服务层：** `app/api/chat/route.ts`（Next.js API Route）+ DeepSeek API（`@ai-sdk/deepseek`）。

### 3.2 消息发送流程

1. **用户输入：** `components/chat/index.tsx:62-77` -- PromptInput `onSubmit` 调用 `sendMessage({ text })`。
2. **Transport 注入：** `hooks/use-chat-session.ts:16-21` -- DefaultChatTransport 从 Zustand `getState()` 读取 `pendingTaskId` 注入请求体。
3. **API 处理：** `app/api/chat/route.ts:106-163` -- POST handler 解构 `{ messages, pendingTaskId }`，调用 `streamText` 配置 DeepSeek 模型、四个工具和 `stopWhen` 停止条件数组。
4. **Multi-step 循环控制：** `app/api/chat/route.ts:159` -- `stopWhen: [stepCountIs(10), hasToolCall('presentOptions')]`，OR 语义，步数达 10 或模型调用 presentOptions 后即停止循环，防止模型继续生成多余内容。
5. **流式响应：** `app/api/chat/route.ts:162` -- `result.toUIMessageStreamResponse()` 将流转换为 UI 消息格式。
6. **消息更新：** `hooks/use-chat-session.ts:32-36` -- useChat 自动解析流并更新 `messages` 数组。
7. **防抖持久化：** `hooks/use-chat-session.ts:39-53` -- 300ms 防抖后将消息写入 IndexedDB。

### 3.3 消息渲染管线

1. **消息列表：** `components/chat/index.tsx:48-56` -- `messages.map()` 遍历渲染 `ChatMessage`。
2. **Parts 路由：** `components/chat/chat-message.tsx:56-130` -- 遍历 `message.parts`，按 `type` 分发：
   - `text` -> `MessageResponse`（Streamdown Markdown 渲染）
   - `reasoning` -> `Reasoning`（可折叠推理面板）
   - `tool-analyzeBazi`（output-available）-> `BaguaCard`（八字命盘卡片）
   - `tool-generateMascot`（output-available + taskId）-> `ModelPreview`（3D 模型轮询）
   - `tool-presentOptions`（`state === 'output-available'` + `output.options`）-> `OptionsButtons`（选项按钮组，因 execute 存在故 state 为 output-available）
   - `tool-retextureMascot`（output-available + taskId）-> `ModelPreview`（复用 3D 模型轮询）
   - `tool-*`（其他状态）-> `Tool`（通用工具状态展示）

### 3.4 工具调用流程

- **analyzeBazi：** `app/api/chat/route.ts:23-41` -- 接收年月日时+性别，调用 `calculateBazi` 返回命盘数据。前端由 `BaguaCard` 渲染。
- **generateMascot：** `app/api/chat/route.ts:109-128` -- 先检查 `pendingTaskId` 防止重复提交，调用 `tripoClient.createTask` 返回 `{ taskId, status: 'pending' }`。前端由 `ModelPreview` 接管轮询。
- **retextureMascot：** `app/api/chat/route.ts:130-152` -- 对已生成模型重新生成纹理，检查 `pendingTaskId` 防重复，调用 `tripoClient.retextureModel` 返回新 `{ taskId, status: 'pending' }`。前端复用 `ModelPreview` 渲染。
- **presentOptions：** `app/api/chat/route.ts:12-21` -- 接收选项列表（label + 可选 description），**必须保留 execute**（`execute: async ({ options }) => ({ options })`）。execute 将选项数据写入 tool result，确保对话历史完整——若移除 execute，tool part state 为 `input-available` 可渲染，但对话历史缺少 tool result，DeepSeek API 会拒绝后续请求。`hasToolCall('presentOptions')` 在模型调用此工具后停止 multi-step loop，防止模型继续生成。前端由 `OptionsButtons` 渲染按钮组（匹配条件：`state === 'output-available'` + `output.options`），点击时通过 `onSendMessage` 向聊天发送消息。

### 3.5 防重复提交机制

1. **前端标记：** `components/chat/model-preview.tsx:25` -- 组件挂载时 `setPendingTaskId(taskId)` 写入 Zustand。
2. **Transport 传递：** `hooks/use-chat-session.ts:19` -- 每次请求携带 `pendingTaskId`。
3. **后端拦截：** `app/api/chat/route.ts:116-118` -- `generateMascot.execute` 检查 `pendingTaskId` 非空则拒绝。`retextureMascot.execute` 同样检查（`app/api/chat/route.ts:138-140`）。
4. **守卫清理：** `components/chat/model-preview.tsx:43-52` -- 轮询成功时校验 `getState().pendingTaskId === taskId`，防止会话切换后误更新。

### 3.6 会话持久化策略

- **Zustand（内存层）：** 管理 phase、modelUrl、pendingTaskId -- 页面刷新后重置，会话切换时 `reset()` 清空。
- **IndexedDB（持久层）：** 数据库名 `tripo-bagua`，两个 ObjectStore：`sessions`（by-updated 索引）、`messages`（sessionId 为主键）。
- **写入时机：** 消息变化后 300ms 防抖 -> `saveSession()` 事务性写入 sessions + messages。
- **读取时机：** 页面加载 -> `getLatestSession()` 恢复最新会话；会话切换 -> `getSessionMessages()` 加载历史。

## 4. 设计要点

- **presentOptions 必须有 execute：** 没有 execute 时 tool part state 是 `input-available`（可渲染），但对话历史中缺少 tool result，DeepSeek API 拒绝后续请求。execute 返回 `{ options }` 使 state 变为 `output-available`，同时 tool result 进入对话历史。
- **stopWhen 数组语义是 OR：** AI SDK 通过 `asArray()` + `isStopConditionMet` 处理数组，任一条件满足即停止。`hasToolCall('presentOptions')` 是 AI SDK v6 内置函数（位于 `ai` 包），检查最后一个 step 的 toolCalls 是否包含指定工具名。
- **系统提示词双重确认机制：** 在行为层（"怎么做事"段落）和工具层（"工具使用"段落）双重强化"先确认再排盘"指令，确保模型不会跳过确认步骤直接调用 analyzeBazi。
- **Transport body 函数模式：** transport 在模块顶层创建，使用 `() => getState()` 确保每次请求获取最新 pendingTaskId。
- **Chat 组件返回模式：** `Chat()` 返回 `{ currentSession, loadSession, newSession, ui }` 对象，分离数据控制与 UI 渲染，供 `Home` 页面灵活组合。
- **动态导入持久化模块：** `await import('@/lib/persistence/chat-db')` 减少初始包体积。
- **选择性 Zustand 订阅：** 各组件使用 selector 函数避免无关重渲染。
