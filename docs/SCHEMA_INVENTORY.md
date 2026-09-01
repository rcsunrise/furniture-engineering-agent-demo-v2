# Schema Inventory (G4-SYSTEM-AUDIT-01)

## Overview
Canonical source of truth for all schemas across `src/shared/`, `src/server/`, `src/client/`, and `local-worker/`.
All cross-boundary data contracts must be defined in `src/shared/`.

---

## Shared Schemas Inventory

### 1. `FurnitureEngineeringSchema` & `FESDocument`
- **File:** `src/shared/fes.ts`
- **Owner:** Core Engineering Kernel
- **Producer:** Excel Parser (`parseWorkbook`), AI Inference Builder (`FesDraftBuilder`)
- **Consumer:** CAD Builder (`buildCadView`), Assembly Builder (`buildAssembly`), 3D Renderer (`AssemblyView`), Validation (`validateEngineeringData`)
- **Truth Rule:** `productionTruth = true` only when backed by confirmed Excel / CAD engineering specifications.
- **Current Status:** ACTIVE - Canonical FES format v1.0.

### 2. `AssemblyDocument` & `AssemblyComponent`
- **File:** `src/shared/assembly.ts`
- **Owner:** 3D Visualization & Geometry Layer
- **Producer:** `buildAssembly(fes)`
- **Consumer:** `AssemblyView`, `ThreeShapeFactory`, Exporters (GLTF, OBJ, STL)
- **Truth Rule:** Inherits `productionTruth` per component from FES document.
- **Current Status:** ACTIVE.

### 3. `EngineeringSession` & `ComponentArtifactBinding`
- **File:** `src/shared/engineeringSession.ts`
- **Owner:** Session & Lifecycle Manager
- **Producer:** `/api/engineering/sessions`, Session Controller
- **Consumer:** AI Mesh Alignment, CAD Engine, Pipeline Diagnostics Center
- **Truth Rule:** `productionTruth = false` by default for AI & proxy bindings. High confidence NEVER upgrades to `productionTruth = true`.
- **Current Status:** ACTIVE - Introduced in G4-SYSTEM-AUDIT-01.

### 4. `DataProvenance`
- **File:** `src/shared/provenance.ts`
- **Owner:** Truth & Lineage Engine
- **Producer:** All data pipeline stages (`user_input`, `engineering`, `ai_generated`, `derived`, `proxy`, `test`)
- **Consumer:** Production Eligibility Gate, Audit Reporters
- **Truth Rule:** `productionTruth` is strictly `false` if `sourceType` is `ai_generated`, `proxy`, or `test`.
- **Current Status:** ACTIVE - Introduced in G4-SYSTEM-AUDIT-01.

### 5. `EngineeringArtifact` & `ArtifactType`
- **File:** `src/shared/artifact.ts`
- **Owner:** Asset Delivery & Storage System
- **Producer:** Local Worker (ComfyUI / Hunyuan3D), Image Uploader, Excel Exporter
- **Consumer:** Mesh Normalization Engine, Assembly View, Session Component Binder
- **Truth Rule:** GLB/Mesh artifacts produced by Hunyuan3D have `productionTruth = false`.
- **Current Status:** ACTIVE.

### 6. `WorkerJob` & `WorkerJobResult`
- **File:** `src/shared/workerRuntime.ts` / `src/shared/worker.ts`
- **Owner:** Local Worker Dispatcher & Gateway
- **Producer:** Worker Gateway (`/api/worker/*`), Local Worker App
- **Consumer:** Local Worker Dispatcher, ComfyUI Service
- **Truth Rule:** Operational runtime contracts.
- **Current Status:** ACTIVE - Canonical source consolidated in `src/shared/`.

### 7. `MeshAlignmentSession` & `MeshNormalizationTransform`
- **File:** `src/shared/meshAlignment.ts` & `src/shared/alignmentSession.ts`
- **Owner:** Geometry Alignment & Normalization Core
- **Producer:** Alignment Service (`/api/alignment/*`)
- **Consumer:** `AssemblyView`, Mesh Placement Solver
- **Truth Rule:** Derived coordinate transformation metadata.
- **Current Status:** ACTIVE.

### 8. `GeometryEvaluationReport`
- **File:** `src/shared/geometryEvaluation.ts`
- **Owner:** Geometry Audit Kernel
- **Producer:** `evaluateComponentDiagnostics`
- **Consumer:** Production Gate, Pipeline Diagnostic Center
- **Truth Rule:** Computes geometry fidelity score and checks for box/proxy fallbacks.
- **Current Status:** ACTIVE.

---

## Schema Boundary Constraints & Anti-Drift Policy
1. All client, server, and local-worker modules MUST import contracts strictly from `src/shared/*`.
2. No duplication of `WorkerJob`, `EngineeringArtifact`, or `FESDocument` types in client or server sub-packages.
3. Status enums (`PipelineStageStatus`, `EngineeringSessionStatus`) are standardized to lowercase snake_case.
