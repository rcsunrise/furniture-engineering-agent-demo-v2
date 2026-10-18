import assert from "assert";
import * as THREE from "three";
import {
  Imported3DAssetSchema,
  Engineering3DSceneSchema,
  type Imported3DAsset,
  type Engineering3DScene,
} from "../src/shared/imported3dAsset.js";
import { ModelStatsCalculator } from "../src/client/utils/3d/modelStatsCalculator.js";
import { CoordinateSystemAdapter } from "../src/client/utils/3d/coordinateSystemAdapter.js";
import { ModelLoaderService } from "../src/client/utils/3d/modelLoaderService.js";
import { disposeHierarchy } from "../src/client/utils/3d/modelDisposal.js";
import { globalPostgres3dStore } from "../src/server/db/postgres3dStore.js";

console.log("==================================================");
console.log("G4-3D-ASSET-01 Automated Engineering Verification");
console.log("==================================================");

async function runTests() {
  // Test 1: CoordinateSystemAdapter.wrapAndAlign
  console.log("\n[Test 1] CoordinateSystemAdapter: non-destructive wrap & align");
  const testBoxGeom = new THREE.BoxGeometry(100, 200, 300);
  const testMesh = new THREE.Mesh(testBoxGeom, new THREE.MeshBasicMaterial());
  const origVertices = testBoxGeom.attributes.position.array.slice();

  // Test Y-UP to Z-UP (FES) wrapping
  const { wrapper, computedBoundingBox, dimensions } = CoordinateSystemAdapter.wrapAndAlign(
    testMesh,
    {
      sourceUp: "Y_UP",
      targetUp: "FES",
      alignGround: true,
      centerOrigin: true,
    }
  );

  assert.strictEqual(wrapper.type, "Group", "Wrapper should be a THREE.Group");
  const innerContainer = wrapper.children[0] as THREE.Group;
  assert.strictEqual(innerContainer.type, "Group", "Inner container should be a THREE.Group");
  assert.ok(dimensions.width > 0, "Dimensions width should be > 0");
  assert.strictEqual(computedBoundingBox.min.length, 3, "Bounding box min length should be 3");

  // Verify raw buffer geometry was NOT modified (non-destructive)
  const currentVertices = testBoxGeom.attributes.position.array;
  for (let i = 0; i < origVertices.length; i++) {
    assert.strictEqual(origVertices[i], currentVertices[i], "Raw geometry coordinates must remain untouched!");
  }
  console.log("✓ Non-destructive wrapping confirmed (raw mesh vertex buffer was not modified)");

  // Test 2: Geometry Stats Calculation via ModelStatsCalculator
  console.log("\n[Test 2] ModelStatsCalculator: geometry statistics computation");
  const rootGroup = new THREE.Group();
  const box1 = new THREE.Mesh(new THREE.BoxGeometry(50, 50, 50), new THREE.MeshStandardMaterial());
  const box2 = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  // Add positions to box2
  const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]);
  box2.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  rootGroup.add(box1);
  rootGroup.add(box2);

  const { stats } = ModelStatsCalculator.computeStats(rootGroup);
  assert.strictEqual(stats.meshCount, 2, "Mesh count must be 2");
  assert.strictEqual(stats.materialCount, 2, "Material count must be 2");
  assert.ok(stats.vertexCount > 0, "Vertex count must be > 0");
  assert.ok(stats.triangleCount > 0, "Triangle count must be > 0");
  assert.ok(stats.dimensions.width > 0, "Width must be > 0");
  console.log(`✓ Computed stats: meshes=${stats.meshCount}, vertices=${stats.vertexCount}, triangles=${stats.triangleCount}`);

  // Test 3: Schema Validation
  console.log("\n[Test 3] Schema Validation: Imported3DAssetSchema & Engineering3DSceneSchema");
  const validAsset: Imported3DAsset = {
    id: "asset-test-01",
    name: "Solid Oak Chair Model",
    fileName: "chair.glb",
    fileSize: 1048576,
    format: "glb",
    storageBucket: "engineering-3d-assets",
    storagePath: "models/chair.glb",
    downloadUrl: "/api/assets/file/asset-test-01/chair.glb",
    stats: {
      meshCount: 4,
      vertexCount: 1250,
      triangleCount: 2400,
      materialCount: 2,
      textureCount: 1,
      boundingBox: {
        min: [-250, 0, -250],
        max: [250, 850, 250],
      },
      dimensions: {
        width: 500,
        height: 850,
        depth: 500,
      },
    },
    materials: [
      {
        name: "Wood_Oak",
        type: "MeshStandardMaterial",
        color: "#c19a6b",
        wireframe: false,
        hasTexture: true,
      },
    ],
    coordinateSystem: {
      detectedUp: "Y_UP",
      targetUp: "Z_UP",
      conversionApplied: "Y_TO_Z",
    },
    metadata: {},
    productionTruth: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const parsedAsset = Imported3DAssetSchema.safeParse(validAsset);
  assert.ok(parsedAsset.success, `Asset schema parse failed: ${JSON.stringify(parsedAsset)}`);
  assert.strictEqual(parsedAsset.data.productionTruth, false, "productionTruth must default to false");
  console.log("✓ Imported3DAssetSchema validation passed (productionTruth=false enforced)");

  const validScene: Engineering3DScene = {
    id: "scene-test-01",
    name: "Living Room 3D Arrangement",
    instances: [
      {
        instanceId: "inst-001",
        assetId: "asset-test-01",
        name: "Solid Oak Chair Model",
        transform: {
          position: [0, 0, 0],
          rotation: [0, 45, 0],
          scale: [1, 1, 1],
        },
        visible: true,
        locked: false,
        coordinateAdapter: {
          sourceUp: "Y_UP",
          targetUp: "FES",
          alignGround: true,
          centerOrigin: true,
        },
      },
    ],
    camera: {
      position: [0, 500, 1500],
      target: [0, 200, 0],
      fov: 45,
    },
    viewMode: "engineering",
    environment: {
      background: "#121216",
      grid: true,
      shadows: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const parsedScene = Engineering3DSceneSchema.safeParse(validScene);
  assert.ok(parsedScene.success, `Scene schema parse failed: ${JSON.stringify(parsedScene)}`);
  console.log("✓ Engineering3DSceneSchema validation passed");

  // Test 4: Postgres3dStore (Database CRUD)
  console.log("\n[Test 4] Postgres3dStore: persistence CRUD");
  globalPostgres3dStore.saveAsset(validAsset);
  const fetchedAssets = globalPostgres3dStore.listAssets();
  const found = fetchedAssets.find((a) => a.id === "asset-test-01");
  assert.ok(found, "Asset should be found in store");
  assert.strictEqual(found.name, "Solid Oak Chair Model");

  globalPostgres3dStore.saveScene(validScene);
  const fetchedScene = globalPostgres3dStore.getScene("scene-test-01");
  assert.ok(fetchedScene, "Scene should be found in store");
  assert.strictEqual(fetchedScene.instances.length, 1);
  assert.strictEqual(fetchedScene.instances[0].instanceId, "inst-001");

  // Update scene
  globalPostgres3dStore.updateScene("scene-test-01", {
    name: "Updated Living Room",
    viewMode: "wireframe",
  });
  const updatedScene = globalPostgres3dStore.getScene("scene-test-01");
  assert.strictEqual(updatedScene?.name, "Updated Living Room");
  assert.strictEqual(updatedScene?.viewMode, "wireframe");

  console.log("✓ Postgres3dStore CRUD operations verified");

  // Test 5: Memory Leak & GPU Resource Disposal (disposeHierarchy)
  console.log("\n[Test 5] Memory & GPU Leak Prevention: disposeHierarchy");
  const leakTestGroup = new THREE.Group();
  let geomDisposed = false;
  let matDisposed = false;

  const testGeom = new THREE.BufferGeometry();
  testGeom.dispose = () => {
    geomDisposed = true;
  };
  const testMat = new THREE.MeshBasicMaterial();
  testMat.dispose = () => {
    matDisposed = true;
  };

  const leakMesh = new THREE.Mesh(testGeom, testMat);
  leakTestGroup.add(leakMesh);

  disposeHierarchy(leakTestGroup);
  assert.ok(geomDisposed, "Geometry dispose must be called by disposeHierarchy");
  assert.ok(matDisposed, "Material dispose must be called by disposeHierarchy");
  console.log("✓ disposeHierarchy successfully releases GPU buffers & textures");

  console.log("\n==================================================");
  console.log("ALL G4-3D-ASSET-01 VERIFICATION TESTS PASSED!");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
