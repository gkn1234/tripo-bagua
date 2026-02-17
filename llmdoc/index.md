# 开运造物 - 文档索引

AI 驱动的八字命理分析与 3D 吉祥物生成 Web 应用（Next.js 16 + DeepSeek 双 Agent + Tripo API + React Three Fiber）。

---

## Overview

| 文档 | 说明 |
|------|------|
| `overview/project-overview.md` | 项目总览：技术栈、核心业务流程、目录结构（含 lib/masks.ts 面具定义）、当前开发状态（含面具系统） |

## Architecture

| 文档 | 说明 |
|------|------|
| `architecture/bazi-system.md` | 八字命理系统架构：analyzeBazi 纯计算（返回含 gender 字段） + deepAnalysis 流式分析（async* execute + runAnalysisStream）、闭包状态共享（currentNote + currentGender）、排盘计算、analysisNote 共享记忆、BaguaCard 乾造/坤造显示、Prompt 策略（书架描述 + 命主信息注入） |
| `architecture/chat-system.md` | 聊天系统架构：Vercel AI SDK 三层架构、面具系统（5 个预设角色，mask.promptOverride + behaviorPrompt 拼装 system prompt，只影响对话 Agent）、五个工具（deepAnalysis 为 async* 生成器工具）、maskId 全链路传递（Zustand -> Transport -> API -> getMaskById）、Session.maskId 持久化（可选字段向后兼容）、IndexedDB 持久化（DB_VERSION=2）、sanitizeMessages 防御 MissingToolResultsError |
| `architecture/3d-model-system.md` | 3D 模型生成与查看架构：Tripo 异步任务管线、前端轮询、代理路由、分屏 ModelViewer 渲染 |
| `architecture/ui-component-system.md` | UI 组件体系架构：shadcn/ui 分层组件、OKLCH 主题系统、MaskGuide 面具选择引导（新会话时 2x3 卡片网格替代空状态）、AnalysisCard 流式分析卡片、MessageContent assistant 宽度修复、响应式双布局（手机端/平板桌面端）、useMobile hook、iOS 安全区域 |
| `architecture/ai-elements-integration.md` | Vercel AI Elements 集成：第三方库原语、7 个本地封装组件、Streamdown/Shiki/Motion 集成、数据流 |

## Guides

| 文档 | 说明 |
|------|------|
| `guides/how-bazi-analysis-works.md` | 八字分析端到端流程（analyzeBazi 纯计算 -> deepAnalysis 流式分析 -> AnalysisCard 实时渲染 -> 用户追问补充分析）与扩展方法 |
| `guides/how-chat-works.md` | 聊天系统操作指南：面具选择流程（新会话时 MaskGuide 卡片引导）、会话管理（含 maskId 会话级同步和切换防御机制）、添加新 AI 工具（behaviorPrompt 拆分说明）、analysisNote 同步、3D 生成触发 |
| `guides/how-3d-generation-works.md` | 3D 模型生成流程、参数修改与 Tripo API 调试方法 |
| `guides/how-to-add-ui-components.md` | UI 组件开发指南：shadcn/ui 添加、主题适配、CVA 变体、文件组织、移动端响应式适配（useMobile hook、safe-area 类、md: 前缀、覆盖层模式） |

## Reference

| 文档 | 说明 |
|------|------|
| `reference/coding-conventions.md` | 编码规范：ESLint/TypeScript/pnpm/shadcn/CSS/组件编写模式 |
| `reference/git-conventions.md` | Git 规范：Conventional Commits 格式、分支策略、scope 对照表 |
| `reference/bazi-data-types.md` | 八字数据类型：BaziInput/BaziResult/AnalysisEntry/AnalysisNote/ClassicQueryResult/AnalysisEvent/AnalysisProgress 类型层级、字段约束、源文件索引 |
| `reference/tripo-api.md` | Tripo API 参考：端点、任务类型、negativePrompt/texture_quality 参数、本项目集成方式 |
