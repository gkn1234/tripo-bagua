# 开运造物

AI 驱动的八字命理分析与 3D 吉祥物生成平台。输入你的生辰八字，AI 大师为你解读命盘，量身定制专属 3D 吉祥物，支持在线预览与下单 3D 打印。

**在线体验：** [https://tripo-bagua.vercel.app](https://tripo-bagua.vercel.app)

## 功能特性

- **AI 命理分析** — 输入生辰八字，AI 大师即刻解读命盘，还能深入追问细节
- **3D 吉祥物生成** — 根据命理结果自动生成专属 3D 吉祥物，不满意可重新调整，支持下单 3D 打印（即将开通）
- **在线 3D 预览** — 左侧聊天、右侧实时查看 3D 模型，旋转缩放随意操控
- **多种大师风格** — 5 位风格各异的 AI 大师可选：命理助手、毒舌大师、知心姐姐、理性派、千面师
- **手机电脑通用** — 手机、平板、电脑都能流畅使用，深色/浅色主题自由切换

## 使用指南

1. 打开应用，选择一位你喜欢的 AI 大师
2. 在聊天框中输入你的出生年月日时和性别
3. AI 大师确认信息后，自动排盘分析
4. 查看命盘解读，输入「深入分析 xxx」可获取更详细的分析
5. AI 根据命理结果生成专属 3D 吉祥物
6. 在右侧 3D 查看器中旋转、缩放预览模型
7. 不满意可要求重新调整纹理

## 快速开始（开发者）

### 环境要求

- Node.js >= 18
- pnpm

### 安装 & 启动

```bash
git clone https://github.com/gkn1234/tripo-bagua
cd kaiyun-zaowu
pnpm install
cp .env.example .env  # 填写 API Key，见下方说明
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可访问。

### 环境变量

复制 `.env.example` 为 `.env`，填写以下 API Key：

| 变量名 | 说明 | 获取方式 |
|--------|------|---------|
| `DEEPSEEK_API_KEY` | DeepSeek 大模型（必填） | [deepseek.com](https://platform.deepseek.com) |
| `TRIPO_API_KEY` | Tripo 3D 模型生成（必填） | [tripo3d.ai](https://www.tripo3d.ai) |
| `ZHIPU_API_KEY` | 智谱 Embedding | [open.bigmodel.cn](https://open.bigmodel.cn) |
| `SHOP_API_KEY` | Shop 中台（下单功能，暂未启用） | — |

### 构建 & 部署

```bash
pnpm build
pnpm start
```

推荐使用 [Vercel](https://vercel.com) 一键部署。

## 系统架构

本项目是 **Tripo 黑客松** 参赛作品，核心目标是展示 Tripo API 在实际产品中的深度集成——从 AI 对话中自然触发 3D 生成，到实时预览和纹理迭代，构建完整的「文本 → 3D 模型 → 实物打印」工作流。

### 整体架构

```
用户 ──→ 聊天界面 ──→ 对话 Agent (DeepSeek)
                          │
                ┌─────────┼─────────┐
                ▼         ▼         ▼
           排盘计算   分析 Agent   Tripo 3D 生成
          (tyme4ts)  (DeepSeek)  (Tripo API v3.0)
                │         │         │
                ▼         ▼         ▼
           命盘卡片   分析卡片   3D 模型查看器
```

系统采用**双 Agent 架构**：对话 Agent 负责与用户交流，分析 Agent 负责专业命理推演。两个 Agent 通过共享记忆（AnalysisNote）协作，对话 Agent 将分析结论翻译为用户易懂的语言。

### Tripo 工作流集成

Tripo API 是本项目的 3D 生成引擎，集成贯穿「生成 → 轮询 → 预览 → 迭代」全链路：

```
对话 Agent 调用 generateMascot 工具
        │
        ▼
  Tripo API 创建 text_to_model 任务（异步，立即返回 taskId）
        │                              │
        ▼                              ▼
  AI 继续输出吉祥物解读文字      前端每 3 秒轮询任务状态
                                       │
                                       ▼
                                  模型生成完成（GLB）
                                       │
                                       ▼
                              自动切换分屏布局，3D 预览
                                       │
                                       ▼
                              用户不满意 → retextureMascot
                                       │
                                       ▼
                              Tripo texture_model 重新生成纹理
```

**关键设计：**

- **异步非阻塞：** 3D 生成通常需要数十秒，系统提交任务后立即返回，AI 继续输出文字内容，前端独立轮询进度，用户无需等待
- **纹理迭代：** 支持对已生成模型调用 `texture_model` 重新生成纹理（保留造型），用户可反复调整直到满意
- **代理路由：** 所有 Tripo API 调用经过 Next.js API Routes 代理，实现 API Key 安全隔离和 GLB 文件缓存（24 小时）
- **模型版本：** 使用 Tripo v3.0（`v3.0-20250812`），配合 `texture_quality: detailed` 高质量纹理输出

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 + React 19 + TypeScript |
| AI | Vercel AI SDK 6.x + DeepSeek Chat |
| 八字计算 | tyme4ts + cantian-tymext |
| 3D 生成 | Tripo API v3.0 |
| 3D 渲染 | React Three Fiber + Three.js |
| UI | shadcn/ui + Radix UI + Tailwind CSS v4 |
| 状态管理 | Zustand |
| 持久化 | IndexedDB |
