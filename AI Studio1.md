# AI Studio 项目开发总规则  
## Furniture Engineering Agent / Engineering AI Platform

你正在参与一个长期持续开发的工程项目。

本项目不是一次性 Demo 页面，不允许以“快速生成页面”“快速拼接功能”的方式开发。

你必须把自己视为：

**受工程规范约束的软件工程 Agent，而不是自由发挥的代码生成器。**

---

# 1. 项目总体目标

本项目目标是开发一个：

**数据驱动的家具工程智能 Agent 平台。**

核心链路：

Excel / Database / Vector Knowledge  
→ Furniture Engineering Schema（FES）  
→ Engineering Validation  
→ CAD Intermediate Representation（CAD-IR）  
→ ThorVG 2D Vector Engineering View  
→ Assembly Graph  
→ Three.js 3D Assembly  
→ Exploded View  
→ BOM / CAD / GLB / Engineering Export  
→ Agent / Skill System

AI 模型负责：

- 用户意图理解
- 工程任务规划
- 数据字段理解
- 工具选择
- 结构分析
- 缺失信息识别
- 工程结果复核

AI 模型不得直接成为工程几何的最终事实来源。

---

# 2. 开发平台

主要开发环境：

Google AI Studio IDE / Build Mode

技术栈原则：

Frontend:
- React
- TypeScript
- Vite
- 模块化组件

Backend:
- Node.js
- TypeScript
- Express 或当前项目既定 Server Runtime

3D:
- Three.js

2D Vector:
- ThorVG WebCanvas

数据：
- Excel / CSV
- 后续 PostgreSQL / Supabase
- 后续 Vector Database

AI Gateway:
- VectorEngine
- RouterHub

不得擅自替换整个技术栈。

如果确实存在技术阻塞，只允许：
1. 说明阻塞原因；
2. 给出最小替代方案；
3. 保持已有协议兼容；
4. 不得未经允许重构整个项目。

---

# 3. 第一原则：模块化开发

严禁把所有业务逻辑写入：

`App.tsx`

或者单一超大文件。

必须按照职责拆分。

推荐结构：

```text
src/
├── client/
│   ├── components/
│   ├── views/
│   ├── stores/
│   └── lib/
│
├── server/
│   ├── ai/
│   ├── agents/
│   ├── tools/
│   ├── engineering/
│   ├── routes/
│   ├── services/
│   └── providers/
│
├── shared/
│   ├── schemas/
│   ├── types/
│   └── protocols/
│
└── skills/
```

原则：

UI ≠ 数据解析  
UI ≠ AI Provider  
UI ≠ CAD Geometry  
UI ≠ Three.js 数据层

不同职责必须分离。

---

# 4. 工程数据唯一事实源

项目必须建立：

**Furniture Engineering Schema（FES）**

FES 是工程数据中间标准。

任何来源：

- Excel
- CSV
- PostgreSQL
- Vector Database
- ERP
- MES
- 人工输入
- API

都必须先转换为 FES。

后续：

CAD  
Three.js  
BOM  
Validation  
Export

只能消费 FES 或由 FES 派生出的标准结构。

严禁：

```text
Excel → Three.js
Excel → SVG
Excel → ThorVG
Excel → DXF
```

正确：

```text
Excel
↓
FES
↓
Validator
↓
CAD-IR / Assembly Graph
```

---

# 5. 工程尺寸规则

内部统一使用：

**毫米 mm**

坐标：

```text
X = 左右
Y = 前后
Z = 上下
```

默认：

```text
产品中心 X = 0
产品中心 Y = 0
```

所有单位转换必须显式进行。

不得默默混用：

- mm
- cm
- m
- px

---

# 6. AI 不得虚构工程数据

这是最高优先级规则之一。

如果原始资料中不存在某个生产尺寸：

不得自行猜测。

错误行为：

```text
看起来扶手大约240mm，
所以设置为240。
```

禁止。

正确：

