import React, { useState, useEffect } from "react";
import { EngineeringHeader, type Tab } from "./components/EngineeringHeader.js";
import { SidebarImport } from "./components/SidebarImport.js";
import { EngineeringSummary } from "./components/EngineeringSummary.js";
import { ReferenceObservationView } from "./components/ReferenceObservationView.js";
import { ImageToMeshTestPanel } from "./components/ImageToMeshTestPanel.js";
import { EngineeringAlignmentPanel } from "./components/EngineeringAlignmentPanel.js";
import { CadCanvas } from "./components/CadCanvas.js";
import { AssemblyView } from "./components/AssemblyView.js";
import { GeometryReconstructionPanel } from "./components/GeometryReconstructionPanel.js";
import { SkillsView } from "./components/skills/SkillsView.js";
import { AiSettingsModal } from "./components/AiSettingsModal.js";
import { useEngineeringData } from "./hooks/useEngineeringData.js";
import { useAgentPlanner } from "./hooks/useAgentPlanner.js";
import { EngineeringAlignmentSession } from "../shared/alignmentSession.js";

export function App() {
  const [tab, setTab] = useState<Tab>("DATA");
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [aiReferenceMeshUrl, setAiReferenceMeshUrl] = useState<string | null>(null);
  const [aiReferenceArtifact, setAiReferenceArtifact] = useState<any | null>(null);
  const [activeAlignmentSession, setActiveAlignmentSession] = useState<EngineeringAlignmentSession | null>(null);
  const [alignmentSessionsList, setAlignmentSessionsList] = useState<EngineeringAlignmentSession[]>([]);
  const [meshJobStatus, setMeshJobStatus] = useState<string | null>(null);

  const eng = useEngineeringData();
  const planner = useAgentPlanner();

  // Auto-sync Alignment Sessions from server
  useEffect(() => {
    async function syncAlignmentSessions() {
      try {
        const res = await fetch("/api/engineering/alignment-sessions");
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data?.sessions;
          if (Array.isArray(list)) {
            setAlignmentSessionsList(list);
            if (list.length > 0) {
              // Auto-select latest or SKU-matching session if none selected or if active session is outdated
              setActiveAlignmentSession((prev) => {
                if (prev) {
                  const refreshed = list.find((s) => s.sessionId === prev.sessionId);
                  if (refreshed) return refreshed;
                }
                const matching = list.find((s) => !eng.fes || s.sku === eng.fes.sku) || list[0];
                return matching || null;
              });
            }
          }
        }
      } catch (err) {
        console.warn("Failed to sync alignment sessions:", err);
      }
    }
    syncAlignmentSessions();
  }, [eng.fes, tab]);

  const handleRunAlignmentFromArtifact = async (artifactId: string, partId: string, componentId: string) => {
    try {
      // 1. Create alignment session
      const createRes = await fetch("/api/engineering/alignment-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactId,
          partId,
          componentId,
          sku: eng.fes?.sku || "",
          engineeringDocumentId: eng.fes ? `fes_${eng.fes.sku}` : "",
        }),
      });

      if (!createRes.ok) {
        throw new Error(`Session creation failed: HTTP ${createRes.status}`);
      }

      const createdSession: EngineeringAlignmentSession = await createRes.json();

      // 2. Run alignment pipeline
      const runRes = await fetch(`/api/engineering/alignment-sessions/${createdSession.sessionId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fes: eng.fes,
          componentId,
        }),
      });

      if (!runRes.ok) {
        throw new Error(`Session run failed: HTTP ${runRes.status}`);
      }

      const updatedSession: EngineeringAlignmentSession = await runRes.json();
      setActiveAlignmentSession(updatedSession);
      setAlignmentSessionsList((prev) => [updatedSession, ...prev.filter((s) => s.sessionId !== updatedSession.sessionId)]);
      setTab("ALIGNMENT");
    } catch (err) {
      console.error("Failed to run alignment from artifact:", err);
    }
  };

  const handleRunAlignmentSession = async (sessionToRun: EngineeringAlignmentSession) => {
    try {
      const runRes = await fetch(`/api/engineering/alignment-sessions/${sessionToRun.sessionId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fes: eng.fes,
          componentId: sessionToRun.componentId,
        }),
      });

      if (!runRes.ok) {
        throw new Error(`Session run failed: HTTP ${runRes.status}`);
      }

      const updatedSession: EngineeringAlignmentSession = await runRes.json();
      setActiveAlignmentSession(updatedSession);
      setAlignmentSessionsList((prev) => [updatedSession, ...prev.filter((s) => s.sessionId !== updatedSession.sessionId)]);
    } catch (err) {
      console.error("Failed to re-run alignment session:", err);
    }
  };

  useEffect(() => {
    if (tab === "3D") {
      // Force viewport and camera re-measure upon returning to 3D tab
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    }
  }, [tab]);

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateRows: "54px 1fr" }}>
      <EngineeringHeader
        activeTab={tab}
        onSelectTab={setTab}
        status={eng.status}
        uploadState={eng.uploadState}
        meshJobStatus={meshJobStatus}
        onOpenAiSettings={() => setIsAiSettingsOpen(true)}
      />

      <AiSettingsModal
        isOpen={isAiSettingsOpen}
        onClose={() => setIsAiSettingsOpen(false)}
      />

      <main
        style={{
          display: tab === "3D" ? "flex" : "grid",
          gridTemplateColumns: tab === "3D" ? undefined : "280px 1fr 280px",
          minHeight: 0,
          flex: 1,
          overflow: "hidden",
        }}
      >
        {tab !== "3D" && (
          <SidebarImport
            uploadState={eng.uploadState}
            fes={eng.fes}
            uploadError={eng.uploadError}
            retryAfterMs={eng.retryAfterMs}
            onRetryUpload={eng.retryLastUpload}
            isDragging={eng.isDragging}
            setIsDragging={eng.setIsDragging}
            fileInputRef={eng.fileInputRef}
            onUploadFile={eng.upload}
            onLoadSample={eng.loadSample}
            selectedComponentId={eng.selectedComponentId}
            onSelectComponent={eng.setSelectedComponentId}
          />
        )}

        <section
          style={{
            minWidth: 0,
            minHeight: 0,
            flex: tab === "3D" ? 1 : undefined,
            overflow: "hidden",
            background: "#121214",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {/* 1. Persistent Reference Observation Viewport Container */}
          <div
            id="persistent-ref-observation-container"
            data-viewport-active={tab === "REF_G3"}
            style={{
              display: tab === "REF_G3" ? "flex" : "none",
              flexDirection: "column",
              height: "100%",
              width: "100%",
              overflow: "hidden",
              minHeight: 0,
              flex: 1,
            }}
          >
            <ReferenceObservationView
              onLoadDraftAsFes={async (loadedFes) => {
                await eng.processFesData(loadedFes, { valid: true, level: "pass", issues: [], summary: { errors: 0, warnings: 0, info: 0 } });
                setTab("CAD");
              }}
            />
          </div>

          {/* 2. Persistent Image-to-Mesh Viewport Container: keeps DOM nodes, ComfyUI job status, uploaded reference images, and background polling alive across tab switches */}
          <div
            id="persistent-image-to-mesh-container"
            data-viewport-active={tab === "LOCAL_AI"}
            style={{
              display: tab === "LOCAL_AI" ? "block" : "none",
              padding: 20,
              height: "100%",
              width: "100%",
              overflowY: "auto",
              minHeight: 0,
              flex: 1,
            }}
          >
            <ImageToMeshTestPanel
              fes={eng.fes}
              isActive={tab === "LOCAL_AI"}
              onLoadGlbTo3d={(glbUrl, art) => {
                setAiReferenceMeshUrl(glbUrl);
                setAiReferenceArtifact(art);
                setTab("3D");
              }}
              onRunAlignment={(artId, pId, compId) => {
                handleRunAlignmentFromArtifact(artId, pId, compId);
              }}
              onJobStatusChange={setMeshJobStatus}
              onLoadSample={eng.loadSample}
            />
          </div>

          {/* 3. Persistent Engineering Alignment Viewport Container */}
          <div
            id="persistent-alignment-container"
            data-viewport-active={tab === "ALIGNMENT"}
            style={{
              display: tab === "ALIGNMENT" ? "flex" : "none",
              flexDirection: "column",
              height: "100%",
              width: "100%",
              overflow: "hidden",
              minHeight: 0,
              flex: 1,
            }}
          >
            <EngineeringAlignmentPanel
              fes={eng.fes}
              activeSession={activeAlignmentSession}
              sessionsList={alignmentSessionsList}
              onSelectSession={(s) => setActiveAlignmentSession(s)}
              onRunAlignment={handleRunAlignmentSession}
              onSelectComponentMap={(compId) => {
                if (activeAlignmentSession) {
                  setActiveAlignmentSession({
                    ...activeAlignmentSession,
                    componentId: compId,
                  });
                }
              }}
              onOpen3DView={() => setTab("3D")}
            />
          </div>

          {/* 4. Persistent Profile Reconstruction Viewport Container */}
          <div
            id="persistent-profile-recon-container"
            data-viewport-active={tab === "PROFILE_RECON"}
            style={{
              display: tab === "PROFILE_RECON" ? "block" : "none",
              padding: 20,
              height: "100%",
              width: "100%",
              overflowY: "auto",
              minHeight: 0,
              flex: 1,
            }}
          >
            <GeometryReconstructionPanel
              sessionId={activeAlignmentSession?.sessionId || "session-r1-arm-l-out"}
              canonicalComponentId={
                activeAlignmentSession?.canonicalComponentId ||
                activeAlignmentSession?.componentId ||
                "ARM-L-OUT"
              }
              context={{
                sessionId: activeAlignmentSession?.sessionId || "session-r1-arm-l-out",
                workspaceId: "default-workspace",
                sku: eng.fes?.sku || "SOFA-ARM-R1-001",
                canonicalComponentId:
                  activeAlignmentSession?.canonicalComponentId ||
                  activeAlignmentSession?.componentId ||
                  "ARM-L-OUT",
                component: {
                  id:
                    activeAlignmentSession?.canonicalComponentId ||
                    activeAlignmentSession?.componentId ||
                    "ARM-L-OUT",
                  type: "armrest",
                  material: "Fabric / High-Resilience Foam / Internal Frame",
                  sizeX: 250,
                  sizeY: 900,
                  sizeZ: 600,
                  posX: -1275,
                  posY: 0,
                  posZ: 300,
                  rotationX: 0,
                  rotationY: 0,
                  rotationZ: 0,
                },
                referenceMesh: {
                  artifactId:
                    activeAlignmentSession?.artifactId || "art-glb-hunyuan3d-arm-l-out",
                  geometrySource: "ai_reference_mesh",
                  productionTruth: false,
                },
                engineeringGeometry: {},
                truthState: {
                  isComponentResolved: false,
                  hasProvidedDimensions: true,
                  hasEngineeringProfiles: false,
                  hasEngineeringLoft: false,
                  hasEngineeringSoftSurface: false,
                  hasEngineeringTopology: false,
                  hasReferenceMesh: true,
                  hasProxyOnly: false,
                },
              }}
            />
          </div>

          {/* 5. Persistent Data Table Viewport Container */}
          <div
            id="persistent-data-container"
            data-viewport-active={tab === "DATA"}
            style={{
              display: tab === "DATA" ? "flex" : "none",
              height: "100%",
              width: "100%",
              flexDirection: "column",
              padding: 16,
              overflowY: "auto",
              minHeight: 0,
              flex: 1,
            }}
          >
            {eng.uploadState === "success" && eng.fes ? (
              <>
                {eng.validationReport && (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: 14,
                      background: "#1c1c22",
                      border: `1px solid ${
                        eng.validationReport.level === "pass"
                          ? "#2e7d32"
                          : eng.validationReport.level === "warning"
                          ? "#ed6c02"
                          : "#d32f2f"
                      }`,
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <h4 style={{ margin: 0, color: "#fff" }}>Engineering Validation Summary</h4>
                      <span
                        style={{
                          fontWeight: "bold",
                          padding: "3px 10px",
                          borderRadius: 4,
                          fontSize: 12,
                          background:
                            eng.validationReport.level === "pass"
                              ? "#1b5e20"
                              : eng.validationReport.level === "warning"
                              ? "#e65100"
                              : "#c62828",
                          color: "#fff",
                        }}
                      >
                        {eng.validationReport.level.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "#ccc", marginBottom: 8 }}>
                      Errors: <strong style={{ color: eng.validationReport.summary.errors > 0 ? "#f44336" : "#81c784" }}>{eng.validationReport.summary.errors}</strong> &nbsp;|&nbsp;
                      Warnings: <strong style={{ color: eng.validationReport.summary.warnings > 0 ? "#ffb74d" : "#81c784" }}>{eng.validationReport.summary.warnings}</strong>
                    </div>
                    {eng.validationReport.issues.length > 0 && (
                      <div style={{ marginTop: 8, background: "#121214", padding: 10, borderRadius: 4, maxHeight: 180, overflowY: "auto" }}>
                        <div style={{ fontSize: 12, fontWeight: "bold", marginBottom: 6, color: "#aaa" }}>
                          Validation Issues ({eng.validationReport.issues.length}):
                        </div>
                        {eng.validationReport.issues.map((iss, idx) => (
                          <div
                            key={idx}
                            style={{
                              fontSize: 12,
                              padding: "4px 0",
                              borderBottom: "1px solid #2a2a35",
                              color: iss.severity === "error" ? "#ef5350" : "#ffb74d",
                            }}
                          >
                            <strong>[{iss.code}]</strong> {iss.componentId ? `(Component: ${iss.componentId}) ` : ""}
                            {iss.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ fontWeight: "bold", marginBottom: 6, color: "#aaa" }}>Furniture Engineering Schema (FES) JSON:</div>
                <pre
                  style={{
                    flex: 1,
                    overflow: "auto",
                    padding: 14,
                    background: "#18181c",
                    border: "1px solid #2a2a35",
                    borderRadius: 6,
                    margin: 0,
                    fontSize: 12,
                    color: "#80cbc4",
                  }}
                >
                  {JSON.stringify(eng.fes, null, 2)}
                </pre>
              </>
            ) : (
              <EmptyText text="NO ACTIVE DATA" />
            )}
          </div>

          {/* 6. Persistent CAD Viewport Container */}
          <div
            id="persistent-cad-container"
            data-viewport-active={tab === "CAD"}
            style={{
              display: tab === "CAD" ? "block" : "none",
              height: "100%",
              width: "100%",
              minHeight: 0,
              position: "relative",
              flex: 1,
            }}
          >
            {eng.uploadState === "success" && eng.cad ? (
              <CadCanvas
                doc={eng.cad}
                selectedComponentId={eng.selectedComponentId}
                onSelectComponent={eng.setSelectedComponentId}
                currentView={eng.cadView}
                onViewChange={eng.setCadView}
              />
            ) : (
              <EmptyText text="NO ACTIVE DATA" />
            )}
          </div>

          {/* 7. Persistent 3D AssemblyView container: kept in DOM to preserve WebGL context, Three.js scene, and imported models across tab switches */}
          <div
            id="persistent-assembly-viewport-container"
            data-viewport-active={tab === "3D"}
            style={{
              display: tab === "3D" ? "flex" : "none",
              flexDirection: "column",
              width: "100%",
              height: "100%",
              flex: 1,
              minHeight: 0,
              minWidth: 0,
            }}
          >
            <AssemblyView
              assembly={
                (eng.assembly || {
                  version: "1.0",
                  sku: eng.fes?.sku || "EMPTY_WORKSPACE",
                  components: [],
                }) as any
              }
              selectedComponentId={eng.selectedComponentId}
              onSelectComponent={eng.setSelectedComponentId}
              aiReferenceMeshUrl={aiReferenceMeshUrl}
              aiReferenceArtifact={aiReferenceArtifact}
              engineeringData={{
                fes: eng.fes,
                upload: eng.upload,
                loadSample: () => { eng.loadSample("SOFA-ARM-R1-001"); },
                validationReport: eng.validationReport,
              }}
            />
          </div>

          {/* 8. Persistent Agent Planner Viewport Container */}
          <div
            id="persistent-agent-container"
            data-viewport-active={tab === "AGENT"}
            style={{
              display: tab === "AGENT" ? "flex" : "none",
              padding: 20,
              height: "100%",
              width: "100%",
              flexDirection: "column",
              overflowY: "auto",
              minHeight: 0,
              flex: 1,
            }}
          >
            <h2 style={{ color: "#fff", marginTop: 0 }}>工程 Agent 规划引擎 (RouterHub / VectorEngine / Gemini)</h2>
            <textarea
              value={planner.prompt}
              onChange={(e) => planner.setPrompt(e.target.value)}
              style={{
                width: "100%",
                height: 100,
                padding: 10,
                background: "#18181c",
                color: "#fff",
                border: "1px solid #2a2a35",
                borderRadius: 6,
                fontSize: 13,
              }}
              placeholder="例如：检查该产品并规划正视图与5部件爆炸图"
            />
            <p style={{ marginTop: 12 }}>
              <button
                onClick={() => planner.runPlan(eng.fes)}
                style={{
                  padding: "8px 18px",
                  background: "#4fc3f7",
                  color: "#000",
                  fontWeight: "bold",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                运行 Agent 规划
              </button>
            </p>
            {planner.agentResult && (
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  background: "#18181c",
                  border: "1px solid #2a2a35",
                  borderRadius: 6,
                  overflowY: "auto",
                  maxHeight: 380,
                }}
              >
                <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 13, color: "#e0e0e0" }}>
                  {planner.agentResult}
                </pre>
              </div>
            )}
          </div>

          {/* 9. Persistent Skills Marketplace & Diagnostics Viewport Container */}
          <div
            id="persistent-skills-container"
            data-viewport-active={tab === "SKILLS"}
            style={{
              display: tab === "SKILLS" ? "flex" : "none",
              flexDirection: "column",
              color: "#ccc",
              width: "100%",
              height: "100%",
              minHeight: 0,
              flex: 1,
              overflow: "hidden",
            }}
          >
            <SkillsView />
          </div>
        </section>

        {tab !== "3D" && (
          <EngineeringSummary
            uploadState={eng.uploadState}
            fes={eng.fes}
            selectedComponentId={eng.selectedComponentId}
          />
        )}
      </main>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        color: "#666",
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}
