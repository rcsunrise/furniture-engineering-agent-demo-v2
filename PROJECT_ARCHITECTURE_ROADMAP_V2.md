# Furniture Engineering Agent — 项目架构与开发路线 V2
## 基于 2026-08-27 当前代码审计

---

# 1. 项目真正要解决的问题

目标不是“图片生成 3D”，也不是“Excel 画一个看起来像 CAD 的线稿”。

真正目标是：

> 将不完整、不确定的产品信息，经过 AI 观察 + 工程约束 + 确定性几何求解，转化为可编辑、可验证、可追溯、可导出的家具工程数字模型。

平台最终应支持：

```text
真实产品图 / 三视图 / 工程图 / Excel / DB / AI Mesh
                         ↓
              Observation / Measurement
                         ↓
          Canonical Engineering Model
                         ↓
         Constraint + Geometry Solver
                         ↓
 CAD / Mesh / B-Rep / Assembly / BOM / Exploded View
```

---

# 2. 当前代码能力盘点

## 已经建立并值得保留

- React + TypeScript + Vite 前端；
- Express Node Server；
- FES 1.0；
- Excel Parser；
- Engineering Validator；
- CAD-IR；
- ThorVG/SVG 展示；
- Three.js Assembly / Exploded View；
- VectorEngine / RouterHub / Gemini Provider；
- Telemetry / fallback info；
- G3 Reference Observation；
- Calibration Adapter；
- Constraint Solver 初版；
- front/side/top profiles；
- Loft Sections；
- SoftSurface Params；
- Topology 2D 占位/解析；
- CAD modular projection pipeline；
- 3D loft / soft surface builders。

## 当前本质阶段

```text
已经不是 Demo 1.0 初始阶段；
代码实际上进入了 G3-C / G3-C-R2 级别。
```

原有 `DEVELOPMENT_DOCUMENT_1.0.md` 和 `PROJECT_STANDARDS.md` 中大量 Demo 1.0 限制已经过时，只能作为历史文档，不应继续充当最高规则。

---

# 3. 当前代码 P0 风险

## P0-1 Client / Server 边界被破坏

`src/client/App.tsx` 直接 import：

```text
../server/excel
../server/validate
../server/cad
../server/assembly
```

问题：

- Client 与 Server 实现耦合；
- 容易把 server 依赖打入浏览器 bundle；
- Server API 与 client fallback 形成双执行路径；
- 同一输入可能产生两套结果；
- 违反 Google AI Studio full-stack separation。

修复原则：

```text
Client → API only
Shared → pure schemas/types/core only
Server → parser/geometry/api/providers
```

如确需 browser fallback，应把真正可同构纯函数迁入 `src/shared/core/`，不得 import `src/server/**`。

---

## P0-2 App.tsx 已膨胀到约 772 行

当前 App 同时承担：

- 上传；
- parser fallback；
- validation；
- CAD API；
- Assembly API；
- Agent；
- tabs；
- sample loading；
- state orchestration。

应拆分：

```text
client/features/data/
client/features/cad/
client/features/assembly/
client/features/g3/
client/features/agent/
client/stores/
```

App.tsx 只保留路由/布局/顶级状态编排。

---

## P0-3 FES ComponentType 规范漂移

`ComponentTypeEnum` 已定义，但 `ComponentSchema.type` 当前是：

```text
z.string()
```

因此 enum 实际没有约束力。

这会产生两种风险：

- 为兼容 Excel 放宽后，未知类型进入 Runtime；
- 各 Builder 通过字符串猜语义。

建议：

```text
rawType → normalize/migrate → CanonicalComponentTypeEnum
```

Parser 可宽容，Runtime Schema 必须严格。

---

## P0-4 SoftSurface 字段已经发生真实漂移

Runtime Schema / Excel Parser 使用：

```text
crownX
crownY
frontDrop
cornerFalloff
seamPull
```

但 `fesDraftBuilder.ts` 仍输出：

