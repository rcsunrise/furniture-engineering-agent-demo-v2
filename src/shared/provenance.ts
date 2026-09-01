import { z } from "zod";

export type DataSourceType =
  | "user_input"
  | "engineering"
  | "ai_generated"
  | "derived"
  | "proxy"
  | "test";

export const DataSourceTypeSchema = z.enum([
  "user_input",
  "engineering",
  "ai_generated",
  "derived",
  "proxy",
  "test",
]);

export const DataProvenanceSchema = z.object({
  sourceType: DataSourceTypeSchema,
  sourceId: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  productionTruth: z.boolean().default(false),
  createdAt: z.string().default(() => new Date().toISOString()),
  producer: z.string(),
  derivation: z.array(z.string()).optional().default([]),
});

export type DataProvenance = z.infer<typeof DataProvenanceSchema>;

/**
 * Enforces strict provenance truth rules:
 * - User input / verified engineering -> can be productionTruth = true
 * - AI generated, proxy, test, derived without verification -> MUST be productionTruth = false
 * - Confidence level NEVER automatically upgrades productionTruth to true
 */
export function sanitizeProvenance(provenance: Partial<DataProvenance>): DataProvenance {
  const sourceType = provenance.sourceType || "proxy";
  let productionTruth = provenance.productionTruth ?? false;

  // STRICT RULE: AI, Proxy, Test data CANNOT be productionTruth
  if (sourceType === "ai_generated" || sourceType === "proxy" || sourceType === "test") {
    productionTruth = false;
  }

  return {
    sourceType,
    sourceId: provenance.sourceId,
    confidence: typeof provenance.confidence === "number" ? Math.min(1, Math.max(0, provenance.confidence)) : 0.5,
    productionTruth,
    createdAt: provenance.createdAt || new Date().toISOString(),
    producer: provenance.producer || "system",
    derivation: provenance.derivation || [],
  };
}

export function isProductionTruthValid(sourceType: DataSourceType, productionTruth: boolean): boolean {
  if (productionTruth && (sourceType === "ai_generated" || sourceType === "proxy" || sourceType === "test")) {
    return false;
  }
  return true;
}
