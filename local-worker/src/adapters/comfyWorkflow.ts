import * as fs from "fs";
import * as path from "path";
import { ComfyAdapterError } from "./comfyClient.js";
import { validateHunyuanWorkflowBinding, HUNYUAN_NODE_BINDING } from "./hunyuanWorkflowBinding.js";

export class ComfyWorkflowManager {
  private presetCache = new Map<string, Record<string, any>>();

  public loadWorkflowPreset(workflowPath: string): Record<string, any> {
    if (this.presetCache.has(workflowPath)) {
      return this.presetCache.get(workflowPath)!;
    }

    const resolvedPath = path.isAbsolute(workflowPath)
      ? workflowPath
      : path.join(process.cwd(), workflowPath);

    if (!fs.existsSync(resolvedPath)) {
      throw new ComfyAdapterError(
        "COMFYUI_WORKFLOW_NOT_FOUND",
        `Workflow preset file not found at path: ${resolvedPath}`
      );
    }

    let rawText = "";
    try {
      rawText = fs.readFileSync(resolvedPath, "utf-8");
    } catch (err: any) {
      throw new ComfyAdapterError(
        "COMFYUI_WORKFLOW_NOT_FOUND",
        `Failed to read workflow preset file: ${err.message}`
      );
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (err: any) {
      throw new ComfyAdapterError(
        "COMFYUI_WORKFLOW_BINDING_INVALID",
        `Workflow preset contains invalid JSON: ${err.message}`
      );
    }

    // Validate binding against Hunyuan3D Node binding requirements
    validateHunyuanWorkflowBinding(parsedJson);

    // Deep freeze / cache original preset to prevent accidental mutation
    this.presetCache.set(workflowPath, parsedJson);
    return parsedJson;
  }

  public prepareHunyuanJobWorkflow(params: {
    workflowPreset: Record<string, any>;
    uploadedImageFilename: string;
    workspaceId: string;
    jobId: string;
    partId: string;
    seed: number;
  }): Record<string, any> {
    // Clone workflow - deep clone via JSON serialize/deserialize
    const clonedWorkflow: Record<string, any> = JSON.parse(
      JSON.stringify(params.workflowPreset)
    );

    // Validate binding again on cloned instance
    validateHunyuanWorkflowBinding(clonedWorkflow);

    const { inputImageNodeId, saveGlbNodeId, samplerNodeId } = HUNYUAN_NODE_BINDING;
    const { uploadedImageFilename, workspaceId, jobId, partId, seed } = params;

    // Node 20: Primary input image
    clonedWorkflow[inputImageNodeId].inputs.image = uploadedImageFilename;

    // Node 21: Output filename prefix (structured deterministic output path)
    const filenamePrefix = `mesh/${workspaceId}/${jobId}/${partId}`;
    clonedWorkflow[saveGlbNodeId].inputs.filename_prefix = filenamePrefix;

    // Node 26: KSampler seed
    clonedWorkflow[samplerNodeId].inputs.seed = seed;

    return clonedWorkflow;
  }
}
