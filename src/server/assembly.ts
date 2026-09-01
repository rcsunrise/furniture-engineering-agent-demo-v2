import type { FurnitureEngineeringData } from "../shared/fes.js";
import type { AssemblyDocument, AssemblyComponent } from "../shared/assembly.js";

/**
 * Deterministically constructs an Assembly Graph Document from Furniture Engineering Data (FES).
 * NEVER calls AI or LLM.
 */
export function buildAssembly(fes: FurnitureEngineeringData): AssemblyDocument {
  const components: AssemblyComponent[] = fes.components.map((c) => {
    const hasExplicitExplode =
      c.explode && (c.explode.x !== 0 || c.explode.y !== 0 || c.explode.z !== 0);

    let explodeVector = { x: 0, y: 0, z: 0 };
    let explodeSource: "excel" | "generated_for_visualization" = "excel";
    let productionTruth = true;

    if (hasExplicitExplode) {
      explodeVector = { x: c.explode.x, y: c.explode.y, z: c.explode.z };
      explodeSource = "excel";
      productionTruth = true;
    } else {
      explodeVector = computeDefaultExplodeVector(c);
      explodeSource = "generated_for_visualization";
      productionTruth = false;
    }

    return {
      id: c.id,
      name: c.name,
      type: c.type,
      material: c.material || "Standard",
      geometryMode: c.geometryMode,
      loftGroup: c.loftGroup,
      softGroup: c.softGroup,
      size: {
        x: c.size.x,
        y: c.size.y,
        z: c.size.z,
      },
      position: {
        x: c.position.x,
        y: c.position.y,
        z: c.position.z,
      },
      rotation: c.rotation,
      profiles: c.profiles,
      explodeVector,
      explodeSource,
      productionTruth,
      shape: c.shape,
    };
  });

  return {
    version: "1.0",
    sku: fes.sku,
    units: "mm",
    components,
    loftSections: fes.loftSections || [],
    softSurfaceParams: fes.softSurfaceParams || [],
    geometry: {
      cadProfiles: fes.cadProfiles || [],
      shapeProfiles: fes.shapeProfiles || [],
      loftSections: fes.loftSections || [],
      softSurfaceParams: fes.softSurfaceParams || [],
      topology2D: fes.topology2D || [],
    },
  };
}

function computeDefaultExplodeVector(c: {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number; z: number };
}): { x: number; y: number; z: number } {
  const idUpper = c.id.toUpperCase();
  const nameUpper = c.name.toUpperCase();
  const type = c.type.toLowerCase();

  // Armrests / Arms
  if (
    type === "armrest" ||
    idUpper.includes("ARM") ||
    idUpper.includes("HAND") ||
    nameUpper.includes("ARM") ||
    nameUpper.includes("扶手")
  ) {
    if (idUpper.includes("LEFT") || idUpper.includes("-L") || idUpper.includes("_L") || c.position.x < 0) {
      return { x: -300, y: 0, z: 0 };
    }
    return { x: 300, y: 0, z: 0 };
  }

  // Seat
  if (type === "seat" || idUpper.includes("SEAT") || nameUpper.includes("座")) {
    return { x: 0, y: 0, z: 250 };
  }

  // Backrest
  if (type === "backrest" || idUpper.includes("BACK") || nameUpper.includes("靠背") || nameUpper.includes("椅背")) {
    return { x: 0, y: 300, z: 200 };
  }

  // Legs
  if (type === "leg" || idUpper.includes("LEG") || nameUpper.includes("脚") || nameUpper.includes("腿")) {
    const xDirection = c.position.x < 0 ? -100 : c.position.x > 0 ? 100 : 0;
    const yDirection = c.position.y < 0 ? -100 : c.position.y > 0 ? 100 : 0;
    return { x: xDirection, y: yDirection, z: -250 };
  }

  // Frame
  if (type === "frame" || idUpper.includes("FRAME") || nameUpper.includes("框架") || nameUpper.includes("底座")) {
    return { x: 0, y: -200, z: -150 };
  }

  // Foam
  if (type === "foam" || idUpper.includes("FOAM")) {
    return { x: 0, y: 0, z: 180 };
  }

  // Fabric / Cushion cover
  if (type === "fabric" || idUpper.includes("FABRIC")) {
    return { x: 0, y: 0, z: 220 };
  }

  // Hardware / Other
  if (type === "hardware" || idUpper.includes("HW") || idUpper.includes("SCREW")) {
    return { x: 0, y: 0, z: -100 };
  }

  // General default fallback based on position
  const xExplode = c.position.x < -50 ? -200 : c.position.x > 50 ? 200 : 0;
  const zExplode = c.position.z < 100 ? -150 : 200;
  return { x: xExplode, y: 0, z: zExplode };
}