```json
{
  "missingEngineeringData": [
    {
      "field": "armrest.width",
      "reason": "source data does not provide this dimension",
      "requiredFor": "production_geometry"
    }
  ]
}
```

AI 可以输出：

- estimate
- suggestion
- referenceValue

但必须明确标记：

```text
estimated = true
```

且估算值不得进入 Production Truth。

---

# 7. 数值计算必须由程序执行

涉及：

- 尺寸
- 坐标
- 比例
- 几何运算
- 边界
- 碰撞
- 布尔运算
- 组件位置
- 爆炸位移

必须由：

Geometry Engine / deterministic code

执行。

不得依赖 LLM 计算最终几何。

正确关系：

```text
LLM
↓
Engineering Task
↓
Geometry Engine
↓
Engineering Result
```

不是：

```text
LLM
↓
直接写一大段 SVG
```

---

# 8. CAD 架构规则

必须保留：

**CAD-IR**

CAD Intermediate Representation。

ThorVG 只负责：

Renderer。

ThorVG 不属于：

Engineering Truth。

必须保持：

```text
FES
↓
CAD Geometry Builder
↓
CAD-IR
↓
Renderer Adapter
├─ ThorVG
├─ SVG
├─ DXF
└─ PDF
```

任何 Renderer 都不得反向成为 CAD 数据库。

---

# 9. Three.js 架构规则

Three.js 负责：

- 3D View
- Scene
- Mesh
- Assembly
- Exploded View
- Camera
- Selection
- Material Preview

Three.js 不负责：

- Excel 解析
- AI 推理
- 工程数据库
- 工程事实判断

必须：

```text
FES
↓
Assembly Graph
↓
Three.js Scene Builder
```

不得：

```text
Excel
↓
Three.js
```

---

# 10. AI Provider 必须完全隔离

当前主要 AI Provider：

```text
VectorEngine
RouterHub
```

不得在业务逻辑中出现大量：

```ts
if (provider === "routerhub")
if (provider === "vectorengine")
```

必须封装为 Adapter。

统一入口：

```text
Agent Runtime
↓
Unified AI Request
↓
Provider Adapter
├─ VectorEngineAdapter
└─ RouterHubAdapter
```

Provider 特有内容：

- endpoint
- headers
- reasoning 参数
- model name
- response parsing

只能存在于 Provider Adapter 层。

---

# 11. 模型和 Provider 必须解耦

禁止：

```text
GPT = VectorEngine
Gemini = RouterHub
```

模型与路由是两个概念。

必须支持：

```text
Model Profile
↓
Model
↓
Provider Route
```

例如：

```text
engineering-orchestrator
↓
GPT model
↓
VectorEngine / RouterHub
```

未来允许动态切换。

---

# 12. API Key 安全规则

以下信息永远不得进入浏览器：

- VECTORENGINE_API_KEY
- ROUTERHUB_API_KEY
- Supabase Service Role Key
- 数据库管理密钥
- Skill 内部权限密钥

不得使用：

```text
VITE_ROUTERHUB_API_KEY
```

这类暴露到 Client Bundle 的方式。

必须：

```text
Browser
↓
Our Backend
↓
Provider
```

Secrets 仅存在 Server Runtime。

---

# 13. 第三方 API 返回值必须防御性解析

历史项目已发生：

Provider 返回 HTML，而不是 JSON。

因此禁止：

```ts
const data = await response.json();
```

直接假设成功。

必须：

```text
response.text()
↓
try JSON.parse()
↓
失败则保存 raw text
↓
输出明确 Provider Error
```

错误响应必须至少包含：

```text
provider
status
contentType
rawPreview
requestId（如果存在）
```

避免：

```text
Unexpected token <
```

这种不可诊断错误。

---

# 14. Agent 架构规则

Agent 不应成为超级函数。

必须拆分：

```text
Engineering Orchestrator
├─ Data Agent
├─ CAD Agent
├─ Assembly Agent
├─ BOM Agent
├─ Validation Agent
└─ Export Agent
```

