# Data Lineage Map (G4-SYSTEM-AUDIT-01)

## End-to-End Data Pipeline

```
1. Reference Image Artifact
   └─ Source: User upload or sample reference
   └─ Data Provenance: sourceType="user_input", productionTruth=true (for reference image only)
   └─ Artifact ID: art-img-xxxx

2. Image Observation & AI Inference
   └─ Source: Vision Language Model (VLM / Gemini)
   └─ Data Provenance: sourceType="ai_generated", productionTruth=false
   └─ Output: ObservationDocument & InferenceReport

3. Engineering Session Initialization
   └─ Source: /api/engineering/sessions
   └─ Session ID: session-xxxx
   └─ Status: created -> image_ready

4. FES Geometry Draft Creation
   └─ Source: FesDraftBuilder (from Observation & Constraints)
   └─ Data Provenance: sourceType="derived", productionTruth=false
   └─ Output: FESDocument (Draft)

5. Local AI Mesh Generation (Hunyuan3D / ComfyUI)
   └─ Source: Local Worker Execution
   └─ Data Provenance: sourceType="ai_generated", productionTruth=false
   └─ Output: EngineeringArtifact (GLB mesh file)

6. Component Artifact Binding
   └─ Resolver: resolveComponentBinding(partId, artifactId, fesDocument)
   └─ Output: ComponentArtifactBinding (mapped to componentId)
   └─ Error State: UNRESOLVED_BINDING (if ambiguous or unmapped)

7. Mesh Alignment & Normalization
   └─ Source: MeshNormalizationEngine & AlignmentSession
   └─ Data Provenance: sourceType="derived", productionTruth=false
   └─ Output: Normalized mesh bounds and unit transformation matrix

8. Assembly Viewport Rendering
   └─ Source: ThreeShapeFactory & AssemblyView
   └─ Input: AssemblyDocument + Bound Mesh Artifacts
   └─ Dispatcher: mesh_reference -> loft_shell -> soft_surface -> box proxy fallback

9. Production Eligibility Validation
   └─ Engine: isProductionEligible(session, fesDocument)
   └─ Rules: Any proxy fallback or AI-only mesh sets productionEligible=false
   └─ Level Output: DISPLAY_READY | ENGINEERING_READY | PRODUCTION_READY
```
