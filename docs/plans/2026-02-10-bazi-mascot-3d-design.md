# 八字吉祥物 3D 生成应用 - 技术设计

## 项目概述

Web 应用：用户通过对话 Agent 输入生日，Agent 计算八字、解读五行、设计吉祥物，调用 Tripo 生成 3D 模型，用户预览满意后通过 Shop 中台下单 3D 打印。

---

## 交互设计

### 两阶段界面

**阶段一：对话全屏**

对话 Agent 占满整个视口，引导用户完成：

1. 输入出生日期和时辰
2. Agent 调用 `calculate_bazi` 计算八字
3. Agent 解读八字、五行分析
4. Agent 提出吉祥物设计方案
5. 用户确认，Agent 调用 `generate_model` 触发 3D 生成

**阶段二：对话半屏 + 3D 工作台半屏**

模型生成完成后，界面切换为左右分栏：

- 左侧：对话继续，用户可以描述修改需求，Agent 重新生成模型
- 右侧：3D 工作台，GLB 模型预览（旋转/缩放/平移），底部有"下单打印"按钮

**下单流程**

点击"下单打印"弹出 Modal，用户填写：尺寸、表面工艺、底座刻字、收货人、电话、地址。确认后调用 Shop 中台 API 创建订单。

---

## 架构

```
┌─────────────────────────────────────────────┐
│              Next.js (Vercel)                │
│                                             │
│  前端                                        │
│  ├── 对话界面（全屏 ↔ 半屏切换）               │
│  ├── 3D 工作台（react-three-fiber）           │
│  └── 下单弹框（shadcn/ui Dialog）             │
│                                             │
│  API Routes（后端代理）                        │
│  ├── /api/chat      → DeepSeek API（流式）    │
│  ├── /api/tripo/                             │
│  │   ├── generate   → Tripo 文生3D           │
│  │   └── task/[id]  → Tripo 任务轮询          │
│  └── /api/order     → Shop 中台下单           │
└─────────────────────────────────────────────┘
```

### 后端 API Routes

| 路由 | 职责 |
|------|------|
| `/api/chat` | 核心路由。接收对话历史，调用 DeepSeek（流式），在服务端处理 tool calls（calculate_bazi 直接计算，generate_model 调用 Tripo API），返回 SSE 流给前端 |
| `/api/tripo/generate` | 提交 Tripo 文生3D 任务 |
| `/api/tripo/task/[id]` | 查询 Tripo 任务状态和模型 URL |
| `/api/order` | 创建 Shop 中台 3D 打印订单 |

所有第三方 API Key 存在 Vercel 环境变量，前端不接触密钥。

---

## DeepSeek Agent 设计

### 角色

八字命理师 + 吉祥物设计师。懂传统文化，能解读八字并创造性地设计吉祥物。

### Tool Calling

| Tool | 输入 | 输出 | 触发时机 |
|------|------|------|---------|
| `calculate_bazi` | 年、月、日、时 | 八字、五行、喜用神等结构化数据 | 用户提供生日后 |
| `generate_model` | 吉祥物完整描述（prompt） | Tripo task_id | 用户确认方案 / 修改后重新生成 |

### 提示词累积策略

每次用户提出修改，Agent 将修改融入完整的吉祥物描述，全量重新调用 `text_to_model`，而非增量修改。Tripo 不支持基于已有模型的文本编辑。

---

## Tripo API 使用策略

### 迭代阶段

- 使用 `model_version: "Turbo-v1.0-20250506"`（秒级生成），快速出结果供用户预览
- `texture: true`、`pbr: true` 默认开启，生成带纹理材质的 GLB

### 最终版本

- 用户满意后，切换到 `model_version: "v2.5-20250123"` 生成高质量版本
- 可选调用 `refine_model` 进一步提升模型精度
- `texture_quality: "detailed"` 提升纹理细节

### 可用的后处理

- `refine_model`：提升网格/纹理质量（非内容修改）
- `stylize_model`：预设风格化（lego/voxel/voronoi/minecraft）
- `texture_model`：仅更换材质/颜色

---

## 八字计算

自研实现，放在 `lib/bazi/`。包含农历转换、天干地支推算、五行分析、喜用神判断。具体算法后续细化。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS |
| 组件库 | shadcn/ui (Radix UI + Tailwind) |
| 3D 预览 | react-three-fiber + @react-three/drei |
| LLM | DeepSeek API (function calling, streaming) |
| 文生3D | Tripo API |
| 3D 打印 | Shop 中台 API |
| 八字算法 | 自研 |
| 部署 | Vercel |
| 登录 | 无，匿名使用 |

---

## 项目目录结构

```
/
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   └── api/
│       ├── chat/route.ts
│       ├── tripo/
│       │   ├── generate/route.ts
│       │   └── task/[id]/route.ts
│       └── order/route.ts
│
├── components/
│   ├── chat/
│   ├── model-viewer/
│   └── order-modal/
│
├── lib/
│   ├── bazi/
│   ├── deepseek.ts
│   ├── tripo.ts
│   └── shop.ts
│
└── docs/
    ├── api-research.md
    └── plans/
```

文件命名统一使用 kebab-case。

---

## 外部依赖与阻塞项

| 优先级 | 资源 | 联系人 | 状态 |
|--------|------|--------|------|
| P0 | Tripo API 调用额度充值 | Gavin | 待充值（balance=0） |
| P0 | Shop 中台 API Key | 吕宝源 | 待申请 |
