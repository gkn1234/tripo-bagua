# 八字吉祥物 3D 生成应用 - API 调研文档

## 项目概述

Web 应用：用户输入生日 → 计算生辰八字 → 分析八字生成吉祥物提示词 → Tripo 文生3D → 3D 打印下单

---

## 一、Tripo 文生3D API

### 源文档

- Tripo API 官方文档：<https://platform.tripo3d.ai/docs>
- 国内版平台：<https://platform.tripo3d.com>

### 接口信息

| 项目 | 详情 |
|------|------|
| 创建任务 | `POST https://api.tripo3d.ai/v2/openapi/task` |
| 查询任务 | `GET https://api.tripo3d.ai/v2/openapi/task/{task_id}` |
| 查询余额 | `GET https://api.tripo3d.ai/v2/openapi/user/balance` |
| 认证方式 | `Authorization: Bearer tsk_***` |
| 输出格式 | GLB（可直接用于 3D 打印下单） |

### 调用流程

```
1. 提交文生3D任务
   POST /v2/openapi/task
   Body: { "type": "text_to_model", "prompt": "吉祥物描述" }
   Response: { "code": 0, "data": { "task_id": "xxx" } }

2. 轮询任务状态
   GET /v2/openapi/task/{task_id}
   等待 status == "success"

3. 获取模型文件
   从任务结果中获取模型下载 URL（GLB 格式）
```

### 关键参数

| 参数 | 说明 |
|------|------|
| `type` | 必填，固定 `"text_to_model"` |
| `prompt` | 必填，文本描述（吉祥物提示词） |
| `negative_prompt` | 可选，排除元素描述 |
| `model_version` | 可选，如 `"v2.5-20250123"`、`"Turbo-v1.0-20250506"`（秒级生成） |
| `texture` | 可选，是否生成纹理，默认 true |
| `pbr` | 可选，是否生成 PBR 纹理，默认 true |
| `texture_quality` | 可选，`"standard"` 或 `"detailed"` |
| `face_limit` | 可选，最大面数限制（3D 打印可适当控制） |

### 代码示例

```javascript
const apiKey = 'tsk_***';

// 1. 创建任务
const createRes = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    type: 'text_to_model',
    prompt: '一只金色的麒麟，祥瑞之兆，精致小巧适合摆件'
  })
});
const { data: { task_id } } = await createRes.json();

// 2. 轮询状态
let task;
do {
  await new Promise(r => setTimeout(r, 3000));
  const statusRes = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${task_id}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  task = (await statusRes.json()).data;
} while (task.status !== 'success' && task.status !== 'failed');

// 3. 获取模型 URL
const modelUrl = task.output.model; // GLB 文件 URL
```

### 需要获取

- [x] **Tripo API Key** → 已获取，存放于 `secret` 文件
- [ ] **Tripo API 调用额度** → 当前余额为 0，需联系 **Gavin** 充值（client-id: `tcli_addfd231fd6b43d1924e9b8ae7f29886`）
- [ ] **国内版 API 开通**（如需大规模调用）→ 联系 **宋懿**

### 连通性测试结果（2025-02-10）

| 测试项 | 结果 | 说明 |
|--------|------|------|
| API Key 认证 | ✅ 通过 | 无 401/403 错误 |
| 查询余额 | ✅ 通过 | 返回 `balance: 0, frozen: 0` |
| 创建任务 | ❌ 额度不足 | `code: 2010 - You don't have enough credit` |

> **下一步**：联系 Gavin 为 client-id `tcli_addfd231fd6b43d1924e9b8ae7f29886` 充值 Hackathon 专用额度

---

## 二、Shop 中台 3D 打印订单 API

### 源文档

- 飞书文档：<https://a9ihi0un9c.feishu.cn/wiki/DFJaw0uCmidEr4k1ghCcbthLn1d>

### 接口信息

| 项目 | 详情 |
|------|------|
| 创建订单 | `POST https://zwgf-api.tripo3d.com/shop/api/orders` |
| 查询订单 | `GET https://zwgf-api.tripo3d.com/shop/api/orders/{order_id}` |
| 认证方式 | `X-API-Key: xxx`（联系工作人员获取） |
| Webhook | 支持发货状态回调 |

### 创建订单 - 必填字段

| 字段 | 说明 | 本项目取值 |
|------|------|-----------|
| `dimensions` | 尺寸 | `"5CM"` 等 |
| `category` | 品类 | `"摆件"`（支持底座） |
| `quantity` | 数量 | 用户选择 |
| `finish_type` | 表面工艺 | `"matte"` 磨砂 / `"glossy"` 光滑 |
| `contact_person` | 联系人 | 用户填写 |
| `contact_phone` | 联系电话 | 用户填写 |
| `shipping_address` | 收货地址 | 用户填写 |
| `country` | 国家 | 用户填写 |
| `original_platform` | 来源平台 | `"hackathon-bazi"` |
| `currency` | 货币 | `"RMB"` |
| `transaction_amount` | 金额 | 根据尺寸定价 |
| `original_model_files` | 3D模型文件 | Tripo 生成的 GLB 文件 |

