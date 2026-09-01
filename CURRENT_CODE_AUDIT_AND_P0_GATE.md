# Current Code Audit & P0 Gate
## Furniture Engineering Agent — 2026-08-27

> 审计对象：用户本轮上传项目 ZIP。

---

# 1. 审计结论

当前代码并不是需要推倒重来。

核心架构方向是对的，但项目已经从 Demo 快速演进到 G3-C 后，出现明显的“协议漂移”和“层边界松动”。

因此下一步最佳决策：

> **停止继续堆新能力 1 个 Gate，先做 P0 Foundation Stabilization。**

完成后再进入 Local Worker / ComfyUI。

---

# 2. 保留模块

以下模块应继续保留并加强，不建议推翻：

- `src/shared/fes.ts`
- `src/server/validate.ts`
- `src/server/cad/*`
- `src/shared/cad.ts`
- `src/server/assembly.ts`
- `src/shared/assembly.ts`
- `src/server/ai/*`
- `src/server/inference/*`
- `src/client/utils/geometryBuilders/*`
- `src/client/components/CadCanvas.tsx`
- `src/client/components/AssemblyView.tsx`

---

# 3. P0 必修 Bug / 技术债

## 3.1 Client import server

位置：`src/client/App.tsx`

当前直接 import：

```ts
../server/excel
../server/validate
../server/cad
../server/assembly
```

处理：

- 主路径必须 API-only；
- dev fallback 如必须保留，迁移纯函数到 shared/core；
- 禁止 browser bundle 引入 server implementation。

验收：

```text
grep src/client 不再出现 ../server/
```

---

## 3.2 App.tsx 拆分

当前约 772 行。

目标：

```text
App.tsx < 300 行
```

拆成：

```text
client/features/data/useEngineeringUpload.ts
client/features/cad/useCadDocument.ts
client/features/assembly/useAssemblyDocument.ts
client/features/agent/useAgentPlanner.ts
client/layout/EngineeringWorkspace.tsx
```

---

## 3.3 Component Type 统一

当前：

```text
ComponentTypeEnum 存在
ComponentSchema.type = z.string()
```

修复：

```text
Raw Excel type
→ normalizeComponentType
→ ComponentTypeEnum
→ Runtime FES
```

对于未知类型：

```text
other + originalRawType
```

不要将任意未知字符串进入 Geometry Builder。

---

## 3.4 SoftSurface Schema Drift

必须统一：

```text
softGroup
surfaceMode
gridU/gridV/subdivLevel
crownX/crownY
frontDrop
sideRoundness
cornerFalloff
edgeSoftness
seamPull
supportBias
normalSmooth
```

删除/迁移旧字段：

```text
crownBulgeMm
frontEdgeDroopMm
cornerFalloffMm
seamPullDepthMm
```

---

## 3.5 GeometrySource 统一

新增：

```text
src/shared/geometry.ts
```

统一 enum：

```text
workbook_profile
workbook_loft
workbook_soft_surface
procedural_default
built_in_registry
box_geometry
proxy_fallback
ai_reference_mesh
```

全局禁止 uppercase 另一套字符串。

---

## 3.6 Diagnostics 真值

必须按 component group 精确匹配：

```text
loftGroup matched → workbook_loft
softGroup matched → workbook_soft_surface
否则 procedural_default / proxy_fallback
```

不能只看 geometryMode。

---

## 3.7 Assembly Geometry Dataset

AssemblyDocument V2 应加入：

```ts
geometry: {
  cadProfiles,
  shapeProfiles,
  loftSections,
  softSurfaceParams,
  topology2D
}
```

为真正 Profile-Guided 3D 做准备。

---

## 3.8 Excel Draft Export

禁止继续输出：

```text
PRESERVED_FOR_...
```

必须真实导出：

```text
Profiles
Loft_Sections
SoftSurface_Params
Topology_2D
Assembly
```

且生成后必须能被自身 parser 回读，并得到等价 Runtime FES。

这叫 round-trip test。

---

# 4. 必须新增的测试

## Test A — Round Trip

```text
G3 Draft
→ Export XLSX
→ Parse XLSX
→ FES
```

比较：

- component count；
- dimensions；
- geometry modes；
- profile IDs；
- loft section count；
- soft group count。

---

## Test B — External Ultimate Workbook

测试必须读取一份真实外部 workbook fixture，而不是系统自己生成后再自己验证。

---

## Test C — Source Truth

分别测试：

```text
旧 G2.3 workbook
→ procedural_default / fallback

Ultimate workbook
→ workbook_profile / workbook_loft / workbook_soft_surface
```

---

## Test D — Client Boundary

静态检查：

```text
src/client/** 不允许 import src/server/**
```

---

# 5. Gate 开发指令

## Current Gate

```text
P0-FOUNDATION-STABILIZATION
```

## Why

当前系统核心问题不是缺功能，而是已有能力之间存在协议不一致。

如果直接继续加入 ComfyUI / Worker / Geometry Kernel，会放大技术债。

## In Scope

- client/server separation；
- App decomposition；
- type/schema normalization；
- geometry source；
- soft params migration；
- Assembly geometry dataset；
- exporter round-trip；
- regression tests。

## Out of Scope

- 不接 ComfyUI；
- 不加新 AI provider；
- 不做 OCCT；
- 不改视觉风格；
- 不继续加新 Excel 几何字段。

## Acceptance

```text
npm build PASS
existing regression PASS
client/server boundary PASS
round-trip workbook PASS
external workbook PASS
GeometrySource truth PASS
SoftSurface migration PASS
schema compatibility PASS
```

---

# 6. Build 审计说明

本次提取 ZIP 内没有 `node_modules`。

审计环境尝试安装依赖时超时，因此本报告以**源码静态审计**为主，不能把本地未执行 build 误报为 PASS。

AI Studio 执行 P0 Gate 时必须在其实际 runtime 中执行完整 build/tests，并贴出结果。
