# UI 组件体系架构

## 1. Identity

- **What it is:** 基于 shadcn/ui (new-york 风格) + Radix UI + Tailwind CSS v4 构建的分层组件体系。
- **Purpose:** 为 Tripo Bagua 应用提供可组合、可访问、支持深浅主题的完整 UI 基础设施。

## 2. Core Components

- `lib/utils.ts` (`cn`): 样式合并工具，基于 clsx + tailwind-merge，被所有 UI 组件引用。
- `components.json`: shadcn/ui 配置文件，定义 new-york 风格、CSS 变量模式、lucide 图标库、路径别名。
- `app/globals.css`: 设计系统核心，定义 OKLCH 色彩变量、圆角系统、Tailwind v4 主题桥接、基础层样式。
- `components/ui/*.tsx` (18 个组件): 基础 UI 层，全部基于 Radix UI 或其他无样式原语封装，使用 CVA 管理变体。
- `components/sidebar/index.tsx` (`Sidebar`): 业务组件，响应式折叠侧边栏，集成会话列表和主题切换。
- `components/ai-elements/*.tsx` (7 个组件): AI 聊天专用组件层，包含 Conversation、Message、PromptInput、Reasoning、Tool、CodeBlock、Shimmer。`MessageContent` 包含 `group-[.is-assistant]:w-full` 确保 assistant 消息中的工具卡片（如 AnalysisCard）宽度 100%。
- `components/chat/index.tsx` (`Chat`): 页面级聊天组合组件，整合 AI Elements 和 useChatSession hook。
- `components/chat/analysis-card.tsx` (`AnalysisCard`, `ClassicSubCard`): 分析过程流式渲染卡片。`AnalysisCard` 接收 `progress`（AnalysisProgress）、`state`（tool part state）和 `preliminary`（boolean，中间 yield 为 true）三个 prop，通过 `isComplete = state === 'output-available' && !preliminary` 判断完成状态。未完成时头部标题「正在分析命盘，请稍候...」副标题「待分析完成后，我会为您生成详细解读」，展开内容末尾有虚线分隔的同文案提示；完成后显示「分析完成 · 引用 N 部典籍」+ 绿色对勾图标，可折叠。`ClassicSubCard` 为嵌套的典籍查阅子卡片，可展开显示经典原文。基于 Collapsible、Badge 等基础 UI 组件构建。
- `components/order-modal/index.tsx` (`OrderModal`): 业务弹窗，基于 Dialog 封装的下单打印界面（待实现）。
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

### 3.3 页面布局流

- **1. 入口:** `app/page.tsx:25` 渲染 `<main className="flex h-screen">`，水平布局。
- **2. 侧边栏:** `components/sidebar/index.tsx:44-106`，固定宽度（折叠 48px / 展开 240px），独立于分栏系统。
- **3. 分栏面板:** `app/page.tsx:32-54` 使用 `ResizablePanelGroup` (orientation="horizontal")。
- **4. 条件渲染:** `app/page.tsx:39-53` 当 `phase === 'split' && modelUrl` 时显示 3D 模型面板。

## 4. Design Rationale

- **OKLCH 色彩空间:** 提供感知均匀的色彩过渡，主色调 hue=155（青瓷绿），暗色模式下提亮到 L=0.72。
- **data-slot 属性:** 所有 shadcn/ui 组件统一添加 `data-slot` 标识，便于调试和 CSS 选择器定位。
- **CVA 变体模式:** 使用 class-variance-authority 实现类型安全的样式变体，Button 扩展了 7 种尺寸（含 icon-xs/sm/lg）。
- **圆角系统:** 基于 `--radius: 0.625rem` (10px) 派生 7 级圆角（sm 6px 到 4xl 26px），详见 `docs/theme-spec.md:125-137`。
- **Compound Components 模式:** 复杂组件（Dialog、Select、InputGroup、PromptInput）拆分为多个可组合子组件。
- **手动主题切换:** 不依赖 next-themes 等第三方库，直接操作 DOM classList + localStorage，已知存在 FOUC 问题（详见 `docs/theme-spec.md:185-189`）。
