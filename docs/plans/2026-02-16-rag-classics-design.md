# RAG 经典文献知识库设计

> 日期: 2026-02-16
> 状态: 已确认
> 前置文档: [2026-02-13-bazi-analysis-architecture-redesign.md](./2026-02-13-bazi-analysis-architecture-redesign.md)
> 范围: 阶段 2 — queryClassics 工具 + 经典文本采集 + 向量检索

---

## 1. 目标

给分析 Agent 添加 `queryClassics` 工具，让它在分析过程中可以主动查阅经典命理著作，获取术语释义、调候用法、格局论述、干支关系、命例分析等内容作为论据。

**核心原则：** AI 自己决定查什么、查哪本，不做被动注入。

---

## 2. 总体架构

### 2.1 离线流水线（一次性）

```
经典文本采集（网上公版古籍）
    ↓
按章节/条目自然分块 + 标注 keywords
    ↓
调智谱 Embedding-3 生成向量
    ↓
写入 data/classics/chunks.json
```

### 2.2 运行时（每次 queryClassics 调用）

```
query 文本
    ↓
调智谱 Embedding-3 实时编码
    ↓
内存中 cosine similarity 匹配（~260 向量，毫秒级）
    ↓
返回 top 3 相关段落（含出处）
```

---

## 3. 数据结构

### 3.1 文件组织

```
data/
  classics/
    chunks.json          # 所有文本块 + 向量（运行时加载）
    sources/             # 原始结构化文本（仅供离线脚本使用）
      qiongtong.json     # 穷通宝鉴
      ziping.json        # 子平真诠
      ditian.json        # 滴天髓

scripts/
  build-embeddings.ts    # 离线脚本：读 sources → 分块 → 调智谱 embedding → 写 chunks.json
```

### 3.2 ClassicChunk 类型

```typescript
interface ClassicChunk {
  id: string            // 唯一 ID，如 "qiongtong-jia-yin"
  content: string       // 原文段落（含白话注释）
  source: string        // 书名：穷通宝鉴 / 子平真诠 / 滴天髓
  chapter: string       // 章节名
  keywords: string[]    // 人工标注关键词，如 ["甲木", "寅月", "调候"]
  embedding: number[]   // 智谱 Embedding-3 向量
}
```

### 3.3 Sources JSON 格式

每部经典的原始文本整理为 JSON 数组，不含 embedding 字段：

```json
[
  {
    "id": "qiongtong-jia-yin",
    "source": "穷通宝鉴",
    "chapter": "甲木·寅月",
    "content": "甲木生于寅月，阳气初生...(原文+白话注释)",
    "keywords": ["甲木", "寅月", "丙火", "调候"]
  }
]
```

### 3.4 分块策略

按经典自身结构自然分块，不做固定长度切分：

| 经典 | 分块粒度 | 预估块数 |
|------|---------|---------|
| 穷通宝鉴 | 每天干 × 每月令 = 1 条目 | ~120 块 |
| 子平真诠 | 每章 1 块（章长则按节拆） | ~40 块 |
| 滴天髓 | 每格言 + 任铁樵注 = 1 块 | ~100 块 |
| **合计** | | **~260 块** |

---

## 4. queryClassics 工具

### 4.1 Tool Schema

```typescript
const queryClassics = tool({
  description: '查阅命理经典著作，可查术语释义、调候用法、格局论述、干支关系、命例分析等',
  inputSchema: z.object({
    query: z.string().describe('查询内容，如"伤官配印"、"甲木寅月用神"、"身弱财旺"'),
    source: z.enum(['all', 'ziping', 'ditian', 'qiongtong'])
      .optional()
      .default('all')
      .describe('指定经典：ziping=子平真诠, ditian=滴天髓, qiongtong=穷通宝鉴, all=全部'),
  }),
  execute: async ({ query, source }) => {
    const queryEmbedding = await embedText(query)
    const chunks = await loadChunks()
    const candidates = source === 'all'
      ? chunks
      : chunks.filter(c => c.sourceKey === source)

    const results = candidates
      .map(c => ({ ...c, score: cosineSimilarity(queryEmbedding, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    return results.map(r => ({
      content: r.content,
      source: r.source,
      chapter: r.chapter,
      score: r.score,
    }))
  },
})
```

### 4.2 实现细节

- **`loadChunks()`**：首次调用从 `data/classics/chunks.json` 读入内存，后续从模块级缓存返回
- **`embedText()`**：调智谱 REST API（`POST https://open.bigmodel.cn/api/paas/v4/embeddings`，模型 `embedding-3`）
- **`cosineSimilarity()`**：纯数学函数，点积 / 范数乘积
- **结果格式**：只返回 content、source、chapter、score，不返回 embedding 向量

### 4.3 接入分析 Agent

在 `lib/bazi/analysis-agent.ts` 的 `runAnalysis` 函数中，将 `queryClassics` 加入 `generateText` 的 tools 参数。分析 Agent 在推理过程中按需调用，自行决定查什么、查哪本。

---

## 5. 智谱 Embedding API

### 5.1 调用方式

直接调 REST API，不引入 Python SDK：

```typescript
// lib/bazi/embedding.ts
const ZHIPU_API_BASE = 'https://open.bigmodel.cn/api/paas/v4'

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${ZHIPU_API_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ZHIPU_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'embedding-3',
      input: text,
    }),
  })
  const data = await res.json()
  return data.data[0].embedding
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  // 批量版本，用于离线脚本
  const res = await fetch(`${ZHIPU_API_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ZHIPU_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'embedding-3',
      input: texts,
    }),
  })
  const data = await res.json()
  return data.data.map((d: { embedding: number[] }) => d.embedding)
}
```

### 5.2 环境变量

`.env` 新增：

```
ZHIPU_API_KEY=your_zhipu_api_key_here
```

---

## 6. 离线脚本

### 6.1 功能

`scripts/build-embeddings.ts`：

1. 读取 `data/classics/sources/*.json`
2. 合并所有 chunks 为数组
3. 批量调智谱 Embedding-3（每批 10 条，避免限流）
4. 为每个 chunk 附加 embedding 字段
5. 写入 `data/classics/chunks.json`

### 6.2 运行方式

```bash
npx tsx scripts/build-embeddings.ts
```

只需运行一次。新增经典文本后重跑即可。

---

## 7. 经典文本采集

### 7.1 来源

三部经典均为公版古籍，从公开网站采集。优先找已有白话注释的版本。

### 7.2 采集顺序

1. **穷通宝鉴**（优先）：结构最规整，10 天干 × 12 月令 = 120 条，分块零成本
2. **子平真诠**：格局法体系完整，每章聚焦一个格局
3. **滴天髓**（原文 + 任铁樵注）：格言式结构，配实战命例

### 7.3 整理规范

- 每条 chunk 包含原文 + 白话注释（如有）
- keywords 人工标注，至少包含涉及的天干、地支、十神
- id 命名：`{书名缩写}-{章节标识}`，如 `qiongtong-jia-yin`

---

## 8. 实施依赖

- **前置**：智谱 API Key（需注册 open.bigmodel.cn）
- **前置**：经典文本采集并整理为 sources JSON
- **运行时依赖**：智谱 Embedding API（每次 queryClassics 调用需编码 query）
- **无新 npm 依赖**：直接用 fetch 调 REST API
