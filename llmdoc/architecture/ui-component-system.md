# UI 组件体系架构

## 1. Identity

- **What it is:** 基于 shadcn/ui (new-york 风格) + Radix UI + Tailwind CSS v4 构建的分层组件体系。
- **Purpose:** 为开运造物应用提供可组合、可访问、支持深浅主题的完整 UI 基础设施。

## 2. Core Components

- `lib/utils.ts` (`cn`): 样式合并工具，基于 clsx + tailwind-merge，被所有 UI 组件引用。
- `components.json`: shadcn/ui 配置文件，定义 new-york 风格、CSS 变量模式、lucide 图标库、路径别名。
- `app/globals.css`: 设计系统核心，定义 OKLCH 色彩变量、圆角系统、Tailwind v4 主题桥接、基础层样式。
- `components/ui/*.tsx` (18 个组件): 基础 UI 层，全部基于 Radix UI 或其他无样式原语封装，使用 CVA 管理变体。
- `hooks/use-mobile.ts` (`useMobile`): 移动端检测 Hook，基于 `matchMedia` 监听 `< 768px` 断点，返回 `isMobile` 布尔值。
- `components/sidebar/index.tsx` (`Sidebar`): 双模式侧边栏。手机端（`isMobile`）为 fixed 抽屉覆盖层（z-50 + backdrop），选中会话或点击关闭按钮自动收回；平板/桌面端为内联折叠侧边栏（`hidden md:flex`，折叠 48px / 展开 240px）。
- `components/ai-elements/*.tsx` (7 个组件): AI 聊天专用组件层，包含 Conversation、Message、PromptInput、Reasoning、Tool、CodeBlock、Shimmer。`MessageContent` 包含 `group-[.is-assistant]:w-full` 确保 assistant 消息中的工具卡片（如 AnalysisCard）宽度 100%。
- `components/chat/index.tsx` (`Chat`, `MaskGuide`): 页面级聊天组合组件，整合 AI Elements 和 useChatSession hook。新会话（`messages.length === 0`）时渲染 `MaskGuide` 面具选择引导界面；有消息后渲染消息列表。`MaskGuide` 从 `lib/masks.ts` 的 `MASKS` 数组渲染 2x3（手机 2 列/桌面 3 列）卡片网格，每张卡片显示面具的 icon/name/description，点击调用 `setMaskId` 更新 Zustand 选中面具，选中卡片高亮 `border-primary bg-primary/5`。
- `components/chat/analysis-card.tsx` (`AnalysisCard`, `ClassicSubCard`, `SOURCE_LABELS`): 分析过程流式渲染卡片。`AnalysisCard` 接收 `progress`（AnalysisProgress）、`state`（tool part state）、`preliminary`（boolean，中间 yield 为 true）和 `question`（可选，追问问题）四个 prop，通过 `isComplete = state === 'output-available' && !preliminary` 判断完成状态。未完成时：无 question 显示「正在分析命盘，请稍候...」，有 question 显示「正在分析「xxx」，请稍候...」；完成时：无 question 显示「分析完成 · 引用 N 部典籍」，有 question 显示「「xxx」分析完成 · 引用 N 部典籍」。`SOURCE_LABELS` 为典籍 ID 到中文书名的映射（ziping→子平真诠, ditian→滴天髓, qiongtong→穷通宝鉴, yuanhai→渊海子平, sanming→三命通会, all→全部经典），`ClassicSubCard` 使用此映射在 header 中显示中文书名。基于 Collapsible、Badge 等基础 UI 组件构建。
- `components/order-modal/index.tsx` (`OrderModal`): 业务弹窗，基于 Dialog 封装的下单打印界面。当前显示暂未开通警告提示（TriangleAlert 图标 + 提示文案 + DialogFooter "知道了"关闭按钮），实际下单功能待 Shop 中台 API Key 获取后实现。
- `components/ui/resizable.tsx` (`ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`): 可调整大小面板，用于主页分栏布局。

## 3. Execution Flow (LLM Retrieval Map)

### 3.1 组件分层架构

- **1. 基础 UI 层** (`components/ui/`): 18 个 shadcn/ui 组件，无业务逻辑，统一使用 `data-slot` 属性标识。
- **2. 业务组件层** (`components/sidebar/`, `components/order-modal/`, `components/chat/`): 组合基础 UI 组件，包含状态管理和业务逻辑。
- **3. AI Elements 层** (`components/ai-elements/`): 聊天 UI 专用组件，与 Vercel AI SDK 深度集成，支持流式渲染。
- **4. 页面层** (`app/page.tsx:16-63`): 组合所有层级组件，使用 ResizablePanelGroup 实现分栏布局。

