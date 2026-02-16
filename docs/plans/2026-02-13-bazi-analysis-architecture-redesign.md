# 八字分析架构重设计方案

> 日期: 2026-02-13
> 状态: 待确认
> 前置文档: [2026-02-12-bazi-mascot-optimization-design.md](./2026-02-12-bazi-mascot-optimization-design.md)
> 范围: 多 Agent 架构 + RAG 知识库 + Prompt 精简 + Tripo 参数增强

---

## 1. 背景与设计转向

### 1.1 原方案回顾

原方案（2026-02-12）的核心思路是「重 Prompt + 重 RAG + 重计算」：
- System Prompt 中嵌入《千里命稿》六步分析流程 + 三种用神取法 + Few-Shot 命例
- RAG 三层被动注入（调候表 → 格局规则 → 经典命例）
- 计算层增强（藏干加权五行、月令关系标注等）

### 1.2 核心质疑

经过深入讨论，对原方案提出以下质疑：

1. **结构化分析流程限制 AI 思维**。固定的六步流程把开放式推理变成填空式执行，AI 无法「因盘制宜」选择最合适的分析路径
2. **三种用神取法混合使用存在理论体系冲突**。旺衰派（《滴天髓》）和格局派（《子平真诠》）对同一命盘的用神判断可能截然相反，混在一起让 AI 自己选会导致逻辑不自洽
3. **Few-Shot 命例产生锚定效应**。2-3 个范例会让 AI 把所有命盘往范例上套，抹平微妙差异
4. **被动 RAG 注入产生信息偏置**。注入什么经典，AI 就倾向于采纳什么观点，与「不限制思维路径」的目标矛盾
5. **预计算的派生数据可能误导 AI**。如五行统计只数本气不含藏干，给 AI 一个有缺陷的结论当起点，比没有还糟
6. **日主强弱、格局判定、用神推算本质上没有确定性算法**。不同流派对同一命盘有不同判断，硬编码规则不是「准确」而是「武断」。这些解释性工作恰好是 AI 的优势领域

### 1.3 修订方向

| 维度 | 原方案 | 修订后 |
|------|--------|--------|
| Prompt | 规定分析方法论（六步流程 + 三种用神） | 只约束输出质量，不约束思维路径 |
| RAG | 被动注入三层知识 | 主动查询工具，AI 自己决定查什么 |
| 计算层 | 增强派生数据 | 精简，移除可能误导的统计摘要 |
| 架构 | 单 Agent 包办 | 分析 Agent + 对话 Agent 分离 |

**一句话概括：给 AI 干净的原始数据 + 一张参考书桌 + 质量标准，剩下的让它自己来。**

---

## 2. 总体架构

### 2.1 多 Agent 架构

```
用户输入生辰
    ↓
对话 Agent（铁口直断人设）确认生辰信息
    ↓
调用 analyzeBazi 工具
    ↓
┌─ analyzeBazi 工具内部 ──────────────────┐
│  1. calculateBazi() → rawData            │
│  2. 分析 Agent 介入：                     │
│     - 接收 rawData（剔除 fiveElements）   │
│     - 读取已有 analysisNote              │
│     - 无人设、无流程约束、纯推理           │
│     - 拥有 queryClassics 工具             │
│     - 自由分析，按需查阅经典               │
│     - 输出分析结论 → 写入 analysisNote    │
│  3. 返回完整 rawData 给前端渲染           │
└──────────────────────────────────────────┘
    ↓
对话 Agent 读取 analysisNote
    ↓
用「铁口直断」风格呈现给用户
    ↓
用户追问 → 对话 Agent 从 analysisNote 提取
         → 若不足，调用 deepAnalysis 触发分析 Agent 补充
    ↓
推荐吉祥物 → 基于分析结论自由推荐（无硬编码映射）
    ↓
确认后调用 generateMascot（结构化 prompt + negative_prompt + 高清纹理）
```

### 2.2 analysisNote：共享记忆层

分析 Agent 和对话 Agent 通过 analysisNote 通信，彼此解耦：

```
┌─ 持久化层（IndexedDB）─────────────┐
│  analysisNote                       │
│  ┌───────────────────────────────┐  │
│  │ rawData: 原始排盘数据          │  │
│  │ analyses: 所有分析条目         │  │
│  └───────────────────────────────┘  │
└────────┬──────────────┬─────────────┘
         │写            │读
    分析 Agent      对话 Agent
```

**读写流程：**

