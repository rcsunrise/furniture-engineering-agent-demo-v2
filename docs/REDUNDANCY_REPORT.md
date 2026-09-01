# Redundancy & Deprecation Audit Report (G4-SYSTEM-AUDIT-01)

## System Redundancy & Consolidation Audit

### 1. Worker Job Contracts
- **Modules Inspected:** `src/shared/worker.ts` vs `src/shared/workerRuntime.ts` vs `local-worker/src/types.ts`
- **Audit Findings:** Duplicate definitions of `WorkerJob` and `WorkerJobResult` existed across files.
- **Action Plan (CONSOLIDATED):** `src/shared/workerRuntime.ts` is established as the single canonical schema source. `local-worker/src/types.ts` re-exports from `src/shared/workerRuntime.ts`.

### 2. Geometry Shape Factories
- **Modules Inspected:** `src/client/utils/threeShapeFactory.ts` vs `src/client/utils/geometryBuilders.ts`
- **Audit Findings:** `threeShapeFactory.ts` handles 3D WebGL shape creation dispatching, while `geometryBuilders.ts` contains raw procedural mesh generators.
- **Action Plan (KEEP & BOUND):** Preserved distinction. `threeShapeFactory.ts` acts as the single entry point dispatcher; `geometryBuilders.ts` acts as procedural math helper functions.

### 3. Coordinate Conversion Utilities
- **Modules Inspected:** `src/client/utils/threeAdapter.ts` vs inline conversions in `AssemblyView.tsx`
- **Audit Findings:** Some components used inline `px * 0.001` math.
- **Action Plan (CONSOLIDATED):** Unified all coordinate, size, and rotation transformations into `threeAdapter.ts` using canonical functions `fesToThreePosition`, `fesToThreeSize`, `fesToThreeRotation`, and `fitCameraToObject`.

### 4. Status Naming Conventions
- **Modules Inspected:** `PipelineStageStatus`, `EngineeringSessionStatus`
- **Audit Findings:** Inconsistent status strings (`"PASS"`, `"passed"`, `"COMPLETE"`, `"ready"`, `"FAILED"`, `"blocked"`).
- **Action Plan (STANDARDIZED):** Consolidated status strings to standard lowercase enums (`not_started`, `ready`, `running`, `passed`, `warning`, `blocked`, `failed`).
