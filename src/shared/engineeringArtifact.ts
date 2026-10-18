export type EngineeringArtifactKind =
  | "reference_image"
  | "ai_mesh"
  | "derived_mesh"
  | "cad"
  | "preview"
  | "validation_report"
  | "engineering_package";

export type CoordinateSystemUnit = "mm" | "cm" | "m" | "unknown";
export type CoordinateSystemUpAxis = "Y" | "Z" | "unknown";

export interface EngineeringArtifactCoordinateSystem {
  unit: CoordinateSystemUnit;
  upAxis: CoordinateSystemUpAxis;
}

export interface EngineeringArtifactStorage {
  provider: "gcs" | "local_fallback";
  bucket: string;
  objectPath: string;
}

export interface EngineeringArtifact {
  id: string;
  projectId: string;
  skuCode?: string;
  componentId?: string;

  kind: EngineeringArtifactKind;
  provider?: string;
  format: string;
  mimeType: string;
  sizeBytes: number;

  storage: EngineeringArtifactStorage;

  sourceArtifactId?: string;
  revision?: number;

  coordinateSystem?: EngineeringArtifactCoordinateSystem;

  /**
   * AI inferred mesh or external worker mesh must default to false.
   * Only true when manually confirmed or mathematically resolved.
   */
  productionTruth: boolean;

  metadata?: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}

export interface CreateUploadSessionRequest {
  projectId: string;
  skuCode?: string;
  componentId?: string;
  kind: EngineeringArtifactKind;
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
  sourceArtifactId?: string;
  revision?: number;
  provider?: string;
  coordinateSystem?: EngineeringArtifactCoordinateSystem;
  metadata?: Record<string, unknown>;
  /**
   * If true, asset will be directed to temporary bucket (e.g. fes-temp-assets)
   */
  isTemp?: boolean;
}

export interface CreateUploadSessionResponse {
  artifactId: string;
  uploadMode: "resumable" | "single";
  sessionUrl: string;
  objectPath: string;
  bucket: string;
  expiresAt: string;
  storageProvider: "gcs" | "local_fallback";
}

export interface CompleteUploadResponse {
  success: boolean;
  artifact: EngineeringArtifact;
  message?: string;
}

export interface ArtifactAccessResponse {
  artifactId: string;
  url: string;
  expiresAt: string;
  storageProvider: "gcs" | "local_fallback";
}

export interface ListArtifactsFilter {
  projectId?: string;
  skuCode?: string;
  componentId?: string;
  kind?: EngineeringArtifactKind;
  sourceArtifactId?: string;
}

export interface StorageConfigResponse {
  success: boolean;
  gcsEnabled: boolean;
  provider: "gcs" | "local_fallback";
  fallbackMode: boolean;
  backendServiceIdentity?: string;
  config: {
    projectId: string;
    assetBucket: string;
    tempBucket: string;
    signedUrlTtlSeconds: number;
    uploadMode: string;
  };
  bucketsCheck: {
    assetBucket: boolean;
    tempBucket: boolean;
    error?: string;
    errorCode?: string;
  };
}

/**
 * Builds canonical GCS object path adhering to Section 3 directory standard:
 * projects/{projectId}/sku/{skuCode}/{subFolder}/{fileName}
 */
export function buildCanonicalGcsObjectPath(params: {
  projectId: string;
  skuCode?: string;
  kind: EngineeringArtifactKind;
  fileName: string;
  revision?: number;
  subCategory?: string;
}): string {
  const proj = (params.projectId || "default_project").replace(/[^a-zA-Z0-9_-]/g, "_");
  const sku = (params.skuCode || "unassigned_sku").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  let subFolder = "misc";
  switch (params.kind) {
    case "reference_image":
      subFolder = params.subCategory ? `reference/${params.subCategory}` : "reference";
      break;
    case "ai_mesh":
      subFolder = "mesh/source";
      break;
    case "derived_mesh":
      subFolder = params.revision && params.revision > 1 ? "mesh/revisions" : "mesh/derived";
      break;
    case "cad":
      subFolder = "cad";
      break;
    case "preview":
      subFolder = "previews";
      break;
    case "validation_report":
      subFolder = "reports";
      break;
    case "engineering_package":
      subFolder = "packages";
      break;
  }

  const timestamp = Date.now();
  return `projects/${proj}/sku/${sku}/${subFolder}/${timestamp}_${safeName}`;
}
