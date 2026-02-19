# 开运造物 - 项目总览

## 1. Identity

- **项目名称:** kaiyun-zaowu (v0.1.0)
- **定义:** AI 驱动的八字命理分析与 3D 吉祥物生成 Web 应用。
- **用途:** 用户输入生辰八字，由双 Agent 架构（分析 Agent + 对话 Agent）解读命盘，自动生成个性化 3D 吉祥物模型，支持在线预览和下单 3D 打印。

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16.1.6 (App Router) + React 19.2.3 + TypeScript |
| AI | Vercel AI SDK 6.x (`ai`, `@ai-sdk/react`, `@ai-sdk/deepseek`) + DeepSeek Chat |
| 八字计算 | `tyme4ts` (MIT, 干支/排盘) + `cantian-tymext` (闭源, 神煞/刑冲合会) |
| 3D 生成 | Tripo API v3.0 (文生 3D, GLB 输出) |
| 3D 渲染 | React Three Fiber 9.x + @react-three/drei 10.x + Three.js 0.182 |
| 状态管理 | Zustand 5.x (非持久化, UI 状态 + analysisNote) |
| 持久化 | IndexedDB (idb, 会话/消息/analysisNote 存储) |
| UI 组件 | shadcn/ui (new-york 风格) + Radix UI + Tailwind CSS v4 (OKLCH 色彩) |
| Markdown | Streamdown + 插件 (CJK/代码/数学/Mermaid) |
| 测试 | Vitest (单元测试) |

## 3. 核心业务流程

1. **输入生辰** - 用户在聊天界面输入出生年月日时和性别
2. **确认信息** - 对话 Agent 复述生辰信息，等用户确认
3. **AI 排盘 + 分析** - 对话 Agent 调用 `analyzeBazi` 工具，内部同步执行排盘计算，再由分析 Agent（`lib/bazi/analysis-agent.ts`）通过 `generateText` 调用 DeepSeek 做专业命理分析
4. **命盘展示 + 解读** - 工具结果渲染为 `BaguaCard`，对话 Agent 将分析结论翻译为用户易懂的语言
5. **深入追问** - 用户追问时，对话 Agent 可调用 `deepAnalysis` 触发分析 Agent 做补充分析
6. **吉祥物生成** - AI 调用 `generateMascot` 工具，非阻塞提交 Tripo 任务返回 taskId
7. **异步轮询** - `ModelPreview` 每 3 秒轮询任务状态, 显示进度条
8. **分屏预览** - 模型就绪后自动切换分屏布局, 左侧聊天 + 右侧 `ModelViewer` 3D 查看器
9. **纹理调整** - 用户不满意可通过 `retextureMascot` 工具重新生成纹理（保留造型）
10. **下单打印** - 点击"下单打印"按钮弹出 `OrderModal`, 调用 Shop 中台 API

## 4. 目录结构

```
app/
  layout.tsx, page.tsx          # 根布局与主页面 (Client Component)
  globals.css                   # OKLCH 主题变量 + Tailwind v4
  api/
    chat/route.ts               # AI 聊天流式端点 (streamText + 5 tools + 双 Agent + 面具系统)
    order/route.ts              # 订单创建 [未实现]
    tripo/
      generate/route.ts         # Tripo 任务提交 [未实现]
      proxy/route.ts            # 3D 模型文件代理 (CORS + 缓存)
      task/[id]/route.ts        # 任务状态查询代理
components/
  ai-elements/                  # Vercel AI Elements 组件
  chat/                         # 聊天业务组件 (Chat/MaskGuide/ChatMessage/BaguaCard/AnalysisCard/ModelPreview/PromptCard/OptionsButtons)
  model-viewer/                 # React Three Fiber 3D 查看器
  order-modal/                  # 订单弹窗 (暂未开通提示)
  sidebar/                      # 会话列表侧边栏 + 主题切换
  ui/                           # shadcn/ui 基础组件 (18 个)
hooks/
  use-chat-session.ts           # 聊天会话 Hook (useChat 封装 + IndexedDB + analysisNote 同步 + maskId 同步)
stores/
  chat-store.ts                 # Zustand 全局状态 (phase/modelUrl/pendingTaskId/analysisNote/maskId)
lib/
  bazi/                         # 八字计算 + 分析 Agent
    index.ts                    # 排盘计算 (calculateBazi)
    analysis-agent.ts           # 分析 Agent (runAnalysis, generateText)
    types.ts                    # 类型 (BaziResult/AnalysisEntry/AnalysisNote)
    five-elements.ts            # 五行统计
    colors.ts                   # 五行颜色映射
    __tests__/                  # 分析 Agent 单元测试
  masks.ts                      # 面具定义 (Mask 接口/5 个预设面具/getMaskById)
  persistence/chat-db.ts        # IndexedDB 数据库操作 (sessions/messages/analysisNotes)
  tripo.ts                      # Tripo API 客户端 (createTask/getTask/waitForCompletion/retextureModel)
  deepseek.ts                   # DeepSeek 客户端骨架 [未实现]
  shop.ts                       # Shop 中台客户端骨架 [未实现]
  utils.ts                      # cn() 类名合并工具
vitest.config.ts                # Vitest 测试配置 (globals + @ 别名)
```

## 5. 当前开发状态

**已完成:**
- AI 聊天流式对话 (DeepSeek + Vercel AI SDK)
- 双 Agent 八字命理架构（分析 Agent + 对话 Agent + analysisNote 共享记忆）
- 面具系统（5 个预设对话角色，新会话时选择，影响对话 Agent system prompt 的「你是谁」段落）
- 八字排盘计算与 BaguaCard 可视化
- deepAnalysis 补充分析工具
- Tripo 3D 模型异步生成与前端轮询（含 negativePrompt 和 texture_quality: high）
- 分屏布局 (ResizablePanel) + 3D 模型查看器
- 会话持久化 (IndexedDB) + 侧边栏会话管理
- analysisNote IndexedDB 持久化与跨请求同步
- 浅色/深色主题切换
- 移动端响应式适配（< 768px 断点，侧边栏抽屉、聊天全屏、3D 覆盖层、iOS 安全区域）
- Vitest 测试基础设施 + 分析 Agent 单元测试

**未实现 / 阻塞项:**
- `app/api/order/route.ts` - 订单创建 API (返回 501), 阻塞: Shop 中台 API Key 未获取
- `app/api/tripo/generate/route.ts` - 独立 Tripo 任务提交 (返回 501)
- `components/order-modal/index.tsx` - 订单弹窗已实现暂未开通提示（TriangleAlert 警告图标 + "下单功能暂未开通，Shop 中台 API Key 尚未获取。" + "知道了"关闭按钮），但实际下单功能仍未实现
- `lib/deepseek.ts` / `lib/shop.ts` - 客户端骨架, 核心函数抛出 Not implemented
- **P0 阻塞:** Tripo API 余额为 0 (需联系 Gavin 充值); Shop 中台 API Key 待获取 (需联系吕宝源)
- **已知问题:** FOUC 主题闪烁 (localStorage 暗色模式首次加载先显示亮色)