```text
crownBulgeMm
frontEdgeDroopMm
cornerFalloffMm
seamPullDepthMm
```

后果：

> G3 自动 Geometry Draft 虽然“生成了参数”，但 renderer 并不按同一字段消费。

必须建立 migration，并统一为一套 SoftSurfaceParams V2。

---

## P0-5 Geometry Source 大小写协议不一致

`shapeRegistry.ts` 使用：

```text
WORKBOOK_PROFILE
WORKBOOK_LOFT
PROXY_FALLBACK
```

但 UI/diagnostics 使用：

```text
workbook_profile
workbook_loft
proxy_fallback
```

这直接解释了 CAD 顶部长期出现：

```text
Profiles: 0
Lofts: 0
Soft: 0
```

即使实际数据已进入 Runtime。

必须建立一个共享 `GeometrySourceSchema`，禁止自由字符串。

---

## P0-6 Geometry Diagnostics 仍可能假阳性

当前逻辑类似：

```text
mode === loft_shell
→ 即使没有匹配 loftGroup，也可能标 workbook_loft
```

正确逻辑必须检查：

```text
component.loftGroup
AND
loftSections.some(section.loftGroup === component.loftGroup)
```

SoftSurface 同理。

---

## P0-7 3D 仍不是真正 Profile-Guided

`loftGeometryBuilder.ts` 当前基础截面仍由 64 点圆/椭圆生成，然后用 scale/bulge 变形。

也就是说：

```text
front/side/top profile 并没有作为 3D surface 主约束。
```

这解释了扶手仍然“胶囊化/高窄化”。

---

## P0-8 AssemblyDocument 没有携带完整 Profile Dataset

当前 Assembly 主要携带：

```text
components
loftSections
softSurfaceParams
```

缺少：

```text
cadProfiles
shapeProfiles
profileIndex
topology2D
```

因此 Three.js 侧即使知道 profile ID，也拿不到完整 profile geometry。

---

## P0-9 Excel Draft Export 仍有占位输出

`excelDraftExport.ts` 的：

```text
Topology_2D
Sections_3D
Assembly
```

仍然输出 `PRESERVED_FOR_*` 占位数据。

这意味着系统自动生成的 G3 Excel 尚未真正与当前 G3-C Workbook 能力对齐。

---

# 4. 平台新分层

建议逐步稳定为：

```text
L0 UI / Workspace
L1 Application Orchestrator
L2 Source Adapters
L3 Observation / AI Inference
L4 Canonical Engineering Model
L5 Constraint Solver
L6 Geometry Kernel
L7 Representation Adapters
L8 Validation / Export / Provenance
L9 Local/Remote Worker & Provider Infrastructure
```

---

# 5. Canonical Engineering Model（不推翻 FES）

不要重新发明一套新模型。

做法：

```text
FES 1.0
↓ backward-compatible evolution
FES 2.x / Canonical Engineering Model
```

至少新增/规范：

- canonical component type；
- geometry source；
- dimension provenance；
- profile coordinate convention；
- geometry representation；
- part topology；
- assembly relationships；
- manufacturing semantics；
- source asset references。

---

# 6. AI Mesh 的正确位置

Hunyuan3D/ComfyUI 是：

```text
Visual Reconstruction Provider
```

不是：

```text
Engineering Geometry Kernel
```

建议定义：

```text
GeometryAsset
- ai_reference_mesh
- parametric_mesh
- engineering_brep
- manufacturing_part
```

AI Mesh 必须是 `productionTruth=false`。

---

# 7. AI Studio 与本地 ComfyUI 的网络事实

Google AI Studio Build 的 Node server 在远端 runtime 中。

因此：

```text
AI Studio server http://127.0.0.1:8188
```

不会指向用户 Windows 电脑上的 ComfyUI。

必须支持两种模式：

## Local Direct

整个项目下载到本机运行：

```text
Node Server → localhost:8188 → ComfyUI
```

