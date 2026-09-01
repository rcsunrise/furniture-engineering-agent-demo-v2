import { ComfyAdapterError } from "./comfyClient.js";

export interface HunyuanWorkflowBinding {
  inputImageNodeId: string;
  saveGlbNodeId: string;
  voxelToMeshNodeId: string;
  vaeDecodeNodeId: string;
  conditioningNodeId: string;
  latentNodeId: string;
  samplerNodeId: string;
  clipVisionNodeId: string;
  modelSamplingNodeId: string;
  checkpointNodeId: string;
}

export const HUNYUAN_NODE_BINDING: HunyuanWorkflowBinding = {
  inputImageNodeId: "20",
  saveGlbNodeId: "21",
  voxelToMeshNodeId: "22",
  vaeDecodeNodeId: "23",
  conditioningNodeId: "24",
  latentNodeId: "25",
  samplerNodeId: "26",
  clipVisionNodeId: "27",
  modelSamplingNodeId: "28",
  checkpointNodeId: "29",
};

export const EXPECTED_NODE_TYPES: Record<string, string> = {
  "20": "LoadImage",
  "21": "SaveGLB",
  "22": "VoxelToMesh",
  "23": "VAEDecode3D",
  "24": "Conditioning",
  "25": "EmptyLatent3D",
  "26": "KSampler",
  "27": "CLIPVisionEncode",
  "28": "ModelSampling3D",
  "29": "CheckpointLoaderSimple",
};

export function validateHunyuanWorkflowBinding(workflowJson: Record<string, any>): void {
  if (!workflowJson || typeof workflowJson !== "object") {
    throw new ComfyAdapterError(
      "COMFYUI_WORKFLOW_BINDING_INVALID",
      "Workflow JSON must be an object"
    );
  }

  for (const [nodeId, expectedType] of Object.entries(EXPECTED_NODE_TYPES)) {
    const node = workflowJson[nodeId];
    if (!node) {
      throw new ComfyAdapterError(
        "COMFYUI_WORKFLOW_BINDING_INVALID",
        `Missing expected node ID '${nodeId}' in workflow`
      );
    }
    if (node.class_type !== expectedType) {
      throw new ComfyAdapterError(
        "COMFYUI_WORKFLOW_BINDING_INVALID",
        `Node '${nodeId}' class_type mismatch: expected '${expectedType}', got '${node.class_type}'`
      );
    }
  }

  // Ensure Node 30 (if present) is NOT used as runtime input node
  if (HUNYUAN_NODE_BINDING.inputImageNodeId === "30") {
    throw new ComfyAdapterError(
      "COMFYUI_WORKFLOW_BINDING_INVALID",
      "Node 30 MUST NOT be configured as runtime input"
    );
  }

  // Ensure Node 20 is configured as input image node
  if (!workflowJson["20"].inputs) {
    throw new ComfyAdapterError(
      "COMFYUI_WORKFLOW_BINDING_INVALID",
      "Node 20 does not contain inputs object"
    );
  }
}
