# Proxy & Fallback Usage Audit Report (G4-SYSTEM-AUDIT-01)

## Proxy Hierarchy & Classification

To expose the real state of the engineering system, proxy and fallback geometries are categorized into 4 strict levels:

| Level | Classification | Description | Production Gate Impact |
|---|---|---|---|
| **LEVEL 0** | **No Fallback** | Verified B-Rep / CAD Profile with 100% parametric accuracy. | **PASS (Eligible for Production)** |
| **LEVEL 1** | **Visual Fallback** | AI Reference Mesh (GLB) bound to component for shape guidance. | **FAIL (ENGINEERING_READY only)** |
| **LEVEL 2** | **Geometry Approximation** | Procedural Loft Shell or Soft Surface approximation. | **FAIL (ENGINEERING_READY only)** |
| **LEVEL 3** | **Missing Data Proxy** | Box Proxy (cuboid dimensions from overall size). | **FAIL (DISPLAY_READY only)** |

---

## Detailed Codebase Proxy Inventory

### 1. `ThreeShapeFactory.ts` (`src/client/utils/threeShapeFactory.ts`)
- **Proxy Type:** Level 3 Box Proxy & Level 2 Soft Surface Proxy fallback.
- **Trigger Condition:** When `geometryMode` is `"box"`, or when `mesh_reference` / `loft_shell` / `soft_surface` fails to load geometry.
- **Diagnostic Flag:** Sets `geometry.userData.usedFallback = true` and `geometry.userData.modeResolved = "box" | "soft_surface" | "loft_shell"`.
- **Production Eligibility Impact:** Any component using this fallback sets `productionEligible = false`.

### 2. `FesDraftBuilder.ts` (`src/server/inference/fesDraftBuilder.ts`)
- **Proxy Type:** Level 2 Draft Estimation.
- **Trigger Condition:** Built from VLM image observations.
- **Data Provenance:** Marked with `productionTruth = false`.
- **Production Eligibility Impact:** Blocks production gate until verified by human engineer or CAD specification.

### 3. `AssemblyView.tsx` (`src/client/components/AssemblyView.tsx`)
- **Proxy Type:** Viewport Renderer Diagnostics Overlay.
- **Visibility:** Exposes `fallbackCount` and `failedComponentCount` in real-time viewport diagnostic UI overlay.
- **Production Gate Display:** Displays `DISPLAY_READY` / `ENGINEERING_READY` / `PRODUCTION_READY` status badge based on `isProductionEligible()`.
