import type { CadDocument, CadEntity, PathCommand } from "../../shared/cad.js";

/**
 * Utility to sample quadratic and cubic Bezier curves into discrete line points for DXF polylines.
 */
function samplePathCommandsToPoints(commands: PathCommand[], segmentsPerCurve = 16): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  let currX = 0;
  let currY = 0;

  for (const cmd of commands) {
    if (cmd.type === "moveTo") {
      currX = cmd.x;
      currY = cmd.y;
      points.push({ x: currX, y: currY });
    } else if (cmd.type === "lineTo") {
      currX = cmd.x;
      currY = cmd.y;
      points.push({ x: currX, y: currY });
    } else if (cmd.type === "quadraticTo") {
      const p0x = currX, p0y = currY;
      const p1x = cmd.cpx, p1y = cmd.cpy;
      const p2x = cmd.x, p2y = cmd.y;

      for (let i = 1; i <= segmentsPerCurve; i++) {
        const t = i / segmentsPerCurve;
        const mt = 1 - t;
        const x = mt * mt * p0x + 2 * mt * t * p1x + t * t * p2x;
        const y = mt * mt * p0y + 2 * mt * t * p1y + t * t * p2y;
        points.push({ x, y });
      }
      currX = p2x;
      currY = p2y;
    } else if (cmd.type === "cubicTo") {
      const p0x = currX, p0y = currY;
      const p1x = cmd.cp1x, p1y = cmd.cp1y;
      const p2x = cmd.cp2x, p2y = cmd.cp2y;
      const p3x = cmd.x, p3y = cmd.y;

      for (let i = 1; i <= segmentsPerCurve; i++) {
        const t = i / segmentsPerCurve;
        const mt = 1 - t;
        const x = mt * mt * mt * p0x + 3 * mt * mt * t * p1x + 3 * mt * t * t * p2x + t * t * t * p3x;
        const y = mt * mt * mt * p0y + 3 * mt * mt * t * p1y + 3 * mt * t * t * p2y + t * t * t * p3y;
        points.push({ x, y });
      }
      currX = p3x;
      currY = p3y;
    }
  }

  return points;
}

/**
 * Export CAD Document to DXF format (AutoCAD R2000 AC1015 DXF Standard).
 * DXF is the open ASCII format natively used for DWG exchange across all CAD software.
 */
export function exportCadToDxf(doc: CadDocument): string {
  const lines: string[] = [];

  const add = (group: number, val: string | number) => {
    lines.push(group.toString().padStart(3, " "));
    lines.push(val.toString());
  };

  // 1. HEADER SECTION
  add(0, "SECTION");
  add(2, "HEADER");
  add(9, "$ACADVER");
  add(1, "AC1015"); // AutoCAD 2000 format
  add(9, "$INSUNITS");
  add(70, 4); // 4 = Millimeters
  add(0, "ENDSEC");

  // 2. TABLES SECTION (Layers & Colors)
  add(0, "SECTION");
  add(2, "TABLES");
  add(0, "TABLE");
  add(2, "LAYER");
  add(70, 7);

  const layerColors: Record<string, number> = {
    OUTER_PROFILE: 5,   // Blue
    SEAM: 8,            // Gray
    INNER_CONTOUR: 3,   // Green
    PIPING: 2,          // Yellow
    MODULE_DIVIDER: 1,  // Red
    DIMENSION: 1,       // Red
    TEXT: 7,            // White/Black
  };

  for (const [layerName, colorCode] of Object.entries(layerColors)) {
    add(0, "LAYER");
    add(2, layerName);
    add(70, 0);
    add(62, colorCode);
    add(6, "CONTINUOUS");
  }

  add(0, "ENDTAB");
  add(0, "ENDSEC");

  // 3. ENTITIES SECTION
  add(0, "SECTION");
  add(2, "ENTITIES");

  for (const entity of doc.entities) {
    const layer = entity.layer || "OUTER_PROFILE";

    if (entity.type === "path") {
      const isClosed = entity.commands.some((c) => c.type === "close");
      const pts = samplePathCommandsToPoints(entity.commands);

      if (pts.length >= 2) {
        add(0, "LWPOLYLINE");
        add(8, layer);
        add(90, pts.length);
        add(70, isClosed ? 1 : 0); // 1 = Closed polyline

        for (const pt of pts) {
          add(10, pt.x.toFixed(3));
          add(20, pt.y.toFixed(3));
        }
      }
    } else if (entity.type === "line") {
      add(0, "LINE");
      add(8, layer);
      add(10, entity.x1.toFixed(3));
      add(20, entity.y1.toFixed(3));
      add(30, 0.0);
      add(11, entity.x2.toFixed(3));
      add(21, entity.y2.toFixed(3));
      add(31, 0.0);
    } else if (entity.type === "dimension") {
      // Main Dimension Line
      add(0, "LINE");
      add(8, "DIMENSION");
      add(10, entity.from.x.toFixed(3));
      add(20, entity.from.y.toFixed(3));
      add(30, 0.0);
      add(11, entity.to.x.toFixed(3));
      add(21, entity.to.y.toFixed(3));
      add(31, 0.0);

      // Dimension Text Label
      const midX = (entity.from.x + entity.to.x) / 2;
      const midY = (entity.from.y + entity.to.y) / 2 + 15;
      add(0, "TEXT");
      add(8, "DIMENSION");
      add(10, midX.toFixed(3));
      add(20, midY.toFixed(3));
      add(30, 0.0);
      add(40, 20.0); // Text height in mm
      add(1, `${Math.round(entity.value)} mm`);
    } else if (entity.type === "text") {
      add(0, "TEXT");
      add(8, layer);
      add(10, entity.x.toFixed(3));
      add(20, entity.y.toFixed(3));
      add(30, 0.0);
      add(40, (entity as any).fontSize || 16.0);
      add(1, entity.text);
    }
  }

  add(0, "ENDSEC");
  add(0, "EOF");

  return lines.join("\n");
}

