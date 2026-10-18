import React, { useEffect, useRef, useState } from "react";
import type { CadDocument, PathCommand } from "../../shared/cad.js";
import { createCadViewportTransform } from "../utils/viewportTransform.js";
import { exportCadToDxf, exportCadToSvg, triggerFileDownload } from "../utils/cadExporter.js";

type RendererType = "THORVG" | "SVG DEBUG FALLBACK";

function convertPathCommandsToSvgD(
  commands: PathCommand[],
  transform: ReturnType<typeof createCadViewportTransform>
): { d: string; labelX: number; labelY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const parts: string[] = [];

  for (const cmd of commands) {
    if (cmd.type === "moveTo") {
      const sx = transform.engToScreenX(cmd.x);
      const sy = transform.engToScreenY(cmd.y);
      parts.push(`M ${sx.toFixed(1)} ${sy.toFixed(1)}`);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    } else if (cmd.type === "lineTo") {
      const sx = transform.engToScreenX(cmd.x);
      const sy = transform.engToScreenY(cmd.y);
      parts.push(`L ${sx.toFixed(1)} ${sy.toFixed(1)}`);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    } else if (cmd.type === "quadraticTo") {
      const scpx = transform.engToScreenX(cmd.cpx);
      const scpy = transform.engToScreenY(cmd.cpy);
      const sx = transform.engToScreenX(cmd.x);
      const sy = transform.engToScreenY(cmd.y);
      parts.push(`Q ${scpx.toFixed(1)} ${scpy.toFixed(1)} ${sx.toFixed(1)} ${sy.toFixed(1)}`);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    } else if (cmd.type === "cubicTo") {
      const scp1x = transform.engToScreenX(cmd.cp1x);
      const scp1y = transform.engToScreenY(cmd.cp1y);
      const scp2x = transform.engToScreenX(cmd.cp2x);
      const scp2y = transform.engToScreenY(cmd.cp2y);
      const sx = transform.engToScreenX(cmd.x);
      const sy = transform.engToScreenY(cmd.y);
      parts.push(`C ${scp1x.toFixed(1)} ${scp1y.toFixed(1)} ${scp2x.toFixed(1)} ${scp2y.toFixed(1)} ${sx.toFixed(1)} ${sy.toFixed(1)}`);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    } else if (cmd.type === "close") {
      parts.push("Z");
    }
  }

  const labelX = Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) / 2 : 0;
  const labelY = Number.isFinite(minY) && Number.isFinite(maxY) ? (minY + maxY) / 2 : 0;

  return { d: parts.join(" "), labelX, labelY };
}

