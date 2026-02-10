# 聊天界面设计方案

> 日期：2026-02-11
> 状态：待实施

## 概述

为 Tripo Bagua（八字吉祥物 3D 生成）项目设计聊天界面，支持 AI 对话、思考过程展示、工具调用状态、以及后续的自定义组件扩展。

## 技术选型

| 模块 | 选择 | 理由 |
|------|------|------|
| 聊天组件库 | Vercel AI Elements | 官方支持，25+ 组件，流式增量渲染，基于 shadcn/ui |
| 状态管理 | Zustand | 轻量（1KB），API 简洁，内置持久化 middleware |
| 持久化 | idb | 轻量（1.2KB），Google 出品，Promise API |

## 架构设计

```
┌─────────────────────────────────────────────────┐
│  App                                            │
│  ├── ChatProvider (状态管理 + IndexedDB 持久化)  │
│  │   ├── useChat (Vercel AI SDK)               │
│  │   └── useChatPersistence (idb)              │
│  │                                              │
│  ├── Phase 1: 全屏聊天                          │
│  │   └── ChatView                              │
│  │       ├── Conversation (AI Elements)        │
│  │       │   ├── Message                       │
│  │       │   ├── ReasoningBlock (折叠)         │
│  │       │   ├── ToolStatus (工具状态)         │
│  │       │   ├── BaguaCard (自定义·后续)       │
│  │       │   └── ModelPreview (自定义·后续)    │
│  │       └── PromptInput                       │
│  │                                              │
│  └── Phase 2: 分屏布局                          │
│      ├── ChatView (左侧 40%，收窄)              │
│      └── ModelViewer (右侧 60%，3D 查看器)      │
└─────────────────────────────────────────────────┘
```

## 目录结构

```
app/
├── page.tsx
├── api/
│   └── chat/
│       └── route.ts

components/
├── chat/
│   ├── chat-view.tsx
│   ├── chat-message.tsx
│   ├── chat-input.tsx
│   ├── chat-empty.tsx
│   ├── reasoning-block.tsx
│   ├── tool-status.tsx
│   ├── bagua-card.tsx          # 后续实现
│   └── model-preview.tsx       # 后续实现
├── model-viewer/
│   └── model-viewer.tsx
├── ui/
│   └── ...                     # shadcn/ui
└── layout/
    ├── split-layout.tsx
    └── phase-transition.tsx

stores/
├── chat-store.ts
└── model-store.ts

lib/
├── persistence/
│   └── chat-db.ts
└── ...
```

## UI 设计规范

### 风格基调

- **现代中性**：干净现代的 UI，传统元素作为点缀而非主导
- **深色主题**：适合 3D 模型展示
- **动效克制**：微妙的过渡、淡入淡出，不抢眼

### 色彩系统

基于 shadcn 变量结构，使用 oklch 色彩空间，点缀色为青瓷绿：

```css
.dark {
  /* 背景层级 */
  --background: oklch(0.12 0 0);
  --card: oklch(0.16 0 0);
  --popover: oklch(0.18 0 0);

  /* 文字 */
  --foreground: oklch(0.96 0 0);
  --muted-foreground: oklch(0.65 0 0);

  /* 青瓷绿点缀色 */
  --primary: oklch(0.72 0.1 155);
  --primary-foreground: oklch(0.15 0 0);
  --accent: oklch(0.72 0.1 155 / 15%);
  --accent-foreground: oklch(0.8 0.08 155);
  --ring: oklch(0.72 0.1 155);

  /* 其他 */
  --secondary: oklch(0.22 0 0);
  --muted: oklch(0.22 0 0);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --destructive: oklch(0.65 0.2 25);
}
```

### 字体

```css
:root {
  --font-sans: var(--font-geist-sans);      /* 正文 */
  --font-mono: var(--font-geist-mono);      /* 代码 */
  --font-display: 'Noto Serif SC', serif;   /* 标题 */
}
```

## 功能设计

### 消息展示

| 内容类型 | 展示方式 |
|----------|----------|
| 文本 | 流式直接显示，Markdown 渲染 |
| 思考过程 | 折叠组件，流式时展开，完成后自动折叠 |
| 工具调用 | 状态卡片（调用中/完成/错误），可展开详情 |
| 八卦分析 | 自定义 BaguaCard（后续设计） |
| 3D 预览 | 自定义 ModelPreview（后续设计） |

### 消息操作

- 复制消息内容
- 重新生成回复

### 输入

- 纯文本输入框
- 发送按钮

### 空状态

简单提示文字："开始对话，输入你的出生日期"

### 错误处理

- 消息内显示错误详情 + 重试按钮
- 同时 Toast 提醒

### 持久化

- 使用 idb 存储聊天记录到 IndexedDB
- 刷新页面保留历史对话

## 布局设计

### Phase 1 - 全屏聊天

```
┌──────────────────────────────────────────────┐
│                                              │
│              [消息列表区域]                   │
│                                              │
├──────────────────────────────────────────────┤
│  [输入框]                          [发送]    │
└──────────────────────────────────────────────┘
```

### Phase 2 - 分屏布局

3D 模型生成完成时自动切换：

```
┌─────────────────────┬────────────────────────┐
│                     │                        │
│    [消息列表]        │    [3D 模型查看器]      │
│                     │                        │
├─────────────────────┤    [下单按钮]          │
│ [输入框]     [发送]  │                        │
└─────────────────────┴────────────────────────┘
      40%                       60%
```

### 切换动画

```tsx
<motion.div
  layout
  transition={{
    duration: 0.4,
    ease: [0.4, 0, 0.2, 1]
  }}
>
  ...
</motion.div>
```

## Zustand Store 设计

```ts
// stores/chat-store.ts
interface ChatStore {
  phase: 'chat' | 'split'
  modelUrl: string | null
  setPhase: (phase: 'chat' | 'split') => void
  setModelUrl: (url: string) => void
}
```

## 后续待设计

- [ ] 八卦组件（BaguaCard）详细设计
- [ ] 3D 预览组件（ModelPreview）详细设计