### 可选字段（本项目会用到）

| 字段 | 说明 | 本项目取值 |
|------|------|-----------|
| `has_base` | 是否带底座 | `1`（摆件建议带底座） |
| `base_engraving` | 底座刻字 | 八字吉祥语 / 用户生辰信息 |
| `special_notes` | 特殊备注 | `"hackathon 订单"` |
| `reference_image_files` | 参考图片 | 吉祥物概念图（可选） |

### 文件格式要求

- **模型文件**：STL, OBJ, FBX, 3MF, GLB, ZIP，单文件 ≤ 50MB
- **参考图片**：JPG, PNG, GIF, WEBP，单文件 ≤ 10MB
- 即使只有一个文件也必须是**数组格式**

### 代码示例

```javascript
const orderRes = await fetch('https://zwgf-api.tripo3d.com/shop/api/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-shop-api-key'
  },
  body: JSON.stringify({
    dimensions: '5CM',
    category: '摆件',
    quantity: 1,
    finish_type: 'matte',
    has_base: 1,
    base_engraving: '甲子年 丙寅月 壬午日 - 瑞兽护佑',
    contact_person: '用户姓名',
    contact_phone: '13800138000',
    shipping_address: '用户地址',
    country: '中国',
    original_platform: 'hackathon-bazi',
    currency: 'RMB',
    transaction_amount: 99.00,
    special_notes: 'hackathon 订单',
    original_model_files: [{
      file_url: modelUrl,  // Tripo 生成的 GLB 文件 URL
      file_name: 'mascot.glb',
      file_size: fileSize
    }]
  })
});
// Response: { success: true, order_id: 54, status: "pending_review" }
```

### 订单状态流转

```
waiting_modeling → modeling → printing_review → printing → shipped → completed
```

### 需要获取

- [ ] **Shop 中台 API Key** → 联系 **吕宝源**

### 连通性测试结果（2025-02-10）

| 测试项 | 结果 | 说明 |
|--------|------|------|
| 域名解析 | ✅ 通过 | DNS 0.045s |
| 网络连通 | ✅ 通过 | 响应 0.178s |
| 认证拦截 | ✅ 正常 | 401 `"未授权访问，请提供有效的JWT token或API key"` |
| 创建订单 | ⬜ 待测 | 需获取 API Key 后测试 |

> **下一步**：联系 **吕宝源** 获取 API Key，标注 "hackathon 订单" 用途

---

## 三、支持人员清单

| 事项 | 联系人 | 备注 |
|------|--------|------|
| Tripo API 额度 / Studio 会员 | **Gavin** | 申请 Hackathon 专用调用额度 |
| 国内版 API 开通 | **宋懿** | platform.tripo3d.com 人肉开通 |
| Tripo API 使用问题 | **梁鼎** | 技术问题咨询 |
| Shop 中台订单 API | **吕宝源** | API Key 获取 + 使用问题 |
| AI 编码工具额度 (deerapi) | **付小宇** | Cursor / Claude / DeepSeek 等 |
| 云资源 | **梁鼎** | 需要云资源时联系 |
| GitHub 仓库权限 | **梁鼎** | vast-enterprise 组织提交权限 |
| 策划及赛程问题 | **Sienna** / **Josephine** | 活动相关 |
| 奖金发放 | **Lisa** | 税前金额，团队自行分配 |

---

## 四、本项目需优先获取的资源

### 必须（阻塞开发）

| 优先级 | 资源 | 联系人 | 状态 |
|--------|------|--------|------|
| P0 | Tripo API Key | **Gavin** | ✅ 已获取，认证通过 |
| P0 | Tripo API 调用额度充值 | **Gavin** | ⬜ 待充值（当前 balance=0） |
| P0 | Shop 中台 API Key | **吕宝源** | ⬜ 待申请 |

### 可选（增强体验）

| 优先级 | 资源 | 联系人 | 状态 |
|--------|------|--------|------|
| P1 | 国内版 API 开通 | **宋懿** | ⬜ 按需 |
| P2 | AI 编码工具额度 | **付小宇** | ⬜ 按需 |
| P2 | 云资源（部署用） | **梁鼎** | ⬜ 按需 |

---

## 五、注意事项

1. **API Key 安全**：Shop 中台 API Key 不要在前端代码中暴露，需通过后端代理调用
2. **Tripo API Key** 同理，前端调用需走后端中转
3. **订单标注**：所有通过 Shop 中台创建的订单必须在 `special_notes` 中标注 `"hackathon 订单"`
4. **模型文件格式**：Tripo 生成的 GLB 可直接用于 Shop 中台下单，无需转换
5. **请求超时**：Shop 中台建议设置 30 秒超时
6. **订单号唯一性**：如提供 `order_no`，需确保全局唯一
7. **提交截止**：2025年2月21日 23:59
