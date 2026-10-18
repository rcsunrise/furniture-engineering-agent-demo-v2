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

  // Clean and sanitize outputDir (handle Windows quotes and accidental trailing/leading spaces)
  const cleanOutputDir = (outputDir || "").trim().replace(/^["']|["']$/g, "").replace(/\\+$/, "");

  // Candidate base directories to search in case user added/omitted subfolders like "3d"
  const candidateBaseDirs: string[] = [cleanOutputDir];
  const lowerDir = cleanOutputDir.toLowerCase();
  if (lowerDir.endsWith("/3d") || lowerDir.endsWith("\\3d")) {
    candidateBaseDirs.push(path.dirname(cleanOutputDir));
  } else {
    candidateBaseDirs.push(path.join(cleanOutputDir, "3d"));
  }

  let foundSubpath: string | null = null;
  let filename = "";
  let subfolder = `mesh/${workspaceId}/${jobId}/${partId}`;

  // 1. Try history metadata first across candidate base directories
  if (historyData?.outputs?.[saveGlbNodeId]) {
    const nodeOutput = historyData.outputs[saveGlbNodeId];
    for (const key of Object.keys(nodeOutput)) {
      const fileList = nodeOutput[key];
      if (Array.isArray(fileList)) {
        for (const fileObj of fileList) {
          const name = fileObj.filename || fileObj.name;
          if (name && typeof name === "string" && name.toLowerCase().endsWith(".glb")) {
            filename = name;
            if (fileObj.subfolder) subfolder = fileObj.subfolder;
            for (const baseDir of candidateBaseDirs) {
              const testPath = path.join(baseDir, subfolder, filename);
              if (fs.existsSync(testPath)) {
                foundSubpath = testPath;
                break;
              }
              // Also test direct baseDir/filename
              const directTest = path.join(baseDir, filename);
              if (fs.existsSync(directTest)) {
                foundSubpath = directTest;
                break;
              }
            }
            break;
          }
        }
      }
      if (foundSubpath) break;
    }
  }

  // 2. Fallback to job-specific output subtree search across candidate base directories
  if (!foundSubpath) {
    for (const baseDir of candidateBaseDirs) {
      const targetDir = path.join(baseDir, "mesh", workspaceId, jobId, partId);
      if (fs.existsSync(targetDir)) {
        const candidates = fs.readdirSync(targetDir).filter((f) => f.toLowerCase().endsWith(".glb"));
        if (candidates.length > 0) {
          const matched = candidates.find((c) => c.includes(promptId)) || candidates[0];
          filename = matched;
          foundSubpath = path.join(targetDir, filename);
          break;
        }
      }
    }
  }

  // 3. Check direct prefix path across candidate base directories
  if (!foundSubpath) {
    for (const baseDir of candidateBaseDirs) {
      const directPrefixDir = path.join(baseDir, "mesh", workspaceId, jobId);
      if (fs.existsSync(directPrefixDir)) {
        const candidates = fs
          .readdirSync(directPrefixDir)
          .filter((f) => f.includes(partId) && f.toLowerCase().endsWith(".glb"));
        if (candidates.length > 0) {
          filename = candidates[0];
          foundSubpath = path.join(directPrefixDir, filename);
          break;
        }
      }
    }
  }

  // 4. Check direct candidate directories for recent GLBs matching part or prompt
  if (!foundSubpath) {
    for (const baseDir of candidateBaseDirs) {
      if (fs.existsSync(baseDir)) {
        const directFiles = fs.readdirSync(baseDir).filter((f) => f.toLowerCase().endsWith(".glb"));
        const matched = directFiles.find((f) => f.includes(partId) || f.includes(promptId));
        if (matched) {
          filename = matched;
          foundSubpath = path.join(baseDir, filename);
          break;
        }
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
