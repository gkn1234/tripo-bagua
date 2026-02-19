# Tripo API 参考

## 1. 概述

Tripo API 是一个 AI 3D 模型生成服务的 REST API，支持从文本/图片生成 3D 模型，以及后处理（纹理、风格化、动画、格式转换等）。本项目使用 Tripo API v2 通过 `lib/tripo.ts` 客户端进行交互。

- **Base URL:** `https://api.tripo3d.ai/v2/openapi`
- **认证方式:** HTTP Bearer Token，请求头 `Authorization: Bearer <TRIPO_API_KEY>`
- **API Key 格式:** 以 `tsk_` 开头
- **环境变量:** `TRIPO_API_KEY`

## 2. 核心端点

### 2.1 创建任务

```
POST https://api.tripo3d.ai/v2/openapi/task
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

所有生成和后处理操作通过同一端点提交，由请求体中的 `type` 字段区分任务类型。

**通用响应格式：**

```json
{
  "code": 0,
  "data": {
    "task_id": "ef731ad6-aeb0-4950-9a2e-2298359dfaf8"
  }
}
```

- `code: 0` 表示成功，非零表示错误
- `message` 字段在错误时包含错误描述

### 2.2 查询任务状态

```
GET https://api.tripo3d.ai/v2/openapi/task/{task_id}
Authorization: Bearer <API_KEY>
```

**响应格式：**

```json
{
  "code": 0,
  "data": {
    "task_id": "...",
    "type": "text_to_model",
    "status": "success",
    "progress": 100,
    "output": {
      "model": "https://..../model.glb",
      "pbr_model": "https://..../model-pbr.glb",
      "rendered_image": "https://..../preview.webp"
    }
  }
}
```

**任务状态 (`status`)：**

| 状态 | 说明 |
|------|------|
| `queued` | 任务已排队等待处理 |
| `running` | 任务正在处理中 |
| `success` | 任务完成，`output` 字段包含结果 |
| `failed` | 任务失败 |
| `cancelled` | 任务已取消 |
| `banned` | 任务被禁止（内容违规等） |
| `expired` | 任务结果已过期 |

**`output` 字段：**

| 字段 | 说明 |
|------|------|
| `model` | 基础 GLB 模型下载 URL |
| `pbr_model` | PBR 材质 GLB 模型下载 URL（本项目主要使用此字段） |
| `base_model` | 基础模型 URL |
| `rendered_image` | 渲染预览图 URL |

### 2.3 文件上传

```
POST https://api.tripo3d.ai/v2/openapi/upload
Content-Type: multipart/form-data
Authorization: Bearer <API_KEY>
```

**请求参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `file` | File | 上传的图片文件（支持 webp/jpeg/png，分辨率 20px-6000px，建议 ≥256px） |

**响应：** 返回 `image_token`，用于 `image_to_model` 等任务。

### 2.4 查询余额

```
GET https://api.tripo3d.ai/v2/openapi/balance
Authorization: Bearer <API_KEY>
```

## 3. 任务类型

### 3.1 text_to_model（文本生成 3D 模型）

本项目当前使用的核心任务类型。

```json
{
  "type": "text_to_model",
  "prompt": "a small cat sitting on a cushion",
  "negative_prompt": "low quality, blurry",
  "model_version": "v3.0-20250812"
}
```

| 参数 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `prompt` | 是 | string | 3D 模型的文本描述 |
| `negative_prompt` | 否 | string | 不希望出现的特征描述 |
| `model_version` | 否 | string | 模型版本号（本项目使用 `v3.0-20250812`） |
| `texture_quality` | 否 | string | 纹理质量（`standard` / `detailed`） |
| `texture_seed` | 否 | integer | 纹理随机种子，用于可重复生成 |
| `face_limit` | 否 | integer | 输出模型面数限制 |

### 3.2 image_to_model（图片生成 3D 模型）

```json
{
  "type": "image_to_model",
  "file": {
    "type": "image_token",
    "file_token": "<上传返回的 image_token>"
  }
}
```

| 参数 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `file` | 是 | object | 图片引用，含 `type`（`image_token`）和 `file_token` |
| `texture_quality` | 否 | string | 纹理质量 |
| `auto_scale` | 否 | boolean | 是否自动缩放至真实尺寸 |
| `face_limit` | 否 | integer | 面数限制 |
| `orientation` | 否 | string | 朝向：`default` / `align_image` |

### 3.3 multiview_to_model（多视角生成 3D 模型）

```json
{
  "type": "multiview_to_model",
  "files": [
    { "type": "image_token", "file_token": "<token1>" },
    { "type": "image_token", "file_token": "<token2>" }
  ]
}
```

### 3.4 texture_model（纹理生成）

为已有模型生成或重新生成纹理和 PBR 材质。

```json
{
  "type": "texture_model",
  "original_model_task_id": "<先前任务的 task_id>",
  "texture_prompt": { "text": "wooden texture with natural grain" }
}
```

| 参数 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `original_model_task_id` | 是 | string | 先前生成任务的 task_id |
| `texture_prompt` | 否 | object | 纹理描述，包含 `text` 字段 |

### 3.5 refine_model（模型精修）

提升草稿模型的质量。

```json
{
  "type": "refine_model",
  "original_model_task_id": "<先前任务的 task_id>"
}
```

### 3.6 stylize_model（风格化）

```json
{
  "type": "stylize_model",
  "original_model_task_id": "<先前任务的 task_id>",
  "style": "lego",
  "block_size": 80
}
```

| 参数 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `original_model_task_id` | 是 | string | 支持的来源：text_to_model / image_to_model / multiview_to_model / texture_model / refine_model / animate_rig / animate_retarget |
| `style` | 是 | string | 风格：`lego` / `voxel` / `voronoi` / `minecraft` |
| `block_size` | 否 | integer | 32-128，默认 80，仅 minecraft 风格有效 |

### 3.7 animate_rig（骨骼绑定）

为模型添加骨骼以支持动画。

```json
{
  "type": "animate_rig",
  "original_model_task_id": "<先前任务的 task_id>"
}
```

**骨骼类型 (RigType):** BIPED / QUADRUPED / HEXAPOD / OCTOPOD / AVIAN / SERPENTINE / AQUATIC / OTHERS

### 3.8 animate_retarget（动画重定向）

将预设动画应用到已绑骨的模型。

```json
{
  "type": "animate_retarget",
  "original_model_task_id": "<rig 任务的 task_id>",
  "animation": "walk"
}
```

**预设动画：** idle / walk / run / dive / climb / jump / slash / shoot / hurt / fall / turn 等

### 3.9 convert_model（格式转换）

```json
{
  "type": "convert_model",
  "original_model_task_id": "<先前任务的 task_id>",
  "format": "FBX"
}
```

| 参数 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `format` | 是 | string | 目标格式：`GLTF` / `USDZ` / `FBX` / `OBJ` / `STL` / `3MF` |
| `texture_size` | 否 | integer | 漫反射贴图尺寸（像素），默认 2048（v2.0+ 默认 4096） |
| `texture_format` | 否 | string | 贴图格式：BMP/DPX/HDR/JPEG/OPEN_EXR/PNG/TARGA/TIFF/WEBP |
| `pivot_to_center_bottom` | 否 | boolean | 将轴心点设置到底部中心，默认 false |
| `scale_factor` | 否 | number | 缩放比例，默认 1 |
| `with_animation` | 否 | boolean | 导出时包含骨骼和动画，默认 true |
| `pack_uv` | 否 | boolean | 合并所有 UV 岛并导出单张贴图 |
| `face_limit` | 否 | integer | 输出面数限制 |
| `bake` | 否 | boolean | 烘焙纹理（法线贴图、AO 等合并到基础贴图），默认 true |
| `export_vertex_colors` | 否 | boolean | 导出顶点颜色（仅 OBJ/GLTF），默认 false |
| `export_orientation` | 否 | string | 模型朝向：`+x`（默认）/ `-x` / `-y` / `+y` |

**注意：** OBJ / STL / 3MF 不支持绑骨模型。

### 3.10 其他任务类型

| 任务类型 | 说明 |
|------|------|
| `smart_lowpoly` | 智能降面（高精度转低精度） |
| `mesh_segmentation` | 网格分割（将模型分解为组件） |
| `mesh_completion` | 网格补全（填充缺失几何体） |
| `check_riggable` | 检测模型是否可绑骨 |

## 4. 错误码

| HTTP 状态码 | 说明 |
|------|------|
| 200 + `code: 0` | 成功 |
| 200 + `code: 非0` | API 业务错误，查看 `message` 字段 |
| 401 | 认证失败（API Key 无效或缺失） |
| 429 | 请求频率超限 |
| 500+ | 服务端错误（建议重试） |

## 5. 本项目集成方式

本项目通过 `lib/tripo.ts` 封装了 Tripo API 的核心调用：

| 方法 | 对应端点 | 说明 |
|------|------|------|
| `tripoClient.createTask(prompt, options?)` | `POST /task` | 创建 `text_to_model` 任务，使用 `v3.0-20250812` 版本。options 支持 `negativePrompt`（可选，有默认值）。请求体自动包含 `texture_quality: 'detailed'` |
| `tripoClient.retextureModel(originalTaskId, options?)` | `POST /task` | 创建 `texture_model` 任务，对已生成模型重新生成纹理。options 支持 `prompt`（通过 `texture_prompt.text` 传递）、`textureSeed`、`textureQuality`（`standard`/`detailed`）。自动设置 `texture: true` 和 `pbr: true` |
| `tripoClient.getTask(taskId)` | `GET /task/{id}` | 查询任务状态和输出 |
| `tripoClient.waitForCompletion(taskId)` | 轮询 `GET /task/{id}` | 服务端轮询等待完成（超时 120s，间隔 3s） |

**代理路由（隐藏 API Key）：**

| 路由 | 说明 |
|------|------|
| `GET /api/tripo/task/[id]` | 任务状态查询代理（`app/api/tripo/task/[id]/route.ts`） |
| `GET /api/tripo/proxy?url=...` | GLB 模型文件代理，24h 缓存（`app/api/tripo/proxy/route.ts`） |

## 6. 官方资源

- API 文档首页: https://platform.tripo3d.ai/docs
- Quick Start: https://platform.tripo3d.ai/docs/quick-start
- OpenAPI Schema: https://platform.tripo3d.ai/docs/schema
- Python SDK: https://github.com/VAST-AI-Research/tripo-python-sdk
- Blender 插件: https://github.com/VAST-AI-Research/tripo-3d-for-blender
