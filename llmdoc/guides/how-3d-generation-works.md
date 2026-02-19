# 3D 模型生成流程指南

从用户触发到模型展示的完整流程说明，以及调试和参数修改方法。

## 完整生成流程

1. **用户触发:** 用户在聊天中描述需求，DeepSeek AI 判断需要生成 3D 模型后自动调用 `generateMascot` 工具。工具定义在 `app/api/chat/route.ts:76-99`，输入参数为 `prompt`（必填）和 `style`（可选）。
2. **后端创建任务:** 工具 execute 函数先检查 `pendingTaskId` 防重复，然后调用 `tripoClient.createTask(fullPrompt)` (`lib/tripo.ts:29-50`) 向 Tripo API 发送 POST 请求，返回 `task_id`。
3. **前端接收 taskId:** AI 流式响应中包含工具输出 `{ taskId, status: 'pending' }`，`ChatMessage` 渲染 `ModelPreview` 组件，传入 taskId。
4. **轮询与进度:** `ModelPreview` (`components/chat/model-preview.tsx:22-76`) 每 3 秒调用 `GET /api/tripo/task/${taskId}`，状态路由 (`app/api/tripo/task/[id]/route.ts`) 代理到 Tripo API 获取进度。
5. **模型展示:** 任务成功后，通过 `proxyUrl()` 将 Tripo 返回的 GLB URL 转换为代理 URL `/api/tripo/proxy?url=...`，调用 `setModelUrl()` 触发分屏布局，`ModelViewer` 使用 React Three Fiber 渲染 3D 模型。

## 修改模型生成参数

1. **修改 Tripo 模型版本:** 编辑 `lib/tripo.ts:39`，`model_version` 字段当前值为 `v3.0-20250812`，可替换为 Tripo 发布的新版本号。
2. **修改生成类型:** 编辑 `lib/tripo.ts:38`，`type` 字段当前为 `text_to_model`，Tripo API 还支持 `image_to_model` 等类型。
3. **调整 AI 的 prompt 模板:** 编辑 `app/api/chat/route.ts:41-71` 中的 `systemPrompt`，修改"Mascot Design Principles"部分可改变 AI 生成的描述风格和细节程度。
4. **调整轮询间隔:** 编辑 `components/chat/model-preview.tsx:66-69`，setInterval 的间隔当前为 3000ms（3 秒），可根据 API 配额调整。
5. **调整服务端超时:** 编辑 `lib/tripo.ts:70`，`waitForCompletion` 默认 timeout 为 120000ms（2 分钟），interval 为 3000ms。注意此方法当前仅在后端可用，前端使用 `ModelPreview` 自行轮询。

## 调试 Tripo API 问题

1. **检查 API Key:** 确认环境变量 `TRIPO_API_KEY` 已设置。所有 Tripo 请求通过 `lib/tripo.ts` 的 `Authorization: Bearer` 头传递密钥。
2. **查看轮询日志:** `ModelPreview` 组件内置 `console.warn` 日志（标记为 `[ModelPreview]`），在浏览器控制台可查看每次轮询结果、守卫检查和 setModelUrl 调用。Zustand store 的 `setModelUrl` 和 `setPendingTaskId` 也有 `[ChatStore]` 日志。
3. **检查代理路由:** 模型文件通过 `app/api/tripo/proxy/route.ts` 代理加载，返回 502 表示上游 fetch 失败，400 表示缺少 url 参数。检查 Network 面板中 `/api/tripo/proxy?url=...` 请求的响应状态。
4. **验证任务状态:** 直接调用 `GET /api/tripo/task/{taskId}` 查看任务 JSON，关注 `status`（queued/running/success/failed）、`progress`（0-100）和 `output.pbr_model`（GLB URL）。
5. **防重复机制排查:** 如果 AI 拒绝生成新模型，检查 `pendingTaskId` 是否残留。后端守卫在 `app/api/chat/route.ts:84`，前端守卫在 `components/chat/model-preview.tsx:43-47`。切换会话或调用 `useChatStore.getState().reset()` 可清除。
