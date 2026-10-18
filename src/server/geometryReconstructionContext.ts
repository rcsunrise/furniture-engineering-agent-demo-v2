import { globalEngineeringSessionStore } from "./engineeringSessionStore.js";
import type { FESComponent, FESDocument } from "../shared/fes.js";
import type {
  GeometryReconstructionContext,
  GeometryReconstructionMethod,
} from "../shared/geometryReconstruction.js";

export function resolveGeometryReconstructionContext(
  sessionId: string,
  canonicalComponentId: string,
  requestedMethod?: GeometryReconstructionMethod
): GeometryReconstructionContext | null {
  const session = globalEngineeringSessionStore.getSession(sessionId);
  if (!session) {
    return null;
  }

  const fesDocument: FESDocument | null = (session.fesDocument as FESDocument) || null;

  const component: FESComponent | undefined = fesDocument?.components?.find(
    (c) => c.id === canonicalComponentId
  );

  const binding = session.componentBindings.find(
    (b) => b.canonicalComponentId === canonicalComponentId || b.componentId === canonicalComponentId
  );

  const sizeX = component?.size?.x || 0;
  const sizeY = component?.size?.y || 0;
  const sizeZ = component?.size?.z || 0;

  const posX = component?.position?.x || 0;
  const posY = component?.position?.y || 0;
  const posZ = component?.position?.z || 0;

  const rotX = component?.rotation?.x || 0;
  const rotY = component?.rotation?.y || 0;
  const rotZ = component?.rotation?.z || 0;

  const hasProvidedDimensions = sizeX > 0 && sizeY > 0 && sizeZ > 0;

  const hasEngineeringProfiles = Boolean(
    component?.profiles?.front || component?.profiles?.side || component?.profiles?.top
  );

  const hasEngineeringLoft = Boolean(
    component?.loftGroup ||
      (fesDocument?.loftSections &&
        fesDocument.loftSections.some((ls) => ls.loftGroup === component?.loftGroup))
  );

  const softGroupName = (component as any)?.softGroup || (component as any)?.softSurfaceGroup;
  const hasEngineeringSoftSurface = Boolean(
    softGroupName ||
      (fesDocument?.softSurfaceParams &&
        fesDocument.softSurfaceParams.some((sp) => sp.softGroup === softGroupName))
  );

  const hasEngineeringTopology = Boolean(fesDocument?.topology2D && fesDocument.topology2D.length > 0);

  const hasReferenceMesh = Boolean(
    binding && binding.bindingType === "ai_reference_mesh" && binding.artifactId
  );

  const hasProxyOnly = Boolean(
    !binding || binding.bindingType === "proxy_fallback" || !hasReferenceMesh
  );

  return {
    sessionId,
    workspaceId: session.workspaceId || "default-workspace",
    sku: session.sku || fesDocument?.sku || "UNKNOWN-SKU",
    canonicalComponentId,

    component: {
      id: component?.id || canonicalComponentId,
      type: component?.type || "component",
      material: component?.material,
      sizeX,
      sizeY,
      sizeZ,
      posX,
      posY,
      posZ,
      rotationX: rotX,
      rotationY: rotY,
      rotationZ: rotZ,
    },

    referenceMesh: binding?.artifactId
      ? {
          artifactId: binding.artifactId,
          geometrySource: binding.bindingType,
          productionTruth: false,
        }
      : undefined,

    engineeringGeometry: {
      frontProfile: component?.profiles?.front,
      sideProfile: component?.profiles?.side,
      topProfile: component?.profiles?.top,
      loftSections: component?.loftGroup
        ? fesDocument?.loftSections?.filter((ls) => ls.loftGroup === component.loftGroup)
        : undefined,
      softSurface: softGroupName
        ? fesDocument?.softSurfaceParams?.find((sp) => sp.softGroup === softGroupName)
        : undefined,
      topology: fesDocument?.topology2D,
    },

    truthState: {
      isComponentResolved: Boolean(component),
      hasProvidedDimensions,
      hasEngineeringProfiles,
      hasEngineeringLoft,
      hasEngineeringSoftSurface,
      hasEngineeringTopology,
      hasReferenceMesh,
      hasProxyOnly,
    },
  };
}