/**
 * Export CAD Document to standalone SVG vector file.
 */
export function exportCadToSvg(doc: CadDocument): string {
  const margin = 100;
  const minX = doc.bounds.minX - margin;
  const minY = doc.bounds.minY - margin;
  const width = Math.max(200, doc.bounds.maxX - doc.bounds.minX + margin * 2);
  const height = Math.max(200, doc.bounds.maxY - doc.bounds.minY + margin * 2);

  const svgParts: string[] = [];
  svgParts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${(-doc.bounds.maxY - margin).toFixed(
      1
    )} ${width.toFixed(1)} ${height.toFixed(1)}" width="${width}mm" height="${height}mm">`
  );
  svgParts.push(`  <style>`);
  svgParts.push(`    .OUTER_PROFILE { stroke: #1e88e5; stroke-width: 2px; fill: none; }`);
  svgParts.push(`    .SEAM { stroke: #b0bec5; stroke-width: 1.2px; stroke-dasharray: 4,4; fill: none; }`);
  svgParts.push(`    .INNER_CONTOUR { stroke: #81c784; stroke-width: 1.5px; fill: none; }`);
  svgParts.push(`    .PIPING { stroke: #ffb74d; stroke-width: 2.5px; fill: none; }`);
  svgParts.push(`    .MODULE_DIVIDER { stroke: #ef5350; stroke-width: 2px; stroke-dasharray: 8,4; fill: none; }`);
  svgParts.push(`    .DIMENSION { stroke: #ff5252; stroke-width: 1.5px; fill: none; font-size: 14px; fill: #ff5252; }`);
  svgParts.push(`    text { font-family: monospace, sans-serif; font-size: 14px; fill: #ffffff; }`);
  svgParts.push(`  </style>`);
  svgParts.push(`  <rect x="${minX}" y="${-doc.bounds.maxY - margin}" width="${width}" height="${height}" fill="#18181c" />`);

  for (const entity of doc.entities) {
    const layer = entity.layer || "OUTER_PROFILE";

    if (entity.type === "path") {
      const dParts: string[] = [];
      for (const cmd of entity.commands) {
        if (cmd.type === "moveTo") dParts.push(`M ${cmd.x.toFixed(2)} ${(-cmd.y).toFixed(2)}`);
        else if (cmd.type === "lineTo") dParts.push(`L ${cmd.x.toFixed(2)} ${(-cmd.y).toFixed(2)}`);
        else if (cmd.type === "quadraticTo")
          dParts.push(`Q ${cmd.cpx.toFixed(2)} ${(-cmd.cpy).toFixed(2)} ${cmd.x.toFixed(2)} ${(-cmd.y).toFixed(2)}`);
        else if (cmd.type === "cubicTo")
          dParts.push(
            `C ${cmd.cp1x.toFixed(2)} ${(-cmd.cp1y).toFixed(2)} ${cmd.cp2x.toFixed(2)} ${(-cmd.cp2y).toFixed(2)} ${cmd.x.toFixed(2)} ${(-cmd.y).toFixed(2)}`
          );
        else if (cmd.type === "close") dParts.push("Z");
      }
      svgParts.push(`  <path class="${layer}" d="${dParts.join(" ")}" />`);
    } else if (entity.type === "line") {
      svgParts.push(
        `  <line class="${layer}" x1="${entity.x1.toFixed(2)}" y1="${(-entity.y1).toFixed(2)}" x2="${entity.x2.toFixed(2)}" y2="${(-entity.y2).toFixed(2)}" />`
      );
    } else if (entity.type === "dimension") {
      const x1 = entity.from.x.toFixed(2);
      const y1 = (-entity.from.y).toFixed(2);
      const x2 = entity.to.x.toFixed(2);
      const y2 = (-entity.to.y).toFixed(2);
      const midX = ((entity.from.x + entity.to.x) / 2).toFixed(2);
      const midY = ((-entity.from.y - entity.to.y) / 2 - 10).toFixed(2);

      svgParts.push(`  <g class="DIMENSION">`);
      svgParts.push(`    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`);
      svgParts.push(`    <text x="${midX}" y="${midY}" text-anchor="middle">${Math.round(entity.value)} mm</text>`);
      svgParts.push(`  </g>`);
    } else if (entity.type === "text") {
      svgParts.push(`  <text x="${entity.x.toFixed(2)}" y="${(-entity.y).toFixed(2)}" text-anchor="middle">${entity.text}</text>`);
    }
  }

  svgParts.push(`</svg>`);
  return svgParts.join("\n");
}

/**
 * Trigger browser file download for a generated string or Blob.
 */
export function triggerFileDownload(content: string | Blob, fileName: string, mimeType: string) {
  const blob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