## Remote Worker

AI Studio / Cloud Run：

```text
Cloud App
↓
Worker Gateway
↓ outbound authenticated session
Local Companion Worker
↓
ComfyUI localhost:8188
```

这应成为正式架构，而不是尝试从 Cloud 直接访问用户 localhost。

---

# 8. 新开发路线

## Gate P0 — FOUNDATION-STABILIZATION

目标：先消除当前技术债，建立可靠开发底座。

必须完成：

1. Client 不再 import server；
2. App.tsx 拆分；
3. Canonical ComponentType；
4. GeometrySource enum 统一；
5. SoftSurface 字段统一；
6. Diagnostics 真值修复；
7. G3 Export 输出高级几何真实数据；
8. 测试必须覆盖真实外部 Workbook；
9. 生成 CURRENT_SCHEMA_VERSION / migration；
10. build + regression。

**这一 Gate 做完前，不建议继续增加新的几何字段。**

---

## Gate G4-0 — LOCAL-WORKER-CONTRACT

目标：先定义本地计算服务协议，不急着绑死 ComfyUI。

新增：

```text
WorkerCapabilities
WorkerJob
GeometryAsset
ArtifactManifest
ProviderExecutionRecord
```

定义 API / Job state machine。

先 Mock Worker，不调用 GPU。

---

## Gate G4-1 — COMFYUI-LOCAL-DIRECT

目标：在“整个项目本地运行”模式验证：

```text
Part Image
→ ComfyUI Workflow
→ Hunyuan3D
→ GLB
→ Artifact Registry
→ Three.js Preview
```

---

## Gate G4-2 — REMOTE-LOCAL-WORKER-BRIDGE

目标：AI Studio/Cloud App 调用户本机 Worker。

必须采用 outbound worker connection，避免公开 ComfyUI 端口。

---

## Gate G4-3 — AI MESH INSPECTION

AI Mesh 进入：

```text
mesh bounds
orientation
principal axes
silhouette projections
cross-sections
```

生成 Reference Geometry Features，但不作为 Production Truth。

---

## Gate G5-0 — PROFILE-GUIDED RECONSTRUCTION SOLVER

目标：把三视图 profile 变成 3D surface 主约束。

先解决扶手：

```text
front profile
+ side profile
+ top profile
+ sections
→ guided loft surface
```

不再用圆截面作为主形状。

---

## Gate G5-1 — SOFT SURFACE V2

Seat / Back / Pillow：

- controlled crown；
- seam constraints；
- edge falloff；
- thickness gradient；
- local deformation cage。

---

## Gate G6 — ENGINEERING GEOMETRY KERNEL

开始引入真正工程级 kernel service：

建议后端独立 Python/C++ Service：

```text
OCCT / CadQuery / FreeCAD headless
```

Web/TypeScript 继续负责 orchestration 和 UI。

输出：

```text
STEP / IGES / B-Rep validation
```

Three.js 继续作为展示 adapter。

---

## Gate G7 — INTERNAL STRUCTURE / MANUFACTURING

木架 / 金属架 / 弹簧 / 海绵 / 面料：

```text
Part Graph
Joinery
Fasteners
BOM
Exploded Assembly
Manufacturing Features
```

---

# 9. 每个 Gate 的交付格式

以后每次都必须产出至少一个：

```text
A. AI Studio Gate Development Document.md
或
B. 可直接覆盖的代码 Patch
```

推荐同时交付：

- Gate 文档；
- Changed Files；
- Migration Notes；
- Test Script；
- Rollback Notes。

---

# 10. 下一步推荐

不要马上做 Hunyuan3D API 接入主干。

先做：

```text
P0 FOUNDATION-STABILIZATION
```

因为现在继续新增 Mesh Provider，会把现存：

- client/server 交叉；
- schema drift；
- source diagnostics；
- exporter 不完整；

一起带进新系统。

第一性原理上，这会增加系统熵，而不是增加工程能力。