```
客户端发送请求时：
  { messages, pendingTaskId, analysisNote }
                                    ↑
                         从 IndexedDB 按 sessionId 加载

服务端处理：
  1. analysisNote 内容注入对话 Agent 上下文
  2. 若触发 analyzeBazi / deepAnalysis：
     a. 分析 Agent 读取 analysisNote
     b. 产出新 AnalysisEntry
     c. 追加到 analysisNote.analyses
     d. 返回更新后的 analysisNote 给客户端
  3. 客户端收到后写回 IndexedDB
```

---

## 3. 分析 Agent 设计

### 3.1 定位

无人设、无对话职责的纯推理角色。唯一任务：基于排盘数据产出专业命理分析，写入 analysisNote。

### 3.2 Prompt

不规定分析方法论，只设质量标准：

```
你是一位命理分析引擎。你的任务是基于排盘数据，产出专业的八字命理分析。

规则：
- 所有结论必须有命盘数据作为依据，指出具体是哪柱、哪个十神、哪组关系
- 可通过 queryClassics 查阅经典命理著作，鼓励引用原文作为论据
- 不需要考虑表达风格，不需要说人话，专注于分析的准确性和完整性
- 如果对某个判断不确定，明确标注不确定程度，而非给出模糊的万金油结论
- 分析中遇到特殊格局（从格、化格、专旺格等）时，须特别标注
```

### 3.3 输入输出

**输入：**
- `rawData`：calculateBazi 返回的排盘数据（剔除 fiveElements）
- `previousNote`：已有的 analysisNote 内容（首次为空）
- `question`：对话 Agent 传入的具体问题（首次为空，表示做综合分析）

**输出：**
更新后的 analysisNote 内容（新增 AnalysisEntry）

### 3.4 工具

分析 Agent 拥有唯一工具 `queryClassics`，用于主动查阅经典命理著作。

---

## 4. queryClassics 工具设计

### 4.1 工具 Schema

```typescript
const queryClassics = tool({
  description: '查阅命理经典著作，获取相关论述作为分析依据',
  inputSchema: z.object({
    query: z.string().describe('查询内容，如"伤官见官"、"甲木寅月调候"、"从财格成立条件"'),
    source: z.enum(['all', 'ziping', 'ditian', 'qiongtong', 'sanming', 'qianli'])
      .optional()
      .describe('指定经典：ziping=子平真诠, ditian=滴天髓, qiongtong=穷通宝鉴, sanming=三命通会, qianli=千里命稿, all=全部'),
  }),
  execute: async ({ query, source }) => {
    // 向量检索 + keyword 辅助索引
    // 返回 top 2-3 个相关段落
  },
})
```

### 4.2 检索策略

- 向量检索为主，query 做 embedding 后在知识库中找最近邻
- 返回 top 2-3 个段落，每段附带出处（书名 + 章节）
- 可选按 `source` 过滤特定经典，不指定则全库搜索

### 4.3 知识库索引结构

每个文本块存储以下字段：

| 字段 | 说明 |
|------|------|
| content | 原文段落（含白话注释） |
| source | 书名 |
| chapter | 章节名 |
| keywords | 人工标注的关键词（如「甲木、寅月、庚金、调候」） |
| embedding | 向量表示 |

`keywords` 做辅助索引，解决纯向量检索可能漏掉精确匹配的问题。

### 4.4 经典文本范围

**第一档（优先入库）：**

| 经典 | 理由 |
|------|------|
| 《穷通宝鉴》 | 10 天干 × 12 月令 = 120 条，天然结构化，分块索引零成本 |
| 《子平真诠》 | 格局法体系最完整，每章聚焦一个格局，天然分块 |
| 《滴天髓》原文 + 任铁樵注 | 格言式结构适合检索，配实战命例 |

**第二档（有余力再加）：**

| 经典 | 理由 |
|------|------|
| 《三命通会》神煞篇 | 最全面的神煞释义来源 |
| 《千里命稿》 | 实战解盘风格直白，命例丰富，但分块需更多人工处理 |

**第三档（暂不纳入）：**
《渊海子平》《易经》《神峰通考》等——或已被后世覆盖，或不直接服务于八字解盘。

### 4.5 向量数据库选型

经典文本总量不大（预估几百个文本块），采用轻量方案：
- 本地 JSON 文件 + 内存加载
- 如后续规模增长，迁移至 Supabase pgvector

---

## 5. analysisNote 数据结构

```typescript
interface AnalysisNote {
  sessionId: string          // 关联的会话 ID
  rawData: BaziResult        // 原始排盘数据（一次写入，不变）
  analyses: AnalysisEntry[]  // 分析条目，按时间追加
  updatedAt: number          // 最后更新时间戳
}

interface AnalysisEntry {
  question: string | null    // 触发问题（null 表示首次综合分析）
  content: string            // 分析结论（Markdown）
  references: string[]       // 引用的经典出处
  createdAt: number
}
```

