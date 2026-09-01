# 家具工程 Agent 1.0 Demo 开发文档

## 一、Demo 定义
只验证一条工程闭环：
Excel -> FES -> Validator -> CAD-IR -> ThorVG/Vector Renderer -> Assembly -> Three.js -> Exploded View -> Agent Plan。

不要在 1.0 做：
- 曲面生产建模
- 图片反推生产尺寸
- DXF生产出图
- 向量库
- 自动安装第三方 Skill
- 多 Agent 自主循环

## 二、为什么适合 Google AI Studio
使用 Build Mode 的 full-stack server runtime。
前端 React/TS，服务端 Node/Express。
VectorEngine/RouterHub secrets 放服务端。
给 AI Studio Agent 固定读取 `PROJECT_STANDARDS.md`，避免 App.tsx 单文件膨胀。

## 三、Gate 顺序
G1-0 工程骨架 + /api/health
G1-1 Excel -> FES
G1-2 FES Validator
G1-3 CAD-IR front
G1-4 ThorVG renderer
G1-5 Three.js assembly
G1-6 exploded slider
G1-7 VectorEngine/RouterHub dual provider
G1-8 Agent planner
G1-9 acceptance

一次只让 AI Studio 开发一个 Gate。Gate 未验收不得进入下一 Gate。

## 四、FES 1.0
所有尺寸统一 mm。
X=左右，Y=前后，Z=上下。
产品中心 X/Y=0。

核心：
- overall
- components[]
- component.size
- component.position
- component.explode
- source
- warnings

AI 不拥有 FES truth。Excel/数据库/人工确认才拥有事实值。

## 五、CAD
LLM 不输出 SVG/ThorVG 命令。
deterministic backend:
FES -> CAD-IR。

CAD-IR 才由 ThorVG Adapter 渲染。
这样以后可增加：
CAD-IR -> ThorVG
CAD-IR -> SVG
CAD-IR -> DXF
CAD-IR -> PDF

## 六、ThorVG 1.0
目标包：@thorvg/webcanvas。
优先 WebGL renderer，后续再评估 WebGPU。
AI Studio 环境若 WASM 资源路径未完成，先用 SVG fallback 验证 CAD-IR。
严禁因为 ThorVG 暂时未加载而阻塞 FES/CAD/3D 开发。

## 七、Three.js
1.0 只使用 BoxGeometry 生成参数化部件。
component.size -> geometry
component.position -> mesh.position
component.explode * explodeRatio -> exploded position

1.1 再加：
OrbitControls
ViewHelper
selection
hide/isolate
GLTFExporter
materials

## 八、Agent 1.0
Agent 只做 Planner。
输入：用户 request + FES。
输出：
- executionPlan
- missingEngineeringData
- warnings
- recommendedTools

禁止：
- 猜尺寸
- 直接改 FES
- 直接操作 DB
- 直接调用 provider from frontend

## 九、双路由
前端 -> `/api/engineering/agent/plan`
-> UnifiedReasoningRequest
-> Provider Adapter
-> VectorEngine 或 RouterHub

所有 provider path/model/header 差异只能存在 adapter 层。

## 十、Skill
1.0 只有 UI 占位。
1.1 Skill Engine：
SKILL.md + manifest + permissions + registered tools。
Skill 绝不能拿到 Supabase key、RouterHub key、VectorEngine key。

## 十一、验收
1. 上传 Excel。
2. FES JSON 正确。
3. Validator 返回 PASS/Issues。
4. 正视图显示。
5. Five-part Three.js model 显示。
6. explode 0%-100% 工作。
7. Agent Planner 可切换 RouterHub / VectorEngine。
8. provider HTML/非JSON返回时显示诊断错误。
9. API key 只存在 server。
10. npm build 通过。
