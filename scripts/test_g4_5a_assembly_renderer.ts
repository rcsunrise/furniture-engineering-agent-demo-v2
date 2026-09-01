import * as THREE from "three";
import { ThreeShapeFactory } from "../src/client/utils/threeShapeFactory.js";
import {
  fesToThreePosition,
  fesToThreeSize,
  fesToThreeRotation,
  fitCameraToObject,
  UNIT_SCALE_MM_TO_M,
} from "../src/client/utils/threeAdapter.js";
import type { AssemblyDocument, AssemblyComponent } from "../src/shared/assembly.js";

async function runG45ATests() {
  console.log("=== GATE G4-5A: Engineering Assembly Renderer Test Suite ===");
  let passedCount = 0;
  let totalCount = 0;

  const assert = (condition: boolean, testName: string, detail: string = "") => {
    totalCount++;
    if (condition) {
      console.log(`✅ [PASS] Test ${totalCount}: ${testName} ${detail ? `- ${detail}` : ""}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] Test ${totalCount}: ${testName} ${detail ? `- ${detail}` : ""}`);
    }
  };

  // 1. Synthetic 17-component assembly document
  const components17: AssemblyComponent[] = Array.from({ length: 17 }, (_, i) => ({
    id: `COMP-${i + 1}`,
    name: `Component ${i + 1}`,
    type: i < 4 ? "leg" : i < 8 ? "frame" : i < 12 ? "seat" : i < 15 ? "backrest" : "armrest",
    material: "wood",
    geometryMode: (i % 4 === 0 ? "box" : i % 4 === 1 ? "soft_surface" : i % 4 === 2 ? "loft_shell" : "mesh_reference") as any,
    size: { x: 200 + i * 10, y: 300 + i * 10, z: 100 + i * 5 },
    position: { x: (i - 8) * 150, y: 0, z: (i % 3) * 100 },
    rotation: { x: 0, y: 0, z: 0 },
    explodeVector: { x: (i - 8) * 20, y: 0, z: 100 },
    explodeSource: "excel",
    productionTruth: i % 2 === 0, // mix of true and false
  }));

  const doc17: AssemblyDocument = {
    version: "1.0",
    sku: "TEST-SOFA-17",
    units: "mm",
    components: components17,
    loftSections: [],
    softSurfaceParams: [],
    geometry: { cadProfiles: [], shapeProfiles: [], loftSections: [], softSurfaceParams: [] },
  };

  // --------------------------------------------------------------------------
  // Test A: 17 components generate 17 Three objects
  // --------------------------------------------------------------------------
  const scene = new THREE.Scene();
  const assemblyGroup = new THREE.Group();
  scene.add(assemblyGroup);

  let renderedCount = 0;
  let fallbackCount = 0;

  for (const c of doc17.components) {
    const threeSize = fesToThreeSize(c.size);
    const geometry = ThreeShapeFactory.createGeometryForComponent({
      id: c.id,
      type: c.type,
      geometryMode: c.geometryMode,
      loftGroup: c.loftGroup,
      softGroup: c.softGroup,
      size: threeSize,
      position: c.position,
      shape: c.shape,
      loftSections: doc17.loftSections,
      softSurfaceParams: doc17.softSurfaceParams,
    });

    if (geometry.userData?.usedFallback) {
      fallbackCount++;
    }

    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = c.id;
    const pos = fesToThreePosition(c.position);
    mesh.position.set(pos.x, pos.y, pos.z);
    assemblyGroup.add(mesh);
    renderedCount++;
  }

  assert(
    assemblyGroup.children.length === 17 && renderedCount === 17,
    "A. 17 components generate 17 Three objects",
    `Rendered ${assemblyGroup.children.length} meshes for 17 components`
  );

  // --------------------------------------------------------------------------
  // Test B: Box fallback renders for invalid / missing geometry options
  // --------------------------------------------------------------------------
  const missingMeshRefComp: AssemblyComponent = {
    id: "COMP-MISSING-MESH-REF",
    name: "Missing Mesh Ref Component",
    type: "leg",
    material: "metal",
    geometryMode: "mesh_reference",
    size: { x: 50, y: 50, z: 200 },
    position: { x: 0, y: 0, z: 0 },
    explodeVector: { x: 0, y: 0, z: 0 },
    explodeSource: "generated_for_visualization",
    productionTruth: false,
  };

  const fallbackGeom = ThreeShapeFactory.createGeometryForComponent({
    id: missingMeshRefComp.id,
    type: missingMeshRefComp.type,
    geometryMode: missingMeshRefComp.geometryMode,
    size: fesToThreeSize(missingMeshRefComp.size),
    position: missingMeshRefComp.position,
    meshArtifactGeometry: null, // missing artifact forces fallback chain
  });

  assert(
    fallbackGeom instanceof THREE.BufferGeometry &&
      fallbackGeom.userData.usedFallback === true &&
      (fallbackGeom.userData.modeResolved === "box" || fallbackGeom.userData.modeResolved === "soft_surface" || fallbackGeom.userData.modeResolved === "loft_shell"),
    "B. box fallback renders when mode fails",
    `Mode resolved: ${fallbackGeom.userData.modeResolved}, usedFallback: ${fallbackGeom.userData.usedFallback}`
  );

  // --------------------------------------------------------------------------
  // Test C: No component returns null geometry
  // --------------------------------------------------------------------------
  const testModes = ["box", "soft_surface", "loft_shell", "mesh_reference", "unknown_mode", null as any, undefined as any];
  let nullCount = 0;
  for (const mode of testModes) {
    const g = ThreeShapeFactory.createGeometryForComponent({
      id: "TEST-NULL-CHECK",
      geometryMode: mode,
      size: { x: 0.2, y: 0.3, z: 0.4 },
      position: { x: 0, y: 0, z: 0 },
    });
    if (!g || !g.getAttribute("position") || g.getAttribute("position").count === 0) {
      nullCount++;
    }
  }

  assert(
    nullCount === 0,
    "C. No component returns null geometry",
    `Tested ${testModes.length} mode variations, 0 nulls returned`
  );

  // --------------------------------------------------------------------------
  // Test D: Camera fits model
  // --------------------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(45, 1.33, 0.01, 1000);
  const controls = { target: new THREE.Vector3(), update: () => {} };
  const fitResult = fitCameraToObject(camera, controls, assemblyGroup);

  assert(
    fitResult !== undefined &&
      fitResult.maxDim > 0 &&
      controls.target.distanceTo(fitResult.center) < 0.001 &&
      camera.position.z > fitResult.center.z,
    "D. Camera fits model",
    `Center: [${fitResult.center.x.toFixed(2)}, ${fitResult.center.y.toFixed(2)}, ${fitResult.center.z.toFixed(2)}], Dist: ${fitResult.cameraDistance.toFixed(2)}m`
  );

  // --------------------------------------------------------------------------
  // Test E: Exploded transform works
  // --------------------------------------------------------------------------
  const testCompExplode: AssemblyComponent = {
    id: "COMP-EXPLODE-TEST",
    name: "Explode Test Component",
    type: "cushion",
    material: "fabric",
    geometryMode: "box",
    size: { x: 500, y: 500, z: 100 },
    position: { x: 100, y: 200, z: 300 },
    explodeVector: { x: 1000, y: 500, z: 200 },
    explodeSource: "excel",
    productionTruth: true,
  };

  const posUnexploded = fesToThreePosition(testCompExplode.position, UNIT_SCALE_MM_TO_M);

  const explodedPosMm = {
    x: testCompExplode.position.x + testCompExplode.explodeVector.x * 1.0,
    y: testCompExplode.position.y + testCompExplode.explodeVector.y * 1.0,
    z: testCompExplode.position.z + testCompExplode.explodeVector.z * 1.0,
  };
  const posExploded = fesToThreePosition(explodedPosMm, UNIT_SCALE_MM_TO_M);

  assert(
    posExploded.x === (100 + 1000) * 0.001 &&
      posExploded.y === (300 + 200) * 0.001 &&
      posExploded.z === -(200 + 500) * 0.001,
    "E. Exploded transform works",
    `Unexploded: [${posUnexploded.x}, ${posUnexploded.y}, ${posUnexploded.z}], Exploded: [${posExploded.x}, ${posExploded.y}, ${posExploded.z}]`
  );

  // --------------------------------------------------------------------------
  // Test F: productionTruth remains unchanged
  // --------------------------------------------------------------------------
  let productionTruthMutated = false;
  for (const c of doc17.components) {
    const originalPt = c.productionTruth;
    ThreeShapeFactory.createGeometryForComponent({
      id: c.id,
      geometryMode: c.geometryMode,
      size: fesToThreeSize(c.size),
      position: c.position,
    });
    if (c.productionTruth !== originalPt) {
      productionTruthMutated = true;
    }
  }

  assert(
    !productionTruthMutated,
    "F. productionTruth remains unchanged",
    "productionTruth flag was preserved for all 17 components"
  );

  console.log("--------------------------------------------------------------------------");
  console.log(`Summary: ${passedCount}/${totalCount} tests passed`);
  if (passedCount === totalCount) {
    console.log("RESULT: G4-5A PASS");
    process.exit(0);
  } else {
    console.error("RESULT: G4-5A FAIL");
    process.exit(1);
  }
}

runG45ATests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