### 3.2 主题系统流

- **1. 变量定义:** `app/globals.css:49-117` 定义 `:root` (浅色) 和 `.dark` (深色) 两套 OKLCH 变量。
- **2. Tailwind 桥接:** `app/globals.css:6-47` 通过 `@theme inline` 将 CSS 变量映射为 Tailwind 颜色 token。
- **3. Dark variant:** `app/globals.css:4` 通过 `@custom-variant dark (&:is(.dark *))` 定义暗色匹配规则。
- **4. 主题切换:** `components/sidebar/theme-toggle.tsx:7-37` 通过 DOM classList 和 localStorage 实现切换。
- **5. 组件消费:** 组件使用语义 class（如 `bg-primary`、`text-foreground`）自动响应主题变化。

### 3.3 页面布局流（响应式）

页面通过 `useMobile()` 判断断点，渲染两套不同布局：

**手机端 (`< 768px`):**
- **1. 入口:** `app/page.tsx:28` `<main className="flex h-screen">`。
- **2. 侧边栏:** `components/sidebar/index.tsx:129-150`，渲染为 fixed 抽屉（z-50），背景遮罩（z-40 bg-black/50）。默认关闭（`useEffect` 在 `isMobile` 变化时自动收起）。
- **3. 汉堡头部:** `app/page.tsx:39-54`，包含汉堡按钮（触发 setSidebarOpen）和可选的"查看模型"按钮。
- **4. 聊天全屏:** `app/page.tsx:57-59`，Chat 占满剩余空间。
- **5. 3D 全屏覆盖层:** `app/page.tsx:62-79`，当 `mobileModelOpen && modelUrl` 时渲染 fixed 全屏层（z-30），含返回按钮和 ModelViewer。

**平板/桌面端 (`>= 768px`):**
- **1. 侧边栏:** `components/sidebar/index.tsx:153-162`，内联 `hidden md:flex`，折叠 48px / 展开 240px。
- **2. 分栏面板:** `app/page.tsx:83-105` 使用 `ResizablePanelGroup` (orientation="horizontal")。
- **3. 条件渲染:** 当 `phase === 'split' && modelUrl` 时显示 3D 模型面板。

### 3.4 移动端安全区域

- **Viewport 配置:** `app/layout.tsx:12-17` 导出 `viewport` 对象（`width=device-width`, `viewportFit=cover`），启用 iOS 安全区域支持。
- **CSS 工具类:** `app/globals.css:132-140` 定义 `.safe-area-bottom` / `.safe-area-top`，基于 `env(safe-area-inset-*)` 设置 padding。
- **使用位置:** 手机端头部（`safe-area-top`）、聊天输入区底部（`safe-area-bottom`）、侧边栏抽屉（`safe-area-top`）。

## 4. Design Rationale

- **OKLCH 色彩空间:** 提供感知均匀的色彩过渡，主色调 hue=155（青瓷绿），暗色模式下提亮到 L=0.72。
- **data-slot 属性:** 所有 shadcn/ui 组件统一添加 `data-slot` 标识，便于调试和 CSS 选择器定位。
- **CVA 变体模式:** 使用 class-variance-authority 实现类型安全的样式变体，Button 扩展了 7 种尺寸（含 icon-xs/sm/lg）。
- **圆角系统:** 基于 `--radius: 0.625rem` (10px) 派生 7 级圆角（sm 6px 到 4xl 26px），详见 `docs/theme-spec.md:125-137`。
- **Compound Components 模式:** 复杂组件（Dialog、Select、InputGroup、PromptInput）拆分为多个可组合子组件。
- **手动主题切换:** 不依赖 next-themes 等第三方库，直接操作 DOM classList + localStorage，已知存在 FOUC 问题（详见 `docs/theme-spec.md:185-189`）。
- **移动端断点策略:** 单一断点 768px（Tailwind `md:`），JS 侧通过 `useMobile()` hook 检测，CSS 侧通过 `md:` 前缀适配。手机端使用全屏覆盖层替代 ResizablePanel 分栏，避免小屏幕下拖拽交互体验差的问题。
