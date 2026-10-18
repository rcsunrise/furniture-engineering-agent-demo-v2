# G4-6 Implementation Report — FES ↔ Imported Mesh Engineering Validation

Date: 2026-09-07

## Scope completed in this patch

This patch starts the G4-6 engineering-closure phase without changing the existing viewer/editor architecture.

### G4-6A — Component binding foundation
- Existing `AssignEngineeringComponentCommand` retained as the undoable source of truth.
- Added deterministic selected-object auto-match using, in priority order:
  1. `canonicalComponentId`
  2. `partId`
  3. Object name
- Matching normalizes IDs/names (case, spaces, `_`, punctuation) before exact comparison.
- AI/semantic matching is deliberately NOT used at this stage.

### G4-6B — Component dimension validation
- Added shared deterministic validation contract in `src/shared/meshEngineeringValidation.ts`.
- Added Three.js measurement adapter in `src/client/utils/3d/engineeringMeshValidator.ts`.
- Bound object is measured with world-space `THREE.Box3`.
- Compared against canonical FES/Assembly `component.size {x,y,z}`.
- Added default tolerance policy:
  - WARNING: > 3% or > 15 mm
  - FAIL: > 8% or > 40 mm
- Produces per-axis target, actual, delta, percent, status and aggregate score.

### G4-6C — Position / rotation validation foundation
- Validator also calculates world position and world rotation residuals.
- Position tolerance:
  - WARNING: > 2% or > 10 mm
  - FAIL: > 5% or > 30 mm
- Rotation tolerance:
  - WARNING: > 2 degrees
  - FAIL: > 5 degrees
- Position percentage is not used near zero origin values; absolute mm tolerance governs those cases.
- UI currently warns that position/rotation only become production-grade after canonical origin/axis policy is fully locked.

### Engineering sidebar UI
- Fixed an existing schema mismatch: UI referenced `boundComponent.dimensions.*`, while the actual Assembly/FES contract uses `boundComponent.size.{x,y,z}`.
- Added `自动匹配` button for deterministic binding.
- Added G4-6 validation panel with PASS/WARNING/FAIL, score, and X/Y/Z residual table.

## Important audit findings

1. **The project already has a strong Three.js Editor architecture.**
   - `Engineering3DEditor`
   - Signals
   - History/commands
   - Scene/Object/Geometry/Material/Engineering tabs
   - Transform/Orbit separation
   - Split/explode infrastructure
   This should be extended, not replaced.

2. **FES ↔ Mesh binding existed only as metadata assignment.**
   There was no deterministic geometry residual report in the Editor sidebar.

3. **EngineeringTab had a real data-contract bug.**
   It displayed `boundComponent.dimensions.width/depth/height`, but `AssemblyComponentSchema` exposes `size.x/y/z`.

4. **Coordinate/unit truth remains the next major risk.**
   Current code contains both:
   - FES canonical axes: X width / Y depth / Z height
   - Three.js Y-up conversion utilities (`threeAdapter.ts`)
   - Imported asset FES Z-up wrapper (`CoordinateSystemAdapter`)
   A single canonical editor-world policy must be locked before position/rotation scores are treated as production truth.

5. **Imported asset unit scale is user-controlled but not yet persisted strongly enough into validation provenance.**
   The next patch should persist source unit / source-up / conversion matrix / mm scale on the scene object and saved scene instance.

## Test status

Pure deterministic G4-6 validation module was compiled with TypeScript and executed with Node.

- PASS case: `SEAT-002` close to target -> PASS, score 92.4
- FAIL case: `ARM-R` with large depth error -> FAIL
- ID normalization test -> PASS

Full project build could not be executed in this sandbox because the uploaded ZIP did not contain `node_modules`, and dependency installation is not available in the current runtime. No claim of full application build PASS is made here.

## Recommended next Gate

### G4-6D — Canonical Editor Coordinate + Unit Contract
Before expanding validation overlays, lock:
- Editor world unit = mm
- Canonical engineering axes = X width / Y depth / Z height OR explicit render adapter boundary
- Source GLB unit and up-axis metadata
- One immutable source transform + one engineering adapter transform
- Comparable engineering origin definition (`bottom_center` recommended per component unless overridden)

Then proceed to:
- G4-6E scene-wide auto binding
- G4-6F validation overlay / component colors
- G4-6G report export
