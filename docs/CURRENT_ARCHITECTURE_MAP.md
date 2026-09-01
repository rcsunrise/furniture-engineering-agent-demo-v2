# Current Architecture Map (G4-SYSTEM-AUDIT-01)

## High-Level System Architecture

```
                                [ User / Frontend (React + Vite) ]
                                                │
                                    API Requests (HTTP / REST)
                                                ▼
                                [ Express Full-Stack Server ]
                            ┌───────────────────┼───────────────────┐
                            │                   │                   │
                     /api/engineering      /api/worker        /api/alignment
                            │                   │                   │
                            ▼                   ▼                   ▼
                     [ Excel & CAD ]     [ Worker Gateway ]   [ Mesh Alignment ]
                     [ Session Store ]          │
                                                │ Local Outbound Connection
                                                ▼
                                    [ Local Worker Process ]
                                                │
                                                ▼
                                    [ ComfyUI / Hunyuan3D ]
```

---

## Canonical Layer Boundaries

### Layer 1: Data Contracts (`src/shared/`)
- Pure TypeScript models and Zod schemas.
- Single source of truth for all cross-boundary types (`fes.ts`, `assembly.ts`, `engineeringSession.ts`, `provenance.ts`, `artifact.ts`, `workerRuntime.ts`).

### Layer 2: Server Services (`src/server/`)
- `excel.ts`: Parses `.xlsx` into canonical `FESDocument`.
- `cad.ts`: Translates `FESDocument` to 2D CAD projection geometries (front, side, top).
- `assembly.ts`: Builds 3D `AssemblyDocument` from `FESDocument`.
- `validate.ts`: Enforces engineering structural rules (bounding box constraints, clearance, material compatibility).
- `routes/engineering.ts`: Hosts session endpoints (`/api/engineering/sessions`), Excel parse endpoints, CAD endpoints, and G3 reference image analysis.
- `routes/workerRuntime.ts`: Manages job queues, heartbeat pinging, and artifact registration for Local Workers.

### Layer 3: Client UI & Viewport (`src/client/`)
- `App.tsx`: Top-level application container and navigation layout.
- `components/AssemblyView.tsx`: 3D WebGL assembly canvas powered by Three.js.
- `components/EngineeringPipelineDiagnosticsView.tsx`: Real-time pipeline diagnostics and production gate status overlay.
- `utils/threeAdapter.ts`: Coordinate converter (`fesToThreePosition`, `fesToThreeSize`, `fesToThreeRotation`, `fitCameraToObject`).
- `utils/threeShapeFactory.ts`: Geometry dispatcher (`mesh_reference` → `loft_shell` → `soft_surface` → `box` proxy fallback).

### Layer 4: Local Worker Bridge (`local-worker/`)
- Outbound polling agent connecting cloud session backend to local ComfyUI/Hunyuan3D GPU generation nodes.