export function CadCanvas({
  doc,
  selectedComponentId,
  onSelectComponent,
  currentView = "front",
  onViewChange,
}: {
  doc: CadDocument;
  selectedComponentId?: string | null;
  onSelectComponent?: (id: string | null) => void;
  currentView?: "front" | "side" | "top";
  onViewChange?: (view: "front" | "side" | "top") => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [rendererType, setRendererType] = useState<RendererType>("SVG DEBUG FALLBACK");
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  const [showReferenceOverlay, setShowReferenceOverlay] = useState(false);

  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  // Handle Container Resizing
  useEffect(() => {
    if (!containerRef.current) return;
    let animationFrameId: number;
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(updateSize);
    });
    ro.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(animationFrameId);
      ro.disconnect();
    };
  }, []);

  // Try ThorVG Initialization
  useEffect(() => {
    let active = true;
    async function tryThorVG() {
      try {
        const thorvg = await import("@thorvg/webcanvas");
        if (!active) return;
        if (thorvg && typeof thorvg.init === "function") {
          await thorvg.init();
          if (active && canvasRef.current) {
            setRendererType("THORVG");
            return;
          }
        }
      } catch (err) {
        console.warn("[CAD Renderer] ThorVG WASM init failed, using SVG DEBUG FALLBACK:", err);
      }
      if (active) {
        setRendererType("SVG DEBUG FALLBACK");
      }
    }
    tryThorVG();
    return () => {
      active = false;
    };
  }, [doc]);

  // Viewport transformation derived from engineering mm coordinates
  const transform = createCadViewportTransform({
    bounds: doc.bounds,
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
    zoom,
    pan,
    marginMm: 150,
  });

  // Pan Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(Math.max(0.2, prev * factor), 5.0));
  };

  const fitToView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#18181c",
        color: "#f0f0f0",
        userSelect: "none",
      }}
    >
      {/* CAD Toolbar & Status Header */}
      <div
        style={{
          padding: "10px 16px",
          background: "#222228",
          borderBottom: "1px solid #33333e",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Renderer Status Badge */}
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: "bold",
              background: rendererType === "THORVG" ? "#1b5e20" : "#e65100",
              color: "#ffffff",
              letterSpacing: "0.5px",
            }}
          >
            {rendererType}
          </span>

          {/* View Selector Buttons */}
          <div style={{ display: "flex", gap: 4, background: "#18181c", padding: 2, borderRadius: 6, border: "1px solid #33333e" }}>
            {([
              { v: "front", label: "正视 FRONT" },
              { v: "side", label: "侧视 SIDE" },
              { v: "top", label: "俯视 TOP" },
            ] as const).map(({ v, label }) => {
              const isActive = (doc.view || currentView) === v;
              return (
                <button
                  key={v}
                  onClick={() => onViewChange && onViewChange(v)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: "none",
                    background: isActive ? "#1e88e5" : "transparent",
                    color: isActive ? "#ffffff" : "#aaa",
                    fontSize: 12,
                    fontWeight: isActive ? "bold" : "normal",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <span style={{ fontSize: 13, color: "#aaa" }}>
            款号 (SKU): <strong style={{ color: "#fff" }}>{doc.sourceSku}</strong>
          </span>
          {(() => {
            const pathEntities = doc.entities.filter((e) => e.type === "path");
            const fallbackCount = pathEntities.filter((e) => (e as any).profileFallback === true).length;
            const wbProfileCount = pathEntities.filter((e) => (e as any).geometrySource === "workbook_profile").length;
            const wbLoftCount = pathEntities.filter((e) => (e as any).geometrySource === "workbook_loft").length;
            const wbSoftCount = pathEntities.filter((e) => (e as any).geometrySource === "workbook_soft_surface").length;
            const boxCount = pathEntities.filter((e) => (e as any).geometrySource === "box_geometry").length;

            const isAllWorkbook = pathEntities.length > 0 && fallbackCount === 0;

            const badgeText = isAllWorkbook
              ? "工程表真值几何 (WORKBOOK)"
              : fallbackCount === pathEntities.length
              ? "代理降级几何 (FALLBACK)"
              : "混合数据源 (MIXED)";

            const badgeStyle = isAllWorkbook
              ? { background: "#1b5e20", color: "#a5d6a7", border: "1px solid #2e7d32" }
              : fallbackCount === pathEntities.length
              ? { background: "#4a148c", color: "#ff8a80", border: "1px solid #d50000" }
              : { background: "#3e2723", color: "#ffe082", border: "1px solid #8c6d00" };

            return (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: "bold",
                    padding: "2px 8px",
                    borderRadius: 4,
                    ...badgeStyle,
                  }}
                >
                  {badgeText}
                </span>
                <span style={{ fontSize: 11, color: "#888" }}>
                  截面轮廓: <strong style={{ color: "#a5d6a7" }}>{wbProfileCount}</strong> | 放样体: <strong style={{ color: "#a5d6a7" }}>{wbLoftCount}</strong> | 软体曲面: <strong style={{ color: "#a5d6a7" }}>{wbSoftCount}</strong> | 基础立方盒: <strong style={{ color: "#e0e0e0" }}>{boxCount}</strong> | 降级数: <strong style={{ color: fallbackCount === 0 ? "#81c784" : "#ff8a80" }}>{fallbackCount}</strong>
                </span>
              </div>
            );
          })()}
        </div>

        {/* View Controls & Reference Overlay */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setShowReferenceOverlay((prev) => !prev)}
            style={{
              padding: "5px 12px",
              background: showReferenceOverlay ? "#2e7d32" : "#33333e",
              color: "#fff",
              border: `1px solid ${showReferenceOverlay ? "#4caf50" : "#444452"}`,
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            参考叠加: {showReferenceOverlay ? "开启" : "关闭"}
          </button>
          <button
            onClick={fitToView}
            style={{
              padding: "5px 12px",
              background: "#33333e",
              color: "#fff",
              border: "1px solid #444452",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            全屏居中
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(z * 1.25, 5.0))}
            style={{
              padding: "5px 10px",
              background: "#33333e",
              color: "#fff",
              border: "1px solid #444452",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            放大 +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z / 1.25, 0.2))}
            style={{
              padding: "5px 10px",
              background: "#33333e",
              color: "#fff",
              border: "1px solid #444452",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            缩小 -
          </button>
          <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>
            缩放: {Math.round(zoom * 100)}%
          </span>

          {/* CAD Export / Download Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8, borderLeft: "1px solid #3d3d4e", paddingLeft: 8 }}>
            <span style={{ fontSize: 12, color: "#90caf9", fontWeight: 600 }}>CAD 下载:</span>
            <button
              onClick={() => {
                const dxfContent = exportCadToDxf(doc);
                const filename = `${doc.sourceSku || "CAD"}_${doc.view || "front"}.dwg`;
                triggerFileDownload(dxfContent, filename, "application/x-dwg");
              }}
              style={{
                padding: "4px 10px",
                background: "#1e88e5",
                color: "#ffffff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
              title="下载 AutoCAD DWG 格式矢量图纸"
            >
              DWG (.dwg)
            </button>
            <button
              onClick={() => {
                const dxfContent = exportCadToDxf(doc);
                const filename = `${doc.sourceSku || "CAD"}_${doc.view || "front"}.dxf`;
                triggerFileDownload(dxfContent, filename, "application/dxf");
              }}
              style={{
                padding: "4px 10px",
                background: "#26a69a",
                color: "#ffffff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
              title="下载 DXF 交换格式 CAD 图纸"
            >
              DXF (.dxf)
            </button>
            <button
              onClick={() => {
                const svgContent = exportCadToSvg(doc);
                const filename = `${doc.sourceSku || "CAD"}_${doc.view || "front"}.svg`;
                triggerFileDownload(svgContent, filename, "image/svg+xml");
              }}
              style={{
                padding: "4px 10px",
                background: "#7e57c2",
                color: "#ffffff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
              title="下载 SVG 矢量图形"
            >
              SVG (.svg)
            </button>
          </div>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          cursor: isDragging ? "grabbing" : "grab",
          background: "#121214",
        }}
      >
        {/* Hidden Canvas for ThorVG WASM fallback / testing */}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* CAD Render Canvas (SVG / ThorVG fallback) */}
        <svg
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "auto",
          }}
        >
          <defs>
            {/* Grid Pattern */}
            <pattern id="cadGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1f1f26" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Grid Background */}
          <rect width="100%" height="100%" fill="url(#cadGrid)" />

          {/* Ground Baseline Z = 0 */}
          {(() => {
            const groundY = transform.engToScreenY(0);
            return (
              <line
                x1={0}
                y1={groundY}
                x2={containerSize.width}
                y2={groundY}
                stroke="#444452"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
            );
          })()}

          {/* Render CAD Entities from CAD-IR */}
          {doc.entities.map((e) => {
            if (e.type === "rect") {
              const isOutline = e.layer === "PRODUCT_OUTLINE";
              const screenX = transform.engToScreenX(e.x);
              // In engineering, e.y is minZ, height is length along Z
              const screenY = transform.engToScreenY(e.y + e.height);
              const screenWidth = transform.engToScreenDist(e.width);
              const screenHeight = transform.engToScreenDist(e.height);

              const isSelected = selectedComponentId && e.componentId === selectedComponentId;
              const isHovered = hoveredComponentId && e.componentId === hoveredComponentId;

              const fillColor = isOutline
                ? "none"
                : isSelected
                ? "rgba(255, 179, 0, 0.25)"
                : isHovered
                ? "rgba(33, 150, 243, 0.2)"
                : "rgba(33, 150, 243, 0.08)";

              const strokeColor = isOutline
                ? "#757575"
                : isSelected
                ? "#ffb300"
                : isHovered
                ? "#4fc3f7"
                : "#1e88e5";

              return (
                <g
                  key={e.id}
                  onClick={(evt) => {
                    evt.stopPropagation();
                    if (e.componentId && onSelectComponent) {
                      onSelectComponent(e.componentId);
                    }
                  }}
                  onMouseEnter={() => e.componentId && setHoveredComponentId(e.componentId)}
                  onMouseLeave={() => setHoveredComponentId(null)}
                  style={{ cursor: e.componentId ? "pointer" : "default" }}
                >
                  <rect
                    x={screenX}
                    y={screenY}
                    width={screenWidth}
                    height={screenHeight}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 3 : isOutline ? 1.5 : 2}
                    strokeDasharray={isOutline ? "6 4" : "none"}
                    rx={2}
                  />
                  {!isOutline && screenHeight > 14 && (
                    <text
                      x={screenX + screenWidth / 2}
                      y={screenY + screenHeight / 2}
                      fontSize={Math.max(11, Math.min(screenHeight * 0.35, 16))}
                      fill={isSelected ? "#ffe082" : "#90caf9"}
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: "none", fontWeight: 600 }}
                    >
                      {e.componentId || e.id}
                    </text>
                  )}
                </g>
              );
            }

            if (e.type === "path") {
              const { d, labelX, labelY } = convertPathCommandsToSvgD(e.commands, transform);
              const isSelected = selectedComponentId && e.componentId === selectedComponentId;
              const isHovered = hoveredComponentId && e.componentId === hoveredComponentId;

              const role = e.pathRole || "outer";
              const isSeam = role === "seam" || e.layer === "SEAM";
              const isInner = role === "inner" || e.layer === "INNER_CONTOUR";
              const isPiping = role === "piping" || e.layer === "PIPING";
              const isDivider = role === "divider" || e.layer === "MODULE_DIVIDER";

              const fillColor = isSelected
                ? "rgba(255, 179, 0, 0.28)"
                : isHovered
                ? "rgba(33, 150, 243, 0.22)"
                : isSeam || isInner || isPiping || isDivider
                ? "none"
                : "rgba(33, 150, 243, 0.08)";

              const strokeColor = isSelected
                ? "#ffb300"
                : isHovered
                ? "#4fc3f7"
                : isPiping
                ? "#ffb74d"
                : isSeam
                ? "#b0bec5"
                : isInner
                ? "#81c784"
                : isDivider
                ? "#ef5350"
                : "#1e88e5";

              const strokeDasharray = isSeam
                ? "4 4"
                : isInner
                ? "6 3"
                : isDivider
                ? "8 4"
                : "none";

              const strokeWidth = isSelected ? 3 : isPiping ? 2.5 : isSeam ? 1.2 : 2;

              return (
                <g
                  key={e.id}
                  onClick={(evt) => {
                    evt.stopPropagation();
                    if (e.componentId && onSelectComponent) {
                      onSelectComponent(e.componentId);
                    }
                  }}
                  onMouseEnter={() => e.componentId && setHoveredComponentId(e.componentId)}
                  onMouseLeave={() => setHoveredComponentId(null)}
                  style={{ cursor: e.componentId ? "pointer" : "default" }}
                >
                  <path
                    d={d}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                  />
                  {/* Reference Bounding Box Overlay if requested */}
                  {showReferenceOverlay && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#ff9800"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      opacity={0.6}
                    />
                  )}
                  {role === "outer" && (
                    <text
                      x={labelX}
                      y={labelY}
                      fontSize={13}
                      fill={isSelected ? "#ffe082" : "#90caf9"}
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: "none", fontWeight: 600 }}
                    >
                      {e.componentId || e.id}
                    </text>
                  )}
                </g>
              );
            }

            if (e.type === "line") {
              const x1 = transform.engToScreenX(e.x1);
              const y1 = transform.engToScreenY(e.y1);
              const x2 = transform.engToScreenX(e.x2);
              const y2 = transform.engToScreenY(e.y2);
              return (
                <line
                  key={e.id}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#e0e0e0"
                  strokeWidth={2}
                />
              );
            }

            if (e.type === "dimension") {
              if (e.axis === "x") {
                const screenX1 = transform.engToScreenX(e.from.x);
                const screenX2 = transform.engToScreenX(e.to.x);
                const dimScreenY = transform.engToScreenY(-60); // 60mm below Z=0
                const extTopY = transform.engToScreenY(10);
                const extBottomY = transform.engToScreenY(-80);

                return (
                  <g key={e.id} stroke="#ff5252" strokeWidth={1.5} fill="#ff5252">
                    {/* Extension lines */}
                    <line x1={screenX1} y1={extTopY} x2={screenX1} y2={extBottomY} stroke="#555566" strokeWidth={1} />
                    <line x1={screenX2} y1={extTopY} x2={screenX2} y2={extBottomY} stroke="#555566" strokeWidth={1} />
                    {/* Main Dimension Line */}
                    <line x1={screenX1} y1={dimScreenY} x2={screenX2} y2={dimScreenY} stroke="#ff5252" strokeWidth={1.5} />
                    <circle cx={screenX1} cy={dimScreenY} r={3} />
                    <circle cx={screenX2} cy={dimScreenY} r={3} />
                    <text
                      x={(screenX1 + screenX2) / 2}
                      y={dimScreenY + 16}
                      fontSize={13}
                      fontWeight="bold"
                      fill="#ff5252"
                      stroke="none"
                      textAnchor="middle"
                    >
                      {e.label}: {e.value} {e.units}
                    </text>
                  </g>
                );
              }

              if (e.axis === "z") {
                const dimXmm = doc.bounds.maxX + 60;
                const dimScreenX = transform.engToScreenX(dimXmm);
                const screenY1 = transform.engToScreenY(e.from.y);
                const screenY2 = transform.engToScreenY(e.to.y);
                const extLeftX = transform.engToScreenX(doc.bounds.maxX - 10);
                const extRightX = transform.engToScreenX(doc.bounds.maxX + 80);

                return (
                  <g key={e.id} stroke="#ff5252" strokeWidth={1.5} fill="#ff5252">
                    {/* Extension lines */}
                    <line x1={extLeftX} y1={screenY1} x2={extRightX} y2={screenY1} stroke="#555566" strokeWidth={1} />
                    <line x1={extLeftX} y1={screenY2} x2={extRightX} y2={screenY2} stroke="#555566" strokeWidth={1} />
                    {/* Main Dimension Line */}
                    <line x1={dimScreenX} y1={screenY1} x2={dimScreenX} y2={screenY2} stroke="#ff5252" strokeWidth={1.5} />
                    <circle cx={dimScreenX} cy={screenY1} r={3} />
                    <circle cx={dimScreenX} cy={screenY2} r={3} />
                    <text
                      x={dimScreenX + 10}
                      y={(screenY1 + screenY2) / 2}
                      fontSize={13}
                      fontWeight="bold"
                      fill="#ff5252"
                      stroke="none"
                      textAnchor="start"
                      dominantBaseline="central"
                    >
                      {e.label}: {e.value} {e.units}
                    </text>
                  </g>
                );
              }
            }

            return null;
          })}
        </svg>
      </div>

      {/* Footer Info Bar */}
      <div
        style={{
          padding: "6px 16px",
          background: "#1c1c22",
          borderTop: "1px solid #2a2a35",
          fontSize: 12,
          color: "#888",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          整体外形尺寸: 宽 {doc.bounds.maxX - doc.bounds.minX} mm × 高 {doc.bounds.maxY - doc.bounds.minY} mm
        </span>
        <span>
          图元对象数: {doc.entities.length} 个 | 鼠标按住拖拽平移，滚轮缩放
        </span>
      </div>
    </div>
  );
}
