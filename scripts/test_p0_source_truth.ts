import { evaluateComponentDiagnostics } from "../src/client/utils/geometryBuilders/geometryDiagnostics.js";
import type { FurnitureEngineeringData, ComponentObservation } from "../src/shared/fes.js";

console.log("=== P0 GeometrySource Truth & Provenance Verification Test ===");

const mockFesWithoutLoftData: FurnitureEngineeringData = {
  sku: "TEST-TRUTH-01",
  productType: "sofa",
  overall: { width: 2000, depth: 900, height: 800 },
  units: "mm",
  components: [],
  cadProfiles: [],
  shapeProfiles: [],
  loftSections: [],
  softSurfaceParams: [],
};

const mockArmCompWithFakeLoftMode: ComponentObservation = {
  id: "ARM-L",
  name: "Left Armrest",
  type: "armrest",
  geometryMode: "loft_shell",
  loftGroup: "NON_EXISTENT_LOFT_GROUP",
  size: { x: 200, y: 800, z: 600 },
  position: { x: -900, y: 0, z: 300 },
  explode: { x: 0, y: 0, z: 0 },
};

// Test 1: Fake loftGroup must return proxy_fallback / box_geometry, NOT workbook_loft
const diag1 = evaluateComponentDiagnostics(mockArmCompWithFakeLoftMode, mockFesWithoutLoftData);
console.log("1. Testing Fake Loft Mode without matching loftSections:");
console.log("   Evaluated Source:", diag1.geometrySource);
if (diag1.geometrySource !== "workbook_loft") {
  console.log("   -> PASS: Correctly rejected fake workbook_loft");
} else {
  console.error("   -> FAIL: Erroneously reported workbook_loft without matching sections!");
  process.exit(1);
}

// Test 2: Matching loftGroup must return workbook_loft
const mockFesWithRealLoftData: FurnitureEngineeringData = {
  ...mockFesWithoutLoftData,
  loftSections: [
    {
      loftGroup: "REAL_ARM_GROUP",
      sectionT: 0.0,
      widthScale: 1.0,
      heightScale: 1.0,
    },
  ],
};

const mockArmCompWithRealLoftGroup: ComponentObservation = {
  ...mockArmCompWithFakeLoftMode,
  loftGroup: "REAL_ARM_GROUP",
};

const diag2 = evaluateComponentDiagnostics(mockArmCompWithRealLoftGroup, mockFesWithRealLoftData);
console.log("\n2. Testing Real Loft Mode with matching loftSections:");
console.log("   Evaluated Source:", diag2.geometrySource);
if (diag2.geometrySource === "workbook_loft") {
  console.log("   -> PASS: Correctly evaluated workbook_loft");
} else {
  console.error("   -> FAIL: Expected workbook_loft but got:", diag2.geometrySource);
  process.exit(1);
}

console.log("\n=== ALL P0 GEOMETRY SOURCE TRUTH TESTS PASSED ===");
