import type { FurnitureEngineeringData } from "../../shared/fes.js";
import type { CadDocument, CadEntity, CadLayer } from "../../shared/cad.js";
import { resolveComponentCadWires } from "./profileResolver.js";
import { buildStructuralSeams } from "./seamBuilder.js";

/**
 * Builds the complete multi-layer CAD Document for a requested view projection.
 */
export function buildCadViewProjection(
  fes: FurnitureEngineeringData,
  view: "front" | "side" | "top" = "front"
): CadDocument {
  const width = fes.overall.width;
  const depth = fes.overall.depth;
  const height = fes.overall.height;

  let minX = -width / 2;
  let maxX = width / 2;
  let minY = 0;
  let maxY = height;

  if (view === "side") {
    minX = -depth / 2;
    maxX = depth / 2;
    minY = 0;
    maxY = height;
  } else if (view === "top") {
    minX = -width / 2;
    maxX = width / 2;
    minY = -depth / 2;
    maxY = depth / 2;
  }

  const entities: CadEntity[] = [];

  // 1. Product Outline
  const boundW = maxX - minX;
  const boundH = maxY - minY;
  entities.push({
    type: "rect",
    id: `product:outline:${view}`,
    layer: "PRODUCT_OUTLINE",
    x: minX,
    y: minY,
    width: boundW,
    height: boundH,
    sourceEntityId: "product:overall",
  });

  // 2. Component Multi-Layer Wires
  const cadProfiles = fes.cadProfiles || [];
  const shapeProfiles = fes.shapeProfiles || [];
  let anyFallback = false;

  for (const c of fes.components) {
    const { paths, fallback } = resolveComponentCadWires(c, cadProfiles, shapeProfiles, view);
    if (fallback) anyFallback = true;

    let idx = 0;
    for (const p of paths) {
      entities.push({
        type: "path",
        id: `component:${c.id}:${view}:${p.role}:${idx++}`,
        layer: p.layer,
        pathRole: p.role,
        role: p.role,
        commands: p.commands,
        componentId: c.id,
        componentType: c.type,
        sourceEntityId: c.id,
        profileFallback: fallback,
        geometrySource: p.geometrySource,
        matchedProfileId: p.matchedProfileId,
        source: p.geometrySource,
      });
    }
  }

  // 3. Structural Module Divider Seams
  const seamEntities = buildStructuralSeams(fes, view);
  entities.push(...seamEntities);

  // 4. Dimensions
  if (view === "front") {
    entities.push({
      type: "dimension",
      id: "dimension:overall-width:front",
      layer: "DIMENSION",
      axis: "x",
      from: { x: minX, y: 0 },
      to: { x: maxX, y: 0 },
      value: width,
      units: "mm",
      label: `${width}`,
    });
    entities.push({
      type: "dimension",
      id: "dimension:overall-height:front",
      layer: "DIMENSION",
      axis: "z",
      from: { x: maxX, y: 0 },
      to: { x: maxX, y: height },
      value: height,
      units: "mm",
      label: `${height}`,
    });
  } else if (view === "side") {
    entities.push({
      type: "dimension",
      id: "dimension:overall-depth:side",
      layer: "DIMENSION",
      axis: "y",
      from: { x: minX, y: 0 },
      to: { x: maxX, y: 0 },
      value: depth,
      units: "mm",
      label: `${depth}`,
    });
    entities.push({
      type: "dimension",
      id: "dimension:overall-height:side",
      layer: "DIMENSION",
      axis: "z",
      from: { x: maxX, y: 0 },
      to: { x: maxX, y: height },
      value: height,
      units: "mm",
      label: `${height}`,
    });
  } else if (view === "top") {
    entities.push({
      type: "dimension",
      id: "dimension:overall-width:top",
      layer: "DIMENSION",
      axis: "x",
      from: { x: minX, y: minY },
      to: { x: maxX, y: minY },
      value: width,
      units: "mm",
      label: `${width}`,
    });
    entities.push({
      type: "dimension",
      id: "dimension:overall-depth:top",
      layer: "DIMENSION",
      axis: "y",
      from: { x: maxX, y: minY },
      to: { x: maxX, y: maxY },
      value: depth,
      units: "mm",
      label: `${depth}`,
    });
  }

  const layers: CadLayer[] = [
    { id: "PRODUCT_OUTLINE", visible: true },
    { id: "COMPONENT_OUTLINE", visible: true },
    { id: "INNER_CONTOUR", visible: true },
    { id: "SEAM", visible: true },
    { id: "PIPING", visible: true },
    { id: "MODULE_DIVIDER", visible: true },
    { id: "DIMENSION", visible: true },
    { id: "ANNOTATION", visible: true },
    { id: "COMPONENT", visible: true },
  ];

  return {
    version: "1.0",
    units: "mm",
    view,
    sourceSku: fes.sku,
    bounds: { minX, maxX, minY, maxY },
    layers,
    entities,
    profileFallback: anyFallback,
    metadata: {
      productType: fes.productType,
      componentCount: fes.components.length,
      cadProfileCount: cadProfiles.length,
    },
  };
}
