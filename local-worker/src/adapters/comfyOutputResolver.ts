import * as fs from "fs";
import * as path from "path";
import { ComfyAdapterError } from "./comfyClient.js";

export interface ResolveOutputParams {
  historyData?: any;
  saveGlbNodeId: string;
  outputDir: string;
  workspaceId: string;
  jobId: string;
  partId: string;
  promptId: string;
}

export interface ResolvedGlbOutput {
  filePath: string;
  fileBuffer: Buffer;
  filename: string;
  subfolder: string;
}

export function resolveDeterministicGlbOutput(params: ResolveOutputParams): ResolvedGlbOutput {
  const { historyData, saveGlbNodeId, outputDir, workspaceId, jobId, partId, promptId } = params;

  let foundSubpath: string | null = null;
  let filename = "";
  let subfolder = `mesh/${workspaceId}/${jobId}/${partId}`;

  // 1. Try history metadata first
  if (historyData?.outputs?.[saveGlbNodeId]) {
    const nodeOutput = historyData.outputs[saveGlbNodeId];
    // Search all arrays in nodeOutput for .glb files
    for (const key of Object.keys(nodeOutput)) {
      const fileList = nodeOutput[key];
      if (Array.isArray(fileList)) {
        for (const fileObj of fileList) {
          const name = fileObj.filename || fileObj.name;
          if (name && typeof name === "string" && name.toLowerCase().endsWith(".glb")) {
            filename = name;
            if (fileObj.subfolder) subfolder = fileObj.subfolder;
            foundSubpath = path.join(outputDir, subfolder, filename);
            break;
          }
        }
      }
      if (foundSubpath) break;
    }
  }

  // 2. Fallback to job-specific output subtree search in outputDir
  if (!foundSubpath) {
    const targetDir = path.join(outputDir, "mesh", workspaceId, jobId, partId);
    if (fs.existsSync(targetDir)) {
      const candidates = fs.readdirSync(targetDir).filter((f) => f.toLowerCase().endsWith(".glb"));
      if (candidates.length > 0) {
        // Deterministically pick candidate matching promptId or first matching prefix
        const matched = candidates.find((c) => c.includes(promptId)) || candidates[0];
        filename = matched;
        foundSubpath = path.join(targetDir, filename);
      }
    }
  }

  // Also check direct prefix path if nested folder wasn't populated
  if (!foundSubpath) {
    const directPrefixDir = path.join(outputDir, "mesh", workspaceId, jobId);
    if (fs.existsSync(directPrefixDir)) {
      const candidates = fs
        .readdirSync(directPrefixDir)
        .filter((f) => f.includes(partId) && f.toLowerCase().endsWith(".glb"));
      if (candidates.length > 0) {
        filename = candidates[0];
        foundSubpath = path.join(directPrefixDir, filename);
      }
    }
  }

  if (!foundSubpath || !fs.existsSync(foundSubpath)) {
    throw new ComfyAdapterError(
      "COMFYUI_OUTPUT_NOT_FOUND",
      `No unambiguous GLB output found for prompt '${promptId}' in workspace '${workspaceId}', job '${jobId}', part '${partId}'`
    );
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(foundSubpath);
  } catch (err: any) {
    throw new ComfyAdapterError(
      "COMFYUI_INVALID_OUTPUT",
      `Failed to read resolved GLB output file at '${foundSubpath}': ${err.message}`
    );
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    throw new ComfyAdapterError(
      "COMFYUI_INVALID_OUTPUT",
      `Resolved GLB output file at '${foundSubpath}' is empty (0 bytes)`
    );
  }

  return {
    filePath: foundSubpath,
    fileBuffer,
    filename: filename || path.basename(foundSubpath),
    subfolder,
  };
}