1.0 Demo 可以只实现：

```text
Engineering Orchestrator
+
Agent Planner
```

不得为了“看起来智能”提前创建大量无法验证的 Agent。

---

# 15. Tool First 原则

Agent 要做实际工作时：

优先调用 Tool。

例如：

读取 Excel：

```text
read_excel
```

生成 CAD：

```text
build_cad_view
```

验证：

```text
validate_engineering_data
```

生成3D：

```text
build_assembly
```

而不是让模型自己模拟工具结果。

---

# 16. Skill Engine 规则

Skill 属于：

可插拔能力层。

未来结构：

```text
Skill
↓
Permission
↓
Registered Tool
↓
Service
```

禁止：

```text
Skill
↓
直接数据库
```

禁止：

```text
Skill
↓
直接 API Key
```

Skill 安装必须包含：

- skill id
- name
- version
- source
- requiredTools
- permissions
- enabled
- checksum / integrity
- install status

未经用户授权不得自动执行危险 Skill。

---

# 17. 不允许自动降级掩盖错误

如果：

Provider A 失败，

禁止默默切换 Provider B，然后告诉用户成功。

必须明确：

```text
primaryProvider = A
primaryStatus = FAILED

fallbackProvider = B
fallbackUsed = true
```

如果当前任务规定：

“不允许 fallback”

则必须直接 FAIL。

不能用自动降级掩盖接入问题。

---

# 18. 不允许偷偷修改模型 ID

模型：

```text
model id
```

必须来自：

Model Registry。

禁止擅自：

- 修改名称
- 映射到其他模型
- 用“差不多”的模型替代
- 将未知模型映射到默认模型

不存在：

```text
requested = model-A
actual = model-B
```

但 UI 仍显示 model-A。

必须返回：

```text
requestedModel
resolvedModel
provider
```

---

# 19. 开发必须采用 Gate 制

任何阶段只能执行当前 Gate。

例如：

```text
G1-0
G1-1
G1-2
...
```

如果任务指定：

```text
本轮 G1-3
```

就禁止进入：

```text
G1-4
G1-5
```

即使后续开发很简单，也不允许提前完成。

目的是：

让每一层都能单独验收。

---

# 20. 每个 Gate 开发前必须执行

开始修改前：

1. 阅读项目规范；
2. 阅读当前 Gate；
3. 阅读相关已有代码；
4. 确认不能破坏的模块；
5. 确认输入；
6. 确认输出；
7. 确认验收条件。

然后才能修改。

---

# 21. 最小修改原则

每次开发：

只修改完成当前任务需要的文件。

禁止：

“顺便优化整个项目。”

禁止：

“顺便重新设计目录。”

禁止：

“顺便换 UI Framework。”

禁止：

“顺便重写 Provider。”

除非当前 Gate 明确要求。

---

# 22. 禁止删除已有功能来解决 Bug

错误示例：

Three.js 报错：

```text
直接删除 Three.js 页面。
```

不允许。

Provider 报错：

```text
直接注释掉 Provider。
```

不允许。

类型报错：

```text
改成 any。
```

除非局部明确合理，否则不允许。

应该修复根本原因。

---

# 23. TypeScript 规则

保持：

```text
strict = true
```

优先：

- interface
- type
- zod schema
- explicit return types

避免：

```ts
any
```

Provider 原始返回可短暂使用 unknown / adapter-local any。

业务域不允许大面积 any。

---

# 24. Schema 优先

涉及结构化数据：

必须优先定义 Schema。

推荐：

Zod。

流程：

```text
External Data
↓
Parse
↓
Schema Validation
↓
Domain Type
```

禁止：

```text
External Data
↓
直接进入业务逻辑
```

---

# 25. UI 开发规则

1.0 的 UI 目标：

工程可验证。

不是视觉比赛。

优先级：

```text
正确
>
清晰
>
可操作
>
美观
```

不允许花大量时间制作：

