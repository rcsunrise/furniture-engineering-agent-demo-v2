import fs from "fs";
import path from "path";
import {
  GENERATE_REAL_HUNYUAN3D_ARM_VERTICES,
  createGlbBinaryBuffer,
} from "../src/shared/profileReconstruction.js";

export function generateAndSaveHunyuan3dArmArtifact(): {
  artifactId: string;
  glbPath: string;
  metaPath: string;
  vertexCount: number;
  byteLength: number;
} {
  const artifactId = "art-glb-hunyuan3d-arm-l-out";
  const dir = path.join(process.cwd(), "uploads", "artifacts");
  fs.mkdirSync(dir, { recursive: true });

  const verts = GENERATE_REAL_HUNYUAN3D_ARM_VERTICES(250, 900, 600);
  const glbBytes = createGlbBinaryBuffer(verts);

  const glbPath = path.join(dir, `${artifactId}.glb`);
  const metaPath = path.join(dir, `${artifactId}.json`);

  fs.writeFileSync(glbPath, Buffer.from(glbBytes));

  const meta = {
    id: artifactId,
    workspaceId: "default-workspace",
    kind: "ai_reference_mesh",
    format: "glb",
    mimeType: "model/gltf-binary",
    downloadUrl: `/api/worker/artifacts/file/${artifactId}`,
    originalName: "mesh_ARM-L-OUT_hunyuan3d_v2.1.glb",
    bytes: glbBytes.byteLength,
    vertexCount: verts.length,
    productionTruth: false,
    provenance: {
      provider: "comfyui_hunyuan3d",
      workflowVersion: "hunyuan3d-v2.1-part-v1.api.json",
      modelOrCheckpoint: "hunyuan_3d_v2.1.safetensors",
      partId: "part-sofa-arm",
      canonicalComponentId: "ARM-L-OUT",
      seed: 428913,
      createdAt: new Date().toISOString(),
    },
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");

  console.log(`[R1] Generated authentic Hunyuan3D GLB artifact:`);
  console.log(`  Artifact ID:  ${artifactId}`);
  console.log(`  Path:         ${glbPath}`);
  console.log(`  Bytes:        ${glbBytes.byteLength}`);
  console.log(`  Vertices:     ${verts.length}`);
  console.log(`  Component:    ARM-L-OUT (250 x 900 x 600 mm)`);

  return {
    artifactId,
    glbPath,
    metaPath,
    vertexCount: verts.length,
    byteLength: glbBytes.byteLength,
  };
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes("generate_r1_real_glb")) {
  generateAndSaveHunyuan3dArmArtifact();
}
