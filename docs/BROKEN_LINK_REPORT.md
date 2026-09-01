# Broken Link & System Gap Report (G4-SYSTEM-AUDIT-01)

## Identified System Disconnections & Gaps

### 1. `ARTIFACT_TO_ENGINEERING_SESSION` (PARTIAL -> FIXED IN G4-SYSTEM-AUDIT-01)
- **Problem:** Historically, when G4-3 generated a local GLB mesh artifact via ComfyUI, the artifact completed with `art-glb-xxxx` but was not automatically bound to a structured `EngineeringSession` component.
- **Audit Findings:** The link between `EngineeringArtifact` and `EngineeringSession` was stored as loose global state.
- **Fix / Resolution:** Created `ComponentArtifactBinding` schema and `resolveComponentBinding()` in `src/shared/engineeringSession.ts`. Endpoint `POST /api/engineering/sessions/:sessionId/bind-artifact` now resolves component mapping strictly and returns `UNRESOLVED_BINDING` if part mapping is ambiguous.

### 2. `EXCEL_VS_AI_MESH_DUAL_PATH` (PARTIAL)
- **Problem:** Excel parsing (`/api/excel/parse`) and AI Reference Mesh generation ran on two parallel, non-unified pipelines.
- **Audit Findings:** Excel produced an `FESDocument` directly, whereas AI Mesh produced a standalone GLB artifact.
- **Fix / Resolution:** Unified both inputs under `EngineeringSession`. An `EngineeringSession` now tracks `fesDocumentId`, `referenceImageArtifactId`, `aiMeshArtifactIds`, and `componentBindings` within a single unified context.

### 3. `UNRESOLVED_COMPONENT_MAPPING` (BROKEN -> STRICT ENFORCEMENT)
- **Problem:** If an AI mesh was generated for a part name like `"left armrest"`, but the FES component ID was `"ARM-L-OUT"`, previous code risked silent assignment or unmapped rendering.
- **Fix / Resolution:** `resolveComponentBinding` enforces fuzzy name resolution with strict single-match verification. If multiple components match or zero match, it returns status `UNRESOLVED_BINDING` and refuses to assign false bindings.

### 4. `SILENT_PRODUCER_TRUTH_PROMOTION` (REMOVED)
- **Problem:** AI confidence values (e.g. `confidence: 0.95`) previously risked being interpreted by downstream UI components as verified engineering truth (`productionTruth = true`).
- **Fix / Resolution:** Created `sanitizeProvenance()` in `src/shared/provenance.ts`. Any `sourceType` of `"ai_generated"`, `"proxy"`, or `"test"` forcibly sets `productionTruth = false` regardless of confidence level.
