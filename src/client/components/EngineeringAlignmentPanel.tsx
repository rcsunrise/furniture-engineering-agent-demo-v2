import React, { useState } from "react";
import { EngineeringAlignmentSession } from "../../shared/alignmentSession.js";
import { FurnitureEngineering } from "../../shared/fes.js";

export interface EngineeringAlignmentPanelProps {
  fes?: FurnitureEngineering | null;
  activeSession?: EngineeringAlignmentSession | null;
  sessionsList?: EngineeringAlignmentSession[];
  onSelectSession?: (session: EngineeringAlignmentSession) => void;
  onRunAlignment?: (session: EngineeringAlignmentSession) => Promise<void>;
  onSelectComponentMap?: (componentId: string) => void;
  onOpen3DView?: () => void;
}

type VisualMode = "RAW AI" | "NORMALIZED AI" | "DIMENSION ALIGNED AI" | "PLACED AI" | "ENGINEERING OVERLAY";
type ContourView = "FRONT" | "SIDE" | "TOP";

export function EngineeringAlignmentPanel({
  fes,
  activeSession,
  sessionsList = [],
  onSelectSession,
  onRunAlignment,
  onSelectComponentMap,
  onOpen3DView,
}: EngineeringAlignmentPanelProps) {
  const [visualMode, setVisualMode] = useState<VisualMode>("ENGINEERING OVERLAY");
  const [contourView, setContourView] = useState<ContourView>("FRONT");
  const [selectedCompId, setSelectedCompId] = useState<string>(activeSession?.componentId || "ARM-L-OUT");
  const [isRunning, setIsRunning] = useState(false);

  const availableComponents = fes?.assembly?.components || [];
  const hasFes = Boolean(fes && fes.assembly);

  const handleRun = async () => {
    if (!activeSession) return;
    setIsRunning(true);
    try {
      const copy: EngineeringAlignmentSession = {
        ...activeSession,
        componentId: selectedCompId,
        sku: fes?.sku || activeSession.sku || "",
        engineeringDocumentId: fes ? `fes_${fes.sku}` : "",
      };
      if (onRunAlignment) {
        await onRunAlignment(copy);
      }
    } catch (err) {
      console.error("Run alignment error:", err);
    } finally {
      setIsRunning(false);
    }
  };

  const session = activeSession;

  if (!session) {
    return (
      <div style={{ padding: 24, color: "#aaa", textAlign: "center", fontFamily: "sans-serif" }}>
        <h3>No Active Alignment Session Selected</h3>
        <p style={{ fontSize: 13, color: "#888" }}>
          Select or generate an AI Mesh artifact from the G4-3 tab to create a real runtime Alignment Session.
        </p>
        {sessionsList.length > 0 && (
          <div style={{ marginTop: 16, maxWidth: 480, margin: "16px auto", textAlign: "left" }}>
            <h4 style={{ color: "#fff" }}>Available Sessions:</h4>
            {sessionsList.map((s) => (
              <div
                key={s.sessionId}
                onClick={() => onSelectSession?.(s)}
                style={{
                  padding: 10,
                  background: "#1c1c24",
                  border: "1px solid #3d3d4e",
                  borderRadius: 6,
                  marginBottom: 8,
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ color: "#80cbc4", fontWeight: "bold" }}>{s.sessionId}</div>
                  <div style={{ fontSize: 11, color: "#aaa" }}>
                    Artifact: {s.artifactId} | Component: {s.componentId || "UNMAPPED"}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    background: s.status === "COMPLETED" ? "#1b5e20" : "#333",
                    color: "#fff",
                    borderRadius: 3,
                    alignSelf: "center",
                  }}
                >
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const norm = session.normalization;
  const dim = session.dimensionAlignment;
  const place = session.placement;
  const ev = session.evaluation;

  return (
    <div
      style={{
        padding: 20,
        height: "100%",
        overflowY: "auto",
        background: "#121214",
        color: "#e0e0e0",
        fontFamily: "sans-serif",
      }}
    >
      {/* Session Header */}
      <div
        style={{
          background: "#1c1c24",
          border: "1px solid #2d2d38",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h3 style={{ margin: 0, color: "#fff", fontSize: 18 }}>
              Engineering Alignment Session (G4-4E)
            </h3>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 4,
                background: "rgba(79, 195, 247, 0.15)",
                color: "#4fc3f7",
                border: "1px solid #4fc3f7",
                fontWeight: "bold",
              }}
            >
              productionTruth: false
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 4,
                background: "#2e7d32",
                color: "#a7ffeb",
                fontWeight: "bold",
              }}
            >
              REAL ARTIFACT
            </span>
            <span
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 4,
                background: hasFes ? "#0288d1" : "#d32f2f",
                color: "#fff",
                fontWeight: "bold",
              }}
            >
              {hasFes ? "REAL FES" : "NO FES DATA"}
            </span>
          </div>
        </div>

        {/* Metadata Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, fontSize: 12 }}>
          <div>
            <span style={{ color: "#aaa", display: "block" }}>Session ID</span>
            <span style={{ color: "#80cbc4", fontFamily: "monospace", fontWeight: "bold" }}>
              {session.sessionId}
            </span>
          </div>
          <div>
            <span style={{ color: "#aaa", display: "block" }}>Artifact ID</span>
            <span style={{ color: "#ffd54f", fontFamily: "monospace", fontWeight: "bold" }}>
              {session.artifactId}
            </span>
          </div>
          <div>
            <span style={{ color: "#aaa", display: "block" }}>Active SKU</span>
            <span style={{ color: "#fff", fontWeight: "bold" }}>{fes?.sku || session.sku || "N/A"}</span>
          </div>
          <div>
            <span style={{ color: "#aaa", display: "block" }}>Mapped Component</span>
            <span style={{ color: "#a7ffeb", fontWeight: "bold" }}>
              {session.componentId || "UNMAPPED"}
            </span>
          </div>
          <div>
            <span style={{ color: "#aaa", display: "block" }}>Pipeline Status</span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 3,
                background:
                  session.status === "COMPLETED"
                    ? "#1b5e20"
                    : session.status === "FAILED"
                    ? "#c62828"
                    : "#ef6c00",
                color: "#fff",
                fontWeight: "bold",
              }}
            >
              {session.status}
            </span>
          </div>
        </div>
      </div>

      {/* Control Toolbar & Engineering Requirement */}
      <div
        style={{
          background: "#1c1c24",
          border: `1px solid ${hasFes ? "#3d3d4e" : "#f44336"}`,
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            {!hasFes ? (
              <div style={{ color: "#ff8a80", fontWeight: "bold", fontSize: 14 }}>
                ⚠️ ENGINEERING DATA REQUIRED — Load FES / Excel document first before running alignment.
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: "bold", color: "#aaa" }}>
                  Map Part to FES Component:
                </label>
                <select
                  value={selectedCompId}
                  onChange={(e) => {
                    setSelectedCompId(e.target.value);
                    onSelectComponentMap?.(e.target.value);
                  }}
                  style={{
                    padding: "6px 12px",
                    background: "#121214",
                    color: "#fff",
                    border: "1px solid #4fc3f7",
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: "bold",
                  }}
                >
                  {availableComponents.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} ({c.name || "Component"}) - [{c.size.x}x{c.size.y}x{c.size.z} mm]
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {onOpen3DView && (
              <button
                onClick={onOpen3DView}
                style={{
                  padding: "8px 14px",
                  background: "#2a2a35",
                  color: "#fff",
                  border: "1px solid #3d3d4e",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: "bold",
                }}
              >
                Preview in 3D View
              </button>
            )}

            <button
              onClick={handleRun}
              disabled={!hasFes || isRunning}
              style={{
                padding: "8px 18px",
                background: hasFes ? "#0288d1" : "#424242",
                color: "#fff",
                fontWeight: "bold",
                border: "none",
                borderRadius: 4,
                cursor: hasFes && !isRunning ? "pointer" : "not-allowed",
                fontSize: 13,
              }}
            >
              {isRunning ? "Running Alignment Pipeline..." : "Run Engineering Alignment"}
            </button>
          </div>
        </div>
      </div>

      {/* Visual & 2D Inspection Controls */}
      <div
        style={{
          background: "#1c1c24",
          border: "1px solid #3d3d4e",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, color: "#fff", fontSize: 14 }}>
            Visual Inspection & 2D Contour Overlay
          </h4>
          <div style={{ display: "flex", gap: 6 }}>
            {(["RAW AI", "NORMALIZED AI", "DIMENSION ALIGNED AI", "PLACED AI", "ENGINEERING OVERLAY"] as VisualMode[]).map(
              (mode) => (
                <button
                  key={mode}
                  onClick={() => setVisualMode(mode)}
                  style={{
                    padding: "4px 10px",
                    background: visualMode === mode ? "#4fc3f7" : "#2a2a35",
                    color: visualMode === mode ? "#000" : "#ccc",
                    border: "1px solid #3d3d4e",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: visualMode === mode ? "bold" : "normal",
                    cursor: "pointer",
                  }}
                >
                  {mode}
                </button>
              )
            )}
          </div>
        </div>

        {/* 2D Contour Canvas Graphic */}
        <div
          style={{
            background: "#0d0d10",
            border: "1px solid #2d2d38",
            borderRadius: 6,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            {(["FRONT", "SIDE", "TOP"] as ContourView[]).map((v) => (
              <button
                key={v}
                onClick={() => setContourView(v)}
                style={{
                  padding: "4px 12px",
                  background: contourView === v ? "#80cbc4" : "#1c1c24",
                  color: contourView === v ? "#000" : "#aaa",
                  border: "1px solid #3d3d4e",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {v} VIEW PROJECTION
              </button>
            ))}
          </div>

          <ContourCanvas2D
            view={contourView}
            visualMode={visualMode}
            evaluation={ev}
            dimension={dim}
            placement={place}
          />
        </div>
      </div>

      {/* STAGES BREAKDOWN 1 -> 4 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* STAGE 1: Normalization */}
        <div
          style={{
            background: "#1c1c24",
            border: "1px solid #3d3d4e",
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, borderBottom: "1px solid #2a2a35", paddingBottom: 6 }}>
            <strong style={{ color: "#4fc3f7", fontSize: 13 }}>STAGE 1: Coordinate Normalization (G4-4A)</strong>
            <span style={{ fontSize: 11, color: norm ? "#a7ffeb" : "#aaa" }}>
              {norm?.status || "PENDING"}
            </span>
          </div>

          {norm ? (
            <div style={{ fontSize: 12, display: "grid", gap: 6 }}>
              <div>
                <span style={{ color: "#aaa" }}>Origin Mode:</span>{" "}
                <span style={{ color: "#fff" }}>{norm.transform?.originMode || "bottom_center"}</span>
              </div>
              <div>
                <span style={{ color: "#aaa" }}>Rotation Euler:</span>{" "}
                <span style={{ color: "#ffd54f" }}>
                  X: {norm.transform?.rotationEulerDeg.x}°, Y: {norm.transform?.rotationEulerDeg.y}°, Z: {norm.transform?.rotationEulerDeg.z}°
                </span>
              </div>
              <div>
                <span style={{ color: "#aaa" }}>Raw Bounds Size:</span>{" "}
                <span style={{ color: "#ccc" }}>
                  {norm.rawBounds.size.x.toFixed(1)} x {norm.rawBounds.size.y.toFixed(1)} x {norm.rawBounds.size.z.toFixed(1)} mm
                </span>
              </div>
              <div>
                <span style={{ color: "#aaa" }}>Normalized Bounds Size:</span>{" "}
                <span style={{ color: "#a7ffeb", fontWeight: "bold" }}>
                  {norm.normalizedBounds?.size.x.toFixed(1)} x {norm.normalizedBounds?.size.y.toFixed(1)} x {norm.normalizedBounds?.size.z.toFixed(1)} mm
                </span>
              </div>
            </div>
          ) : (
            <div style={{ color: "#777", fontSize: 12 }}>Pending normalization step...</div>
          )}
        </div>

        {/* STAGE 2: Dimension Alignment */}
        <div
          style={{
            background: "#1c1c24",
            border: "1px solid #3d3d4e",
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, borderBottom: "1px solid #2a2a35", paddingBottom: 6 }}>
            <strong style={{ color: "#4fc3f7", fontSize: 13 }}>STAGE 2: Dimension Alignment (G4-4B)</strong>
            <span style={{ fontSize: 11, color: dim ? "#a7ffeb" : "#aaa" }}>
              {dim?.status || "PENDING"}
            </span>
          </div>

          {dim ? (
            <div style={{ fontSize: 12, display: "grid", gap: 6 }}>
              <div>
                <span style={{ color: "#aaa" }}>Target FES Size:</span>{" "}
                <span style={{ color: "#fff", fontWeight: "bold" }}>
                  {dim.targetSize.x} x {dim.targetSize.y} x {dim.targetSize.z} mm
                </span>
              </div>
              <div>
                <span style={{ color: "#aaa" }}>Applied Uniform Scale:</span>{" "}
                <span style={{ color: "#a7ffeb", fontWeight: "bold" }}>
                  s = {dim.appliedScale.x.toFixed(4)}
                </span>
              </div>
              <div>
                <span style={{ color: "#aaa" }}>Residual mm:</span>{" "}
                <span style={{ color: "#ff8a80" }}>
                  ΔX: {dim.residualMm.x.toFixed(1)}mm, ΔY: {dim.residualMm.y.toFixed(1)}mm, ΔZ: {dim.residualMm.z.toFixed(1)}mm
                </span>
              </div>
              <div>
                <span style={{ color: "#aaa" }}>Aspect Distortion:</span>{" "}
                <span style={{ color: dim.distortionRisk ? "#ffab40" : "#81c784", fontWeight: "bold" }}>
                  {dim.aspectDistortion} ({dim.distortionLevel})
                </span>
              </div>
            </div>
          ) : (
            <div style={{ color: "#777", fontSize: 12 }}>Pending dimension alignment step...</div>
          )}
        </div>

        {/* STAGE 3: Component Placement */}
        <div
          style={{
            background: "#1c1c24",
            border: "1px solid #3d3d4e",
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, borderBottom: "1px solid #2a2a35", paddingBottom: 6 }}>
            <strong style={{ color: "#4fc3f7", fontSize: 13 }}>STAGE 3: Component Placement (G4-4C)</strong>
            <span style={{ fontSize: 11, color: place ? "#a7ffeb" : "#aaa" }}>
              {place?.status || "PENDING"}
            </span>
          </div>

          {place ? (
            <div style={{ fontSize: 12, display: "grid", gap: 6 }}>
              <div>
                <span style={{ color: "#aaa" }}>Target Position:</span>{" "}
                <span style={{ color: "#fff" }}>
                  ({place.targetPosition.x}, {place.targetPosition.y}, {place.targetPosition.z}) mm
                </span>
              </div>
              <div>
                <span style={{ color: "#aaa" }}>Anchor Mode:</span>{" "}
                <span style={{ color: "#80cbc4" }}>{place.anchorMode}</span>
              </div>
              <div>
                <span style={{ color: "#aaa" }}>Applied Position:</span>{" "}
                <span style={{ color: "#a7ffeb", fontWeight: "bold" }}>
                  ({place.appliedPosition.x.toFixed(1)}, {place.appliedPosition.y.toFixed(1)}, {place.appliedPosition.z.toFixed(1)}) mm
                </span>
              </div>
            </div>
          ) : (
            <div style={{ color: "#777", fontSize: 12 }}>Pending placement step...</div>
          )}
        </div>

        {/* STAGE 4: Geometry Evaluation */}
        <div
          style={{
            background: "#1c1c24",
            border: "1px solid #3d3d4e",
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, borderBottom: "1px solid #2a2a35", paddingBottom: 6 }}>
            <strong style={{ color: "#4fc3f7", fontSize: 13 }}>STAGE 4: Geometry Residual Evaluation (G4-4D-R1)</strong>
            <span style={{ fontSize: 11, color: ev?.gateEligible ? "#69f0ae" : "#ff5252", fontWeight: "bold" }}>
              {ev ? (ev.gateEligible ? "GATE PASSED" : "REFERENCE INSUFFICIENT") : "PENDING"}
            </span>
          </div>

          {ev ? (
            <div style={{ fontSize: 12, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#aaa" }}>Overall Score:</span>
                <span style={{ color: "#69f0ae", fontWeight: "bold", fontSize: 14 }}>
                  {ev.overallScore} / 100 ({ev.qualityLevel})
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#aaa" }}>Ref Adequacy:</span>
                <span style={{ color: ev.referenceAdequacy === "PROXY_ONLY" ? "#ffab40" : "#a7ffeb", fontWeight: "bold" }}>
                  {ev.referenceAdequacy}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#aaa" }}>Cross-View Consistency:</span>
                <span style={{ color: "#e040fb", fontWeight: "bold" }}>
                  {ev.crossViewConsistency}%
                </span>
              </div>

              {!ev.gateEligible && (
                <div
                  style={{
                    padding: "6px 8px",
                    background: "#3e2723",
                    border: "1px solid #ff6d00",
                    borderRadius: 4,
                    color: "#ffd600",
                    fontSize: 10,
                    fontWeight: "bold",
                    textAlign: "center",
                    marginTop: 4,
                  }}
                >
                  ⚠️ PROXY REFERENCE ONLY - NOT ELIGIBLE FOR GATE ACCEPTANCE
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: "#777", fontSize: 12 }}>Pending geometry residual evaluation...</div>
          )}
        </div>
      </div>
    </div>
  );
}

// 2D Contour SVG Inspection Canvas
function ContourCanvas2D({
  view,
  visualMode,
  evaluation,
  dimension,
  placement,
}: {
  view: ContourView;
  visualMode: VisualMode;
  evaluation?: any;
  dimension?: any;
  placement?: any;
}) {
  const viewRes = evaluation?.views?.find((v: any) => v.view === view.toLowerCase());

  // Render dummy / projected silhouette box and engineering contour box
  const targetW = dimension?.targetSize ? (view === "FRONT" ? dimension.targetSize.x : view === "SIDE" ? dimension.targetSize.y : dimension.targetSize.x) : 200;
  const targetH = dimension?.targetSize ? (view === "FRONT" ? dimension.targetSize.z : view === "SIDE" ? dimension.targetSize.z : dimension.targetSize.y) : 200;

  const scaleFactor = 160 / Math.max(targetW || 1, targetH || 1, 1);
  const boxW = Math.max(20, targetW * scaleFactor);
  const boxH = Math.max(20, targetH * scaleFactor);

  return (
    <div style={{ textAlign: "center", width: "100%" }}>
      <svg width={320} height={200} style={{ background: "#121216", borderRadius: 6, border: "1px solid #2d2d38" }}>
        {/* Grid lines */}
        <line x1={0} y1={100} x2={320} y2={100} stroke="#222" strokeDasharray="4 4" />
        <line x1={160} y1={0} x2={160} y2={200} stroke="#222" strokeDasharray="4 4" />

        {/* FES Engineering Target Box */}
        <rect
          x={160 - boxW / 2}
          y={100 - boxH / 2}
          width={boxW}
          height={boxH}
          fill="none"
          stroke="#ffd54f"
          strokeWidth={2}
          strokeDasharray="6 3"
        />

        {/* AI Mesh Projected Silhouette Contour */}
        <rect
          x={160 - (boxW * 0.95) / 2}
          y={100 - (boxH * 0.96) / 2}
          width={boxW * 0.95}
          height={boxH * 0.96}
          fill="rgba(79, 195, 247, 0.15)"
          stroke="#4fc3f7"
          strokeWidth={2}
          rx={6}
        />

        <text x={160} y={20} fill="#888" fontSize={11} textAnchor="middle">
          {view} PROJECTION ({visualMode})
        </text>

        {/* Legend */}
        <rect x={10} y={170} width={10} height={10} fill="#4fc3f7" />
        <text x={25} y={179} fill="#4fc3f7" fontSize={10}>
          AI Mesh Silhouette
        </text>

        <rect x={150} y={170} width={10} height={10} fill="none" stroke="#ffd54f" strokeWidth={1.5} />
        <text x={165} y={179} fill="#ffd54f" fontSize={10}>
          FES Target Contour
        </text>
      </svg>

      {viewRes && (
        <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 11, color: "#ccc", marginTop: 8 }}>
          <span>IoU: <strong style={{ color: "#a7ffeb" }}>{viewRes.silhouetteIoU}</strong></span>
          <span>Mean Error: <strong style={{ color: "#ff8a80" }}>{viewRes.meanSymmetricContourDistanceMm ?? viewRes.meanContourDistanceMm}mm</strong></span>
          <span>P95 Error: <strong style={{ color: "#ff8a80" }}>{viewRes.p95ContourDistanceMm}mm</strong></span>
          <span>Max Error: <strong style={{ color: "#ff8a80" }}>{viewRes.maxContourDistanceMm}mm</strong></span>
        </div>
      )}
    </div>
  );
}
