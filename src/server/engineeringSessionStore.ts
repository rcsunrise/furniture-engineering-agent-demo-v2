import {
  EngineeringSession,
  EngineeringSessionSchema,
  ComponentArtifactBinding,
  resolveComponentBinding,
  validateComponentIdentityConsistency,
} from "../shared/engineeringSession.js";
import type { FESDocument } from "../shared/fes.js";
import { alignmentSessionStore } from "./alignment/alignmentSessionStore.js";
import { createAlignmentSession } from "../shared/alignmentSession.js";

export class EngineeringSessionStore {
  private sessions = new Map<string, EngineeringSession>();
  private activeSessionIdByWorkspace = new Map<string, string>();

  public createOrGetSession(
    sessionId?: string,
    workspaceId: string = "default-workspace",
    sku: string = "FURNITURE-SKU-001"
  ): EngineeringSession {
    if (sessionId && this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    // Check if active workspace session exists
    if (!sessionId) {
      const activeId = this.activeSessionIdByWorkspace.get(workspaceId);
      if (activeId && this.sessions.has(activeId)) {
        return this.sessions.get(activeId)!;
      }
    }

    const newId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const session: EngineeringSession = {
      id: newId,
      workspaceId,
      sku,
      status: "created",
      aiMeshArtifactIds: [],
      componentBindings: [],
      alignmentSessions: [],
      geometryCandidates: [],
      unresolvedArtifacts: [],
      diagnostics: {
        image: "not_started",
        localWorker: "ready",
        comfyui: "ready",
        hunyuan3d: "ready",
        glb: "not_started",
        session: "ready",
        fes: "not_started",
        alignment: "not_started",
        geometry: "not_started",
        assembly: "not_started",
        production: "blocked",
        issues: [],
      },
      productionTruth: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validated = EngineeringSessionSchema.parse(session);
    this.sessions.set(newId, validated);
    this.activeSessionIdByWorkspace.set(workspaceId, newId);
    return validated;
  }

  public getSession(sessionId: string): EngineeringSession | undefined {
    let session = this.sessions.get(sessionId);
    if (!session && (sessionId === "session-r1-arm-l-out" || sessionId === "default" || sessionId === "active")) {
      session = this.seedDefaultR1Session();
    }
    return session;
  }

  public getActiveSession(workspaceId: string = "default-workspace"): EngineeringSession {
    const activeId = this.activeSessionIdByWorkspace.get(workspaceId);
    if (activeId && this.sessions.has(activeId)) {
      return this.sessions.get(activeId)!;
    }
    return this.seedDefaultR1Session();
  }

  public seedDefaultR1Session(): EngineeringSession {
    const sessionId = "session-r1-arm-l-out";
    const workspaceId = "default-workspace";
    const sku = "SOFA-ARM-R1-001";
    const artifactId = "art-glb-hunyuan3d-arm-l-out";

    const fesDoc: FESDocument = {
      schemaVersion: "1.0",
      sku,
      units: "mm",
      productType: "Sofa",
      overall: {
        width: 2800,
        depth: 950,
        height: 850,
      },
      shapeProfiles: [],
      cadProfiles: [],
      loftSections: [],
      softSurfaceParams: [],
      topology2D: [],
      source: { kind: "manual" },
      warnings: [],
      components: [
        {
          id: "ARM-L-OUT",
          name: "Left Outer Sculpted Arm",
          type: "armrest",
          geometryMode: "box",
          material: "Fabric / High-Resilience Foam / Internal Frame",
          size: {
            x: 250,
            y: 900,
            z: 600,
          },
          position: {
            x: -1275,
            y: 0,
            z: 300,
          },
          explode: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          shape: { proxy: "box" },
        },
        {
          id: "SEAT-BASE",
          name: "Seat Base Platform",
          type: "seat",
          geometryMode: "box",
          material: "Solid Wood Frame",
          size: {
            x: 2300,
            y: 850,
            z: 200,
          },
          position: {
            x: 0,
            y: 0,
            z: 100,
          },
          explode: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          shape: { proxy: "box" },
        },
      ],
    };

    const session: EngineeringSession = {
      id: sessionId,
      workspaceId,
      sku,
      status: "alignment_ready",
      fesDocumentId: `fes_${sku}`,
      fesDocument: fesDoc,
      activeComponentId: "ARM-L-OUT",
      aiMeshArtifactIds: [artifactId],
      componentBindings: [
        {
          componentId: "ARM-L-OUT",
          canonicalComponentId: "ARM-L-OUT",
          partId: "part-sofa-arm",
          artifactId: artifactId,
          bindingMethod: "EXPLICIT_CANONICAL",
          bindingType: "ai_reference_mesh",
          productionTruth: false,
          confidence: 0.96,
          boundAt: new Date().toISOString(),
        },
      ],
      alignmentSessions: [],
      geometryCandidates: [],
      unresolvedArtifacts: [],
      diagnostics: {
        image: "ready",
        localWorker: "ready",
        comfyui: "ready",
        hunyuan3d: "ready",
        glb: "ready",
        session: "ready",
        fes: "ready",
        alignment: "ready",
        geometry: "ready",
        assembly: "not_started",
        production: "blocked",
        issues: [],
      },
      productionTruth: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validated = EngineeringSessionSchema.parse(session);
    this.sessions.set(sessionId, validated);
    this.activeSessionIdByWorkspace.set(workspaceId, sessionId);
    return validated;
  }

  public saveSession(session: EngineeringSession): EngineeringSession {
    session.updatedAt = new Date().toISOString();
    const validated = EngineeringSessionSchema.parse(session);
    this.sessions.set(validated.id, validated);
    if (validated.workspaceId) {
      this.activeSessionIdByWorkspace.set(validated.workspaceId, validated.id);
    }
    return validated;
  }

  public attachFesToSession(
    sessionId: string,
    fesDocument: FESDocument,
    workspaceId: string = "default-workspace"
  ): { session: EngineeringSession; resolvedBindings: ComponentArtifactBinding[] } {
    let session = this.sessions.get(sessionId) || this.createOrGetSession(sessionId, workspaceId, fesDocument.sku);

    session.fesDocumentId = `${fesDocument.sku}_FES`;
    session.fesDocument = fesDocument;
    session.sku = fesDocument.sku;
    session.diagnostics.fes = "ready";

    if (session.status === "created" || session.status === "image_ready" || session.status === "mesh_ready") {
      session.status = "fes_ready";
    }

    const resolvedBindings: ComponentArtifactBinding[] = [];
    const remainingUnresolved: { artifactId: string; partId: string }[] = [];

    // Map artifact IDs to part IDs
    const artifactPartMap = new Map<string, string>();
    for (const item of session.unresolvedArtifacts || []) {
      artifactPartMap.set(item.artifactId, item.partId);
    }
    for (const b of session.componentBindings || []) {
      artifactPartMap.set(b.artifactId, b.partId);
    }

    for (const artifactId of session.aiMeshArtifactIds) {
      const partId = artifactPartMap.get(artifactId) || artifactId;

      const res = resolveComponentBinding(partId, artifactId, fesDocument);
      if (res.status === "OK" && res.binding) {
        // Remove old binding for same componentId if any
        session.componentBindings = session.componentBindings.filter((b) => b.componentId !== res.binding!.componentId);
        session.componentBindings.push(res.binding);
        resolvedBindings.push(res.binding);

        // Auto-create alignment session
        this.ensureAlignmentSession(session, res.binding, fesDocument);
      } else {
        remainingUnresolved.push({ artifactId, partId });
      }
    }

    session.unresolvedArtifacts = remainingUnresolved;

    if (session.alignmentSessions.length > 0) {
      session.status = "alignment_ready";
      session.diagnostics.alignment = "ready";
    }

    this.saveSession(session);
    return { session, resolvedBindings };
  }

  public attachMeshArtifactToSession(params: {
    workspaceId?: string;
    sessionId?: string;
    sku?: string;
    partId: string;
    artifactId: string;
    fesDocument?: FESDocument | null;
  }): {
    session: EngineeringSession;
    binding: ComponentArtifactBinding | null;
    alignmentSessionId?: string;
    status: "OK" | "UNRESOLVED_BINDING";
    reason?: string;
  } {
    const workspaceId = params.workspaceId || "default-workspace";
    const session = params.sessionId && this.sessions.has(params.sessionId)
      ? this.sessions.get(params.sessionId)!
      : this.getActiveSession(workspaceId);

    if (params.sku) {
      session.sku = params.sku;
    }

    if (!session.aiMeshArtifactIds.includes(params.artifactId)) {
      session.aiMeshArtifactIds.push(params.artifactId);
    }
    session.diagnostics.glb = "ready";

    const activeFes = params.fesDocument || session.fesDocument;

    if (!activeFes) {
      session.status = "mesh_ready";
      // Track in unresolvedArtifacts
      if (!session.unresolvedArtifacts.some((item) => item.artifactId === params.artifactId)) {
        session.unresolvedArtifacts.push({ artifactId: params.artifactId, partId: params.partId });
      }
      this.saveSession(session);
      return {
        session,
        binding: null,
        status: "UNRESOLVED_BINDING",
        reason: "No FES document loaded in session for component binding resolution.",
      };
    }

    // Resolve component binding
    const result = resolveComponentBinding(params.partId, params.artifactId, activeFes);

    if (result.status === "UNRESOLVED_BINDING" || !result.binding) {
      session.status = "mesh_ready";
      if (!session.unresolvedArtifacts.some((item) => item.artifactId === params.artifactId)) {
        session.unresolvedArtifacts.push({ artifactId: params.artifactId, partId: params.partId });
      }
      this.saveSession(session);
      return {
        session,
        binding: null,
        status: "UNRESOLVED_BINDING",
        reason: result.reason || `Ambiguous or missing match for partId '${params.partId}'`,
      };
    }

    // Success: bind component
    const binding = result.binding;
    session.componentBindings = session.componentBindings.filter((b) => b.componentId !== binding.componentId);
    session.componentBindings.push(binding);
    session.unresolvedArtifacts = session.unresolvedArtifacts.filter((item) => item.artifactId !== params.artifactId);

    // Auto-create Alignment Session
    const alignSessionId = this.ensureAlignmentSession(session, binding, activeFes);

    // Validate identity consistency
    const identityVal = validateComponentIdentityConsistency({
      canonicalComponentId: binding.canonicalComponentId || binding.componentId,
      partId: binding.partId,
      bindingComponentId: binding.componentId,
      fesComponentId: binding.canonicalComponentId || binding.componentId,
    });
    if (!identityVal.consistent) {
      session.diagnostics.issues.push(...identityVal.issues);
    }

    session.status = "alignment_ready";
    session.diagnostics.alignment = "ready";
    this.saveSession(session);

    return {
      session,
      binding,
      alignmentSessionId: alignSessionId,
      status: "OK",
    };
  }

  private ensureAlignmentSession(
    session: EngineeringSession,
    binding: ComponentArtifactBinding,
    fesDocument: FESDocument
  ): string {
    // Check if alignment session already exists for this artifact & component
    const existingSessions = alignmentSessionStore.listSessions();
    const existing = existingSessions.find(
      (s) => s.artifactId === binding.artifactId && s.componentId === binding.componentId
    );

    if (existing) {
      if (!session.alignmentSessions.includes(existing.sessionId)) {
        session.alignmentSessions.push(existing.sessionId);
      }
      return existing.sessionId;
    }

    // Create new alignment session
    const alignSession = createAlignmentSession({
      artifactId: binding.artifactId,
      partId: binding.partId,
      componentId: binding.componentId,
      canonicalComponentId: binding.canonicalComponentId || binding.componentId,
      bindingMethod: binding.bindingMethod,
      sku: fesDocument.sku || session.sku,
      engineeringDocumentId: session.fesDocumentId || `fes_${fesDocument.sku}`,
      workspaceId: session.workspaceId,
    });

    const saved = alignmentSessionStore.saveSession(alignSession);
    if (!session.alignmentSessions.includes(saved.sessionId)) {
      session.alignmentSessions.push(saved.sessionId);
    }
    return saved.sessionId;
  }

  public addGeometryCandidate(sessionId: string, candidate: any): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.geometryCandidates = session.geometryCandidates || [];
      const idx = session.geometryCandidates.findIndex((c: any) => c.id === candidate.id);
      if (idx >= 0) {
        session.geometryCandidates[idx] = candidate;
      } else {
        session.geometryCandidates.push(candidate);
      }
      this.saveSession(session);
    }
  }

  public getGeometryCandidate(sessionId: string, candidateId: string): any | undefined {
    const session = this.getSession(sessionId);
    if (!session || !session.geometryCandidates) return undefined;
    return session.geometryCandidates.find((c: any) => c.id === candidateId);
  }

  public clear(): void {
    this.sessions.clear();
    this.activeSessionIdByWorkspace.clear();
  }
}

export const globalEngineeringSessionStore = new EngineeringSessionStore();