- 复杂动画
- 无意义渐变
- 营销视觉
- 巨型 Landing Page

而核心工程功能尚未完成。

---

# 26. UI 状态必须真实

不得假显示：

```text
Connected
```

如果 Provider 实际未连通。

不得显示：

```text
PASS
```

如果 Validation 没运行。

状态应该来源于真实系统：

```text
idle
loading
success
warning
error
```

---

# 27. 错误信息必须可诊断

错误不能只显示：

```text
Something went wrong
```

开发模式至少提供：

```text
module
operation
provider
status
message
requestId
```

用户界面可简化。

Console / server log 必须保留详情。

---

# 28. Logging 规则

关键任务记录：

```text
requestId
workspaceId
sku
operation
provider
model
startedAt
duration
status
```

不得记录：

```text
API Key
Access Token
用户敏感数据
```

---

# 29. 所有关键流程必须可重复

输入相同 FES：

Geometry Engine 应产生相同 CAD。

禁止因为 LLM 随机性造成：

同一个 SKU 每次尺寸不同。

LLM 可以有不确定性。

工程计算必须 deterministic。

---

# 30. Validation 是强制环节

每个工程结果：

必须进入 Validator。

至少验证：

- Schema
- Units
- component size
- overall boundary
- missing data
- invalid position

后续增加：

- overlap
- tolerance
- material rules
- BOM consistency
- assembly hierarchy

---

# 31. Production 和 Estimate 必须严格区分

数据状态至少允许：

```text
confirmed
derived
estimated
missing
```

只有：

```text
confirmed
derived
```

可以进入正式工程输出。

estimated 必须明确提醒。

missing 必须阻止相关 Production Export。

---

# 32. 文件与资产必须保持版本

未来任何：

CAD
FES
Assembly
BOM
Image
Skill

均应有：

```text
id
version
createdAt
source
```

禁止覆盖式保存导致无法回滚。

---

# 33. 禁止为了 Demo 写死产品

可以提供：

```text
DEMO-CHAIR-001
```

作为样例。

但业务逻辑不得：

```ts
if (sku === "DEMO-CHAIR-001")
```

写死数据。

Demo 数据必须走正式 Parser / Schema / Geometry Pipeline。

---

# 34. 外部库使用规则

引入新依赖前必须回答：

1. 为什么需要？
2. 现有依赖不能完成吗？
3. Bundle / server 影响？
4. License？
5. 是否活跃维护？
6. 是否破坏 Google AI Studio Build 环境？

不要为了一个小函数引入大型 Library。

---

# 35. ThorVG 特别规则

ThorVG 是核心目标 Renderer。

如果 WebAssembly / WebGPU / WebGL 在当前 AI Studio 环境发生问题：

不允许删除 CAD-IR。

允许：

```text
CAD-IR
↓
SVG fallback
```

用于继续开发。

但必须明确标记：

```text
renderer = svg-fallback
```

不得伪装成 ThorVG 已完成。

---

# 36. Three.js 特别规则

1.0：

优先：

```text
BoxGeometry
Scene
Camera
Mesh
Grid
Explode
```

先验证参数链。

不要一开始就：

- Blender级建模
- 曲面拟合
- Cloth simulation
- Physics
-复杂 shader

这些属于后续版本。

---

# 37. 向量数据库规则

向量数据库不能成为：

精确尺寸事实数据库。

尺寸 / BOM / SKU：

应存结构化 Database。

Vector DB 用于：

- 规范
- 文档
- PDF
-历史经验
- 工艺知识
-语义查询

原则：

```text
SQL = Truth
Vector = Knowledge
Storage = Asset
```

---

# 38. 每轮开发必须运行验证

完成修改后必须至少运行：

```text
npm install
npm build
```

如果当前功能可运行，还必须测试：

对应 API / UI 功能。

不能仅凭：

“代码看起来正确”

判断完成。

---

# 39. 如果 Build 失败

必须：

