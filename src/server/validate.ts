import type {
  FurnitureEngineeringData,
  EngineeringValidationReport,
  ValidationIssue,
} from "../shared/fes.js";

/**
 * Deterministic Engineering Validator for FES 1.0
 *
 * Coordinate Convention:
 * - Units: mm
 * - X: Left - Right (Product Center X = 0, Range: [-width / 2, +width / 2])
 * - Y: Front - Back (Product Center Y = 0, Range: [-depth / 2, +depth / 2])
 * - Z: Up - Down   (Product Bottom Z = 0, Product Top Z = overall.height, Range: [0, height])
 * - component.position: Center coordinates of component bounding box
 */
export function validateEngineeringData(fes: FurnitureEngineeringData): EngineeringValidationReport {
  const issues: ValidationIssue[] = [];

  const width = fes.overall.width;
  const depth = fes.overall.depth;
  const height = fes.overall.height;

  // 1. Overall Dimensions
  if (width <= 0) {
    issues.push({
      code: "INVALID_OVERALL_DIMENSION",
      severity: "error",
      field: "overall.width",
      message: `overall.width must be > 0, received ${width}`,
      actual: width,
      expected: "> 0",
    });
  }
  if (depth <= 0) {
    issues.push({
      code: "INVALID_OVERALL_DIMENSION",
      severity: "error",
      field: "overall.depth",
      message: `overall.depth must be > 0, received ${depth}`,
      actual: depth,
      expected: "> 0",
    });
  }
  if (height <= 0) {
    issues.push({
      code: "INVALID_OVERALL_DIMENSION",
      severity: "error",
      field: "overall.height",
      message: `overall.height must be > 0, received ${height}`,
      actual: height,
      expected: "> 0",
    });
  }

  // 2. Empty Components
  if (!fes.components || fes.components.length === 0) {
    issues.push({
      code: "NO_COMPONENTS",
      severity: "error",
      message: "Product has no components",
    });
  }

  // 3. Duplicate IDs & Component Boundary Checks
  const seenIds = new Set<string>();

  const allowedMinX = -width / 2;
  const allowedMaxX = width / 2;
  const allowedMinY = -depth / 2;
  const allowedMaxY = depth / 2;
  const allowedMinZ = 0;
  const allowedMaxZ = height;

  for (const c of fes.components || []) {
    // Duplicate ID check
    if (seenIds.has(c.id)) {
      issues.push({
        code: "DUPLICATE_COMPONENT_ID",
        severity: "error",
        componentId: c.id,
        message: `Duplicate component ID found: ${c.id}`,
        actual: c.id,
      });
    } else {
      seenIds.add(c.id);
    }

    // Component zero / negative size check
    if (c.size.x <= 0 || c.size.y <= 0 || c.size.z <= 0) {
      issues.push({
        code: "COMPONENT_ZERO_DIMENSION",
        severity: "error",
        componentId: c.id,
        field: "size",
        message: `Component '${c.id}' dimensions must be > 0. Received size (${c.size.x}, ${c.size.y}, ${c.size.z})`,
        actual: c.size,
        expected: "All dimensions > 0",
      });
    }

    // Suspicious Component Size check
    if (c.size.x > width || c.size.y > depth || c.size.z > height) {
      issues.push({
        code: "COMPONENT_LARGER_THAN_PRODUCT",
        severity: "error",
        componentId: c.id,
        field: "size",
        message: `Component '${c.id}' size (${c.size.x}, ${c.size.y}, ${c.size.z}) exceeds product overall dimensions (${width}, ${depth}, ${height})`,
        actual: c.size,
        expected: { maxWidth: width, maxDepth: depth, maxHeight: height },
      });
    }

    // Boundary Checks (only check bounds if size is > 0)
    if (c.size.x > 0 && c.size.y > 0 && c.size.z > 0) {
      // X Boundary
      const minX = c.position.x - c.size.x / 2;
      const maxX = c.position.x + c.size.x / 2;
      if (minX < allowedMinX || maxX > allowedMaxX) {
        issues.push({
          code: "COMPONENT_OUT_OF_BOUNDS_X",
          severity: "error",
          componentId: c.id,
          field: "position.x",
          message: `Component '${c.id}' X bounds [${minX}, ${maxX}] exceed allowed product X range [${allowedMinX}, ${allowedMaxX}]`,
          actual: { minX, maxX },
          expected: { allowedMinX, allowedMaxX },
        });
      }

      // Y Boundary
      const minY = c.position.y - c.size.y / 2;
      const maxY = c.position.y + c.size.y / 2;
      if (minY < allowedMinY || maxY > allowedMaxY) {
        issues.push({
          code: "COMPONENT_OUT_OF_BOUNDS_Y",
          severity: "error",
          componentId: c.id,
          field: "position.y",
          message: `Component '${c.id}' Y bounds [${minY}, ${maxY}] exceed allowed product Y range [${allowedMinY}, ${allowedMaxY}]`,
          actual: { minY, maxY },
          expected: { allowedMinY, allowedMaxY },
        });
      }

      // Z Boundary
      const minZ = c.position.z - c.size.z / 2;
      const maxZ = c.position.z + c.size.z / 2;
      if (minZ < allowedMinZ || maxZ > allowedMaxZ) {
        issues.push({
          code: "COMPONENT_OUT_OF_BOUNDS_Z",
          severity: "error",
          componentId: c.id,
          field: "position.z",
          message: `Component '${c.id}' Z bounds [${minZ}, ${maxZ}] exceed allowed product Z range [${allowedMinZ}, ${allowedMaxZ}]`,
          actual: { minZ, maxZ },
          expected: { allowedMinZ, allowedMaxZ },
        });
      }
    }
  }

  let errors = 0;
  let warnings = 0;
  let info = 0;

  for (const issue of issues) {
    if (issue.severity === "error") errors++;
    else if (issue.severity === "warning") warnings++;
    else if (issue.severity === "info") info++;
  }

  const level = errors > 0 ? "fail" : warnings > 0 ? "warning" : "pass";
  const valid = level !== "fail";

  return {
    valid,
    level,
    summary: { errors, warnings, info },
    issues,
  };
}
