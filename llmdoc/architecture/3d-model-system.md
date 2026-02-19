# 3D 模型生成与查看系统架构

## 1. Identity

- **定义:** 基于 Tripo API v3.0 的异步非阻塞 3D 模型生成管线，集成 React Three Fiber 渲染和代理路由层。
- **用途:** 将 AI 工具调用转化为 3D GLB 模型，通过前端轮询追踪生成进度，最终在分屏布局中渲染展示。

## 2. 核心组件

- `lib/tripo.ts` (`tripoClient`, `createTask`, `getTask`, `waitForCompletion`, `retextureModel`, `TripoTask`): Tripo API 客户端，封装任务创建、纹理重生成、状态查询和服务端轮询等待，使用模型版本 `v3.0-20250812`，API 端点 `https://api.tripo3d.ai/v2/openapi`。
- `app/api/chat/route.ts` (`generateMascot` tool, `retextureMascot` tool): AI 工具定义。`generateMascot` 接收 prompt/style 参数，调用 `tripoClient.createTask()` 创建异步任务；`retextureMascot` 接收 taskId/prompt/textureQuality 参数，调用 `tripoClient.retextureModel()` 重新生成纹理。两者均通过 `pendingTaskId` 守卫防止重复提交。
- `app/api/tripo/task/[id]/route.ts` (`GET`): 任务状态查询代理路由，隐藏 TRIPO_API_KEY，使用 Next.js 16 动态路由参数 (`params: Promise`)。
- `app/api/tripo/proxy/route.ts` (`GET`): 模型文件代理路由，转发 Tripo 返回的外部 GLB URL，设置 `Content-Type: model/gltf-binary` 和 `Cache-Control: public, max-age=86400`。
- `components/chat/model-preview.tsx` (`ModelPreview`, `proxyUrl`): 前端轮询组件，每 3 秒调用任务状态 API，管理 pending/running/success/failed 四种状态的 UI 渲染，包含竞态条件守卫机制。
- `components/model-viewer/index.tsx` (`ModelViewer`, `Model`): React Three Fiber 3D 查看器，使用 `useGLTF` 加载 GLB 模型，提供 OrbitControls 交互（旋转/缩放）、Environment 环境贴图和 Suspense 加载状态。
- `stores/chat-store.ts` (`useChatStore`): Zustand 状态管理，核心字段 `modelUrl`、`pendingTaskId`、`phase`，`setModelUrl` 自动触发 `phase: 'split'` 分屏切换。
- `app/page.tsx` (`Home`): 主页面，根据 `phase === 'split' && !!modelUrl` 条件渲染 ResizablePanel 分屏布局。

## 3. 执行流（LLM 检索图谱）

- **1. 触发生成:** 用户发送消息 -> `hooks/use-chat-session.ts` 通过自定义 Transport 发送请求到 `app/api/chat/route.ts:106-163`，请求体携带 `pendingTaskId`。
- **2. AI 工具调用:** `streamText` 调用 DeepSeek 模型，AI 决定调用 `generateMascot` 或 `retextureMascot` 工具。工具先检查 `pendingTaskId` 是否已存在（防重复守卫），然后调用 `tripoClient.createTask(prompt)` 或 `tripoClient.retextureModel(taskId, options)` (`lib/tripo.ts:29-50` / `lib/tripo.ts:91-129`)。
- **3. 任务创建:** Tripo API 返回 `task_id`，工具返回 `{ success: true, taskId, status: 'pending' }` 到前端流式响应。**此时不阻塞**，AI 继续生成文字解释吉祥物含义。
- **4. 前端渲染:** `ChatMessage` 检测到 `tool-generateMascot` 或 `tool-retextureMascot` part 且 `state === 'output-available'`，渲染 `ModelPreview` 组件 (`components/chat/model-preview.tsx:17-143`)。
- **5. 轮询启动:** `ModelPreview` 的 useEffect 立即调用 `setPendingTaskId(taskId)` 标记任务活跃，然后立即首次轮询 + 每 3 秒 setInterval 轮询 `GET /api/tripo/task/${taskId}` (`app/api/tripo/task/[id]/route.ts:3-18`)。
- **6. 状态代理:** API 路由调用 `tripoClient.getTask(id)` (`lib/tripo.ts:52-66`) 查询 Tripo API，返回 `{ status, progress, output }` 给前端。
- **7. 进度更新:** `ModelPreview` 根据返回的 `task.status` 渲染三种 UI：`pending/running`（进度条）、`success`（预览图+按钮）、`failed`（错误提示）。
- **8. 模型加载:** 任务成功时，执行竞态守卫：`useChatStore.getState().pendingTaskId === taskId`。通过后，`proxyUrl(task.output.pbr_model)` 生成代理 URL (`/api/tripo/proxy?url=...`)，调用 `setModelUrl(url)`。
- **9. 分屏切换:** `setModelUrl` 内部同时设置 `phase: 'split'` (`stores/chat-store.ts:27-30`)，`Home` 组件检测到 `isSplit` 为 true，渲染 `ResizablePanel` + `ModelViewer` (`app/page.tsx:39-53`)。
- **10. 3D 渲染:** `ModelViewer` 的 `<Canvas>` 创建 WebGL 上下文，`useGLTF(modelUrl)` 通过代理路由获取 GLB 文件，`<primitive object={scene} />` 渲染模型 (`components/model-viewer/index.tsx:12-44`)。

## 4. 设计决策

- **异步非阻塞:** `generateMascot` 工具立即返回 taskId 而不等待模型生成完成（120 秒+），前端独立轮询，AI 可继续输出文字内容。
- **双层防重复:** 后端 `pendingTaskId` 守卫 + 前端 `ModelPreview` 竞态守卫，防止同一会话重复生成和会话切换后误设置 modelUrl。
- **代理路由隔离:** 所有 Tripo API 调用经过 Next.js API Routes 代理，实现 API Key 隐藏、CORS 解决和 GLB 文件缓存（24 小时）。
- **状态分层:** Zustand 管理瞬时 UI 状态（phase/modelUrl/pendingTaskId），页面刷新后重置为 `chat` 阶段，不持久化 3D 模型状态。