**设计要点：**
- `analyses` 追加式，不覆盖。每次分析 Agent 调用产生一条新 entry
- 分析 Agent 每次收到完整 `analyses` 历史，自行决定是补充、修正还是深入
- 对话 Agent 读到完整 `analyses`，按需引用
- 持久化为 IndexedDB 新增 store，按 sessionId 关联，不侵入现有消息存储

---

## 6. 对话 Agent Prompt 重写

### 6.1 核心变化

砍掉现有 Prompt 中的「八字解读」方法论，只保留人设 + 交互规则 + 质量约束。

### 6.2 Prompt 结构

```
## 你是谁

（保持不变——铁口直断、轻松直接、说真话的年轻命理师）

## 怎么做事

（保持不变——一次一步、先开口再动手、给选择不给指令、确认生辰后才排盘等交互规则）

## 八字解读

你的上下文中包含分析 Agent 产出的专业分析结论（analysisNote）。
你的职责是把这些结论翻译成用户听得懂的话。

规则：
- 先给一个简洁有力的总体判断，铁口直断
- 用大白话解释，不堆砌术语
- 该提醒的地方不含糊，该夸的一笔带过
- 分析结论中标注了不确定的判断，不要把这些当作确定结论呈现给用户
- 用户追问时，优先从 analysisNote 中提取相关内容
- 如果 analysisNote 没有覆盖用户的问题，调用 deepAnalysis 让分析 Agent 补充

## 吉祥物设计

（保持讨论流程——先推荐、再确认、双方满意才生成）
（去掉固定的五行→瑞兽映射表，基于 analysisNote 中的分析结论自由推荐）

调用 generateMascot 时，prompt 遵循以下结构（英文）：
"A [style] figurine of [creature], [key pose/action],
[1-2 material descriptors], [1-2 color descriptors],
desktop collectible, smooth LOD transitions"

## 工具使用

- analyzeBazi — 确认生辰后调用，内部触发分析 Agent
- deepAnalysis — analysisNote 不足以回答用户问题时调用
- generateMascot — 用户确认方案后调用
- retextureMascot — 用户想调整纹理时调用
- presentOptions — 存在分支选择时调用
```

### 6.3 关键改动对比

| 项目 | 现有 Prompt | 修订后 |
|------|------------|--------|
| 日主强弱判断 | 对话 Agent 自己做 | 分析 Agent 做，对话 Agent 读结论 |
| 五行→瑞兽映射 | 硬编码 5 组映射 | 去掉，基于分析结论自由推荐 |
| 解读方向 | Prompt 中列出事业/财运/婚恋/健康 | 去掉，让 AI 基于命盘特征自行决定 |
| 分析方法论 | 嵌入特定流程 | 不规定，AI 自行选择 |
| 经典引用 | 无 | 分析 Agent 提供，对话 Agent 可选择性呈现 |

---

## 7. 计算层调整

### 7.1 原则

不增加新的计算字段，不修改现有计算逻辑。只调整数据的流向。

### 7.2 变更

| 项目 | 动作 | 理由 |
|------|------|------|
| `fiveElements` 字段 | 传给分析 Agent 时剔除 | 粗糙的统计会锚定 AI 思路 |
| `fiveElements` 计算 | 保留 | 前端 BaguaCard 五行条形图仍需展示 |
| 其余字段 | 全部保留传给分析 Agent | 事实性原始数据 |

### 7.3 实现

在 `analyzeBazi` 工具的 `execute` 函数中做字段过滤：

```typescript
const { fiveElements, ...dataForAnalysis } = result
// dataForAnalysis → 传给分析 Agent
// 完整 result → 返回给前端渲染 BaguaCard
```

---

## 8. 吉祥物生成优化

### 8.1 保留项

**Tripo API 参数增强（`lib/tripo.ts`）：**

```typescript
{
  type: 'text_to_model',
  prompt,
  negative_prompt: negativePrompt ?? 'blurry, low quality, multiple heads, floating parts, disconnected geometry, extra limbs, deformed',
  model_version: 'v2.5-20250123',
  texture_quality: 'high',
}
```

**generateMascot Schema 扩展（`app/api/chat/route.ts`）：**

```typescript
const generateMascot = tool({
  description: '根据描述生成 3D 吉祥物模型,返回 taskId 用于异步轮询',
  inputSchema: z.object({
    prompt: z.string().describe('遵循模板的结构化英文描述'),
    negativePrompt: z.string().optional().describe('不希望出现的特征,英文'),
    style: z.string().optional().describe('风格偏好,如 cute、majestic、chibi'),
  }),
})
```