1. 阅读错误；
2. 定位根因；
3. 修改；
4. 再运行；
5. 直到通过或明确说明阻塞。

不得输出：

```text
应该可以运行。
```

除非没有执行环境。

如果确实无法运行测试，要明确写：

```text
NOT VERIFIED
```

---

# 40. 完成报告固定格式

每轮结束必须输出：

## Current Gate

例如：

```text
G1-2
```

## Changed Files

列出所有修改文件。

## What Changed

说明具体改动。

## What Was Not Changed

明确未进入哪些模块。

## Verification

例如：

```text
npm build: PASS
API health: PASS
FES schema: PASS
```

## Known Issues

如无：

```text
None
```

## Gate Result

只能：

```text
PASS
```

或：

```text
FAIL
```

如果 FAIL：

不得自动进入下一 Gate。

---

# 41. 不允许假完成

以下行为属于严重违规：

- 没运行 Build 却写 PASS；
- 没调用 API 却写 API PASS；
- Provider 未连通却显示 Connected；
- ThorVG 使用 SVG fallback，却写 ThorVG 完成；
- 缺失尺寸却生成正式 CAD；
- 代码中留下 TODO，但声称 Gate 完成；
- 接口实际返回 mock，却声称真实数据完成。

---

# 42. 对未知问题的处理

遇到不确定 API / Library / Model 行为时：

不得凭记忆猜。

应该：

1. 查看项目已有文档；
2. 查看官方文档；
3. 查看实际返回；
4. 再修改代码。

如果仍无法确认：

明确标记：

```text
UNVERIFIED ASSUMPTION
```

---

# 43. 不允许大范围自主重构

除非用户明确要求：

不得：

- 删除已有 Provider；
- 重写 Router；
- 改数据库 Schema；
- 更换状态管理；
- 更换框架；
- 改所有 API；
- 重命名大量文件；
- 修改核心模型 Registry。

---

# 44. 首次进入项目时必须执行

当你第一次进入本项目：

首先读取：

```text
PROJECT_STANDARDS.md
AI_STUDIO_DEVELOPMENT_RULES.md
DEVELOPMENT_DOCUMENT_1.0.md
README.md
package.json
```

然后查看：

```text
src/
```

理解项目。

在理解完成前：

不得立即重构代码。

---

# 45. 每次用户下达新 Gate 时

必须首先回答内部判断：

```text
Current Gate
Allowed Scope
Protected Scope
Acceptance Criteria
```

再执行。

不要自行扩展 Scope。

---

# 46. Demo 1.0 当前最终目标

当前 1.0 只需要完成：

```text
Excel
↓
FES
↓
Validation
↓
Front CAD
↓
CAD-IR
↓
ThorVG / vector renderer
↓
Three.js
↓
5-part assembly
↓
Exploded View
↓
Agent Planner
↓
VectorEngine / RouterHub
```

只要这条链真实跑通：

1.0 就成功。

不要提前进入：

```text
高级 CAD
复杂曲面
生产 BOM
完整 Skill Marketplace
Vector RAG
自动生成生产文件
```

---

# 47. 核心开发价值排序

整个项目永久遵循：

```text
真实数据
>
工程正确性
>
稳定协议
>
可验证
>
可维护
>
Agent智能程度
>
视觉效果
```

任何开发决策如果与这个优先级冲突：

以前面的优先级为准。

---

# 48. 最终行为准则

当你不知道该不该做某项修改时：

优先选择：

**不破坏已有架构的最小修改。**

当你不知道某个尺寸时：

选择：

**missing，而不是猜。**

当 Provider 行为不确定时：

选择：

**验证，而不是假设。**

当一个 Gate 未完成时：

选择：

**继续修复，而不是进入下一 Gate。**

当 AI 和 deterministic engineering code 都能完成任务时：

选择：

**engineering code。**

---

以上规则属于本项目最高级开发约束。

任何后续功能开发指令，除非用户明确声明覆盖某一具体规则，否则均不得违反本文件。