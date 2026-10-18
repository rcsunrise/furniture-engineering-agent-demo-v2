import { z } from "zod";
import { runReasoning, type ReasonProvider, type UnifiedReasoningImage } from "./provider.js";
import type { ComponentObservation, ReferenceImage } from "../../shared/g3_inference.js";

export const BoundingBoxSchema = z.object({
  uMin: z.number(),
  vMin: z.number(),
  uMax: z.number(),
  vMax: z.number(),
});

export const KeypointSchema = z.object({
  id: z.string(),
  name: z.string(),
  u: z.number(),
  v: z.number(),
  confidence: z.number().optional().default(0.9),
});

export const ContourSchema = z.object({
  profileId: z.string(),
  view: z.string(),
  source: z.string().optional().default("vision_estimated"),
  confidence: z.number().optional().default(0.85),
  points: z.array(z.object({ u: z.number(), v: z.number() })),
});

export const VisionComponentSchema = z.object({
  componentIdDraft: z.string(),
  semanticType: z.enum([
    "armrest",
    "cushion_seat",
    "cushion_back",
    "pillow",
    "base_frame",
    "support",
    "leg",
    "panel",
    "door",
    "drawer",
  ]),
  visibleIn: z.array(z.string()).min(1),
  symmetryGroup: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  accepted: z.boolean().optional().default(true),
  bboxNormalized: BoundingBoxSchema,
  keypoints: z.array(KeypointSchema).optional().default([]),
  contours: z.array(ContourSchema).optional().default([]),
  estimatedDimensionsMm: z
    .object({
      width: z.object({ value: z.number(), units: z.string().optional().default("mm") }),
      depth: z.object({ value: z.number(), units: z.string().optional().default("mm") }),
      height: z.object({ value: z.number(), units: z.string().optional().default("mm") }),
    })
    .optional(),
});

export const VisionOutputSchema = z.object({
  components: z.array(VisionComponentSchema).min(1),
});

export type VisionOutput = z.infer<typeof VisionOutputSchema>;

export interface ReferenceImageUploadInfo {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  url: string;
}

export interface AnalyzeReferenceImagesInput {
  sku: string;
  knownDimensions: { width: number; depth: number; height: number };
  images: {
    hero: ReferenceImageUploadInfo;
    front: ReferenceImageUploadInfo;
    side: ReferenceImageUploadInfo;
    top?: ReferenceImageUploadInfo;
  };
  provider?: ReasonProvider | string;
  model?: string;
}

export interface VisionAnalysisResult {
  components: ComponentObservation[];
  telemetry: {
    provider: string;
    requestedModel: string;
    resolvedModel: string;
    requestId: string | null;
    success: boolean;
    fallback: boolean;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    cost: number;
    latencyMs?: number;
  };
}

import { resolveVisionModel as resolveRegistryVisionModel } from "./modelRegistry.js";

export function resolveVisionModel(provider: string, requestedModel?: string): string {
  const resolved = resolveRegistryVisionModel(provider, requestedModel);
  return resolved.resolvedModel;
}


/**
  * Analyze reference images using Multimodal Vision Provider and validate output via Zod Schema.
  */
export async function analyzeReferenceImages(input: AnalyzeReferenceImagesInput): Promise<VisionAnalysisResult> {
  const provider = (input.provider || "routerhub") as ReasonProvider;
  const requestedModel = input.model || "gemini-3.6-flash";
  const resolvedModel = resolveVisionModel(provider, requestedModel);

  const reasoningImages: UnifiedReasoningImage[] = [
    {
      mimeType: input.images.hero.mimeType,
      data: input.images.hero.buffer.toString("base64"),
      label: "hero (perspective)",
    },
    {
      mimeType: input.images.front.mimeType,
      data: input.images.front.buffer.toString("base64"),
      label: "front (orthographic front)",
    },
    {
      mimeType: input.images.side.mimeType,
      data: input.images.side.buffer.toString("base64"),
      label: "side (orthographic side)",
    },
  ];

  if (input.images.top) {
    reasoningImages.push({
      mimeType: input.images.top.mimeType,
      data: input.images.top.buffer.toString("base64"),
      label: "top (orthographic top)",
    });
  }

  const instructions = `You are a Senior Furniture Vision Inspection AI.
Analyze the provided product reference images (Hero, Front, Side, and optional Top).
SKU: ${input.sku}
Locked Dimensions: Width = ${input.knownDimensions.width}mm, Depth = ${input.knownDimensions.depth}mm, Height = ${input.knownDimensions.height}mm.

Identify all component modules visible in the images (e.g., ARM-L-OUT, ARM-R-OUT, SEAT-001, SEAT-002, SEAT-003, BACK-001, BACK-002, BACK-003, PILLOW-001, FRAME-BASE, BASE-BOTTOM, LEG-001, LEG-002, LEG-003, LEG-004).
For each component module, output a JSON object with:
- componentIdDraft: string
- semanticType: "armrest" | "cushion_seat" | "cushion_back" | "pillow" | "base_frame" | "support" | "leg" | "panel" | "door" | "drawer"
- visibleIn: string[]
- symmetryGroup: string | null
- confidence: number (0..1)
- bboxNormalized: { uMin, vMin, uMax, vMax }
- keypoints: array of { id, name, u, v, confidence }
- contours: array of { profileId, view, source: "vision_estimated", confidence, points: [{ u, v }] }
- estimatedDimensionsMm: { width: { value, units: "mm" }, depth: { value, units: "mm" }, height: { value, units: "mm" } }

Return ONLY a JSON object with key "components": [ ... ].`;

  let aiRes;
  try {
    aiRes = await runReasoning({
      provider,
      model: resolvedModel,
      instructions,
      input: { sku: input.sku, dimensions: input.knownDimensions },
      images: reasoningImages,
    });
  } catch (runErr: any) {
    const err: any = new Error(`Vision provider call failed: ${runErr?.message || String(runErr)}`);
    err.code = runErr?.code || "VISION_PROVIDER_FAILED";
    throw err;
  }

  const rawText = aiRes.text || "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    const err: any = new Error("[VISION_SCHEMA_INVALID] Vision provider response contained no valid JSON structure");
    err.code = "VISION_SCHEMA_INVALID";
    throw err;
  }

  let parsedRaw: any;
  try {
    parsedRaw = JSON.parse(jsonMatch[0]);
  } catch (pErr: any) {
    const err: any = new Error(`[VISION_SCHEMA_INVALID] Failed to parse JSON from vision provider output: ${pErr.message}`);
    err.code = "VISION_SCHEMA_INVALID";
    throw err;
  }

  const parseResult = VisionOutputSchema.safeParse(parsedRaw);
  if (!parseResult.success) {
    const issueSummary = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    const err: any = new Error(`[VISION_SCHEMA_INVALID] Vision output failed Zod schema validation: ${issueSummary}`);
    err.code = "VISION_SCHEMA_INVALID";
    err.zodError = parseResult.error;
    throw err;
  }

  const validatedComponents: ComponentObservation[] = parseResult.data.components.map((c) => ({
    componentIdDraft: c.componentIdDraft,
    semanticType: c.semanticType as any,
    visibleIn: c.visibleIn,
    symmetryGroup: c.symmetryGroup || undefined,
    confidence: c.confidence,
    accepted: c.accepted ?? true,
    bboxNormalized: c.bboxNormalized,
    keypoints: c.keypoints || [],
    contours: (c.contours || []).map((ct: any) => ({
      ...ct,
      view: (["top", "front", "side"].includes(ct.view) ? ct.view : "front") as "top" | "front" | "side"
    })),
    estimatedDimensionsMm: c.estimatedDimensionsMm
      ? {
          width: { value: c.estimatedDimensionsMm.width.value, units: "mm", source: "AI_ESTIMATED", confidence: 0.8, productionTruth: false },
          depth: { value: c.estimatedDimensionsMm.depth.value, units: "mm", source: "AI_ESTIMATED", confidence: 0.8, productionTruth: false },
          height: { value: c.estimatedDimensionsMm.height.value, units: "mm", source: "AI_ESTIMATED", confidence: 0.8, productionTruth: false },
        }
      : undefined,
  }));

  const telemetry = {
    provider: aiRes.telemetry?.provider || provider,
    requestedModel,
    resolvedModel: aiRes.telemetry?.resolvedModel || resolvedModel,
    requestId: aiRes.telemetry?.requestId || aiRes.requestId,
    success: true,
    fallback: aiRes.telemetry?.fallbackUsed || false,
    usage: aiRes.telemetry?.usage,
    cost: aiRes.telemetry?.estimatedCostUsd || 0.0024,
    latencyMs: (aiRes.telemetry as any)?.latencyMs ?? 0,
  };

  return {
    components: validatedComponents,
    telemetry,
  };
}