**Tripo Prompt 结构化模板** 保留在对话 Agent Prompt 中（见第 6 节）。

### 8.2 砍掉项

固定的五行→瑞兽映射表。对话 Agent 基于 analysisNote 中的分析结论自由推荐，不受预设选项限制。

---

## 9. 实施计划

### 阶段 1：分析 Agent 基础架构

| 工作项 | 影响文件 | 说明 |
|--------|---------|------|
| 定义 AnalysisNote 类型 | `lib/bazi/types.ts` | AnalysisNote + AnalysisEntry 接口 |
| AnalysisNote 持久化 | `lib/persistence/chat-db.ts` | IndexedDB 新增 store，按 sessionId 存取 |
| 客户端请求携带 analysisNote | `hooks/use-chat-session.ts` | 发送消息前从 IndexedDB 加载，随请求发送 |
| 分析 Agent 核心逻辑 | `lib/bazi/analysis-agent.ts`（新） | 接收排盘数据 + note，调用 LLM 产出分析，返回更新后的 note |
| 改造 analyzeBazi 工具 | `app/api/chat/route.ts` | execute 内调用分析 Agent，传入数据（剔除 fiveElements），写 analysisNote |
| 新增 deepAnalysis 工具 | `app/api/chat/route.ts` | 接收 question，调用分析 Agent 做补充分析 |
| analysisNote 注入对话上下文 | `app/api/chat/route.ts` | 请求中的 analysisNote 拼入系统 Prompt |
| 客户端回写 analysisNote | `hooks/use-chat-session.ts` | 收到更新后的 note 写回 IndexedDB |

### 阶段 2：RAG 知识库

| 工作项 | 说明 |
|--------|------|
| 采集经典文本 | 《穷通宝鉴》《子平真诠》《滴天髓》原文 + 白话注释 |
| 文本分块 + 标注 | 按章节/条目切分，标注 keywords |
| Embedding + 存储 | 生成向量，存入本地 JSON |
| 实现 queryClassics 工具 | 向量检索 + keyword 辅助索引 |
| 接入分析 Agent | 分析 Agent 工具列表加入 queryClassics |

### 阶段 3：Prompt 精简 + Tripo 增强

| 工作项 | 影响文件 | 说明 |
|--------|---------|------|
| 重写对话 Agent Prompt | `app/api/chat/route.ts` | 砍掉分析方法论，保留人设 + 质量约束 |
| Tripo 参数增强 | `lib/tripo.ts` | 加入 negative_prompt + texture_quality |
| generateMascot Schema 扩展 | `app/api/chat/route.ts` | 暴露 negativePrompt 参数 |
| 砍掉五行→瑞兽硬编码映射 | `app/api/chat/route.ts` | 从 Prompt 中移除 |

**依赖关系：** 阶段 1 是核心骨架，阶段 2 和阶段 3 相互独立可并行。阶段 1 完成后，即使没有 RAG，分析 Agent 也能基于自身知识工作。

---

## 10. 与原方案的差异总结

| 原方案设计 | 本方案处理 | 理由 |
|-----------|-----------|------|
| 《千里命稿》六步分析流程嵌入 Prompt | 砍掉 | 限制 AI 思维路径 |
| 三种用神取法（扶抑/调候/通关）写入 Prompt | 砍掉 | 混合不同命学体系，逻辑不自洽 |
| 2-3 个 Few-Shot 命例 | 砍掉 | 产生锚定效应，导致模式套用 |
| 数据字段使用指引 | 砍掉 | AI 有能力自行理解数据结构 |
| RAG 第 1 层：穷通宝鉴精确查表被动注入 | 改为主动查询 | 避免信息偏置 |
| RAG 第 2 层：格局规则向量检索被动注入 | 改为主动查询 | 避免信息偏置 |
| RAG 第 3 层：经典命例向量检索被动注入 | 砍掉 | 类似 Few-Shot 锚定风险 |
| 计算层增加藏干加权五行 | 不做 | 交给 AI 自行判断 |
| 计算层增加月令关系标注 | 不做 | AI 可自行推导 |
| 计算层增加十二长生状态 | 不做 | AI 可自行推导 |
| 五行→瑞兽映射表扩展 | 砍掉 | 让 AI 自由推荐 |
| 单 Agent 架构 | 改为双 Agent | 分析与表达解耦 |
| Tripo API 参数增强 | 保留 | 纯技术优化，与分析无关 |
| generateMascot Schema 扩展 | 保留 | 纯技术优化 |
| Tripo Prompt 结构化模板 | 保留 | 3D 生成技巧，非命理方法论 |
