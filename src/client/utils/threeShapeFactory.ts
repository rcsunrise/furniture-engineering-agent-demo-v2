import * as THREE from "three";
import type { ComponentShape, LoftSection, SoftSurfaceParams } from "../../shared/fes.js";
import {
  buildAsymmetricLoftGeometry,
  buildSoftSurfaceComponentGeometry,
  buildBoxComponentGeometry,
} from "./geometryBuilders/index.js";

export interface CreateComponentGeometryOptions {
  id: string;
  type?: string;
  geometryMode?: "box" | "soft_surface" | "loft_shell" | "mesh_reference" | string;
  loftGroup?: string;
  softGroup?: string;
  size: { x: number; y: number; z: number }; // Three.js sizes (in meters or world units)
  position: { x: number; y: number; z: number };
  shape?: ComponentShape;
  loftSections?: LoftSection[];
  softSurfaceParams?: SoftSurfaceParams[];
  meshArtifactGeometry?: THREE.BufferGeometry | null;
}

/**
 * ThreeShapeFactory: Converts Parameterized Shapes and Geometry Modes into Three.js Geometries.
 * Implements strict fallback chain: mesh_reference -> loft_shell -> soft_surface -> box proxy.
 * Never returns null geometry.
 */
export class ThreeShapeFactory {
  public static createSoftBoxGeometry(
    width: number,
    height: number,
    depth: number
  ): THREE.BufferGeometry {
    return buildSoftSurfaceComponentGeometry(width, height, depth, "SEAT-1");
  }

  public static createGeometryForComponent(c: CreateComponentGeometryOptions): THREE.BufferGeometry {
    const requestedMode = (c.geometryMode || "box").toLowerCase();
    const type = (c.type || "").toLowerCase();
    const compId = (c.id || "COMP").toUpperCase();

    const width = Math.max(0.0001, Number.isFinite(c.size?.x) ? c.size.x : 0.1);
    const height = Math.max(0.0001, Number.isFinite(c.size?.y) ? c.size.y : 0.1);
    const depth = Math.max(0.0001, Number.isFinite(c.size?.z) ? c.size.z : 0.1);

    let modeResolved: "mesh_reference" | "loft_shell" | "soft_surface" | "box" = "box";
    let usedFallback = false;
    let failed = false;
    let resultGeometry: THREE.BufferGeometry | null = null;

    // Helper: try Mesh Reference
    const tryMeshReference = (): THREE.BufferGeometry | null => {
      if (c.meshArtifactGeometry && c.meshArtifactGeometry.getAttribute("position")?.count > 0) {
        return c.meshArtifactGeometry.clone();
      }
      return null;
    };

    // Helper: try Loft Shell
    const tryLoftShell = (): THREE.BufferGeometry | null => {
      try {
        const groupSections = (c.loftSections || []).filter(
          (ls) => !c.loftGroup || ls.loftGroup === c.loftGroup
        );
        const geom = buildAsymmetricLoftGeometry(width, height, depth, groupSections, c.id);
        if (geom && geom.getAttribute("position") && geom.getAttribute("position").count > 0) {
          return geom;
        }
      } catch (e) {
        console.warn(`[ThreeShapeFactory] Loft shell failed for ${c.id}:`, e);
      }
      return null;
    };

    // Helper: try Soft Surface
    const trySoftSurface = (): THREE.BufferGeometry | null => {
      try {
        const matchedParams = (c.softSurfaceParams || []).find(
          (sp) => sp.softGroup === c.softGroup || (sp as any).groupName === c.softGroup || sp.componentType === type
        );
        const geom = buildSoftSurfaceComponentGeometry(width, height, depth, c.id, matchedParams);
        if (geom && geom.getAttribute("position") && geom.getAttribute("position").count > 0) {
          return geom;
        }
      } catch (e) {
        console.warn(`[ThreeShapeFactory] Soft surface failed for ${c.id}:`, e);
      }
      return null;
    };

    // Helper: Box Proxy
    const makeBoxProxy = (): THREE.BufferGeometry => {
      try {
        return buildBoxComponentGeometry(width, height, depth);
      } catch (e) {
        return new THREE.BoxGeometry(width, height, depth);
      }
    };

    // Fallback chain dispatcher
    if (requestedMode === "mesh_reference") {
      resultGeometry = tryMeshReference();
      if (resultGeometry) {
        modeResolved = "mesh_reference";
        usedFallback = false;
      } else {
        usedFallback = true;
        resultGeometry = tryLoftShell();
        if (resultGeometry) {
          modeResolved = "loft_shell";
        } else {
          resultGeometry = trySoftSurface();
          if (resultGeometry) {
            modeResolved = "soft_surface";
          } else {
            resultGeometry = makeBoxProxy();
            modeResolved = "box";
          }
        }
      }
    } else if (requestedMode === "loft_shell") {
      resultGeometry = tryLoftShell();
      if (resultGeometry) {
        modeResolved = "loft_shell";
        usedFallback = false;
      } else {
        usedFallback = true;
        resultGeometry = trySoftSurface();
        if (resultGeometry) {
          modeResolved = "soft_surface";
        } else {
          resultGeometry = makeBoxProxy();
          modeResolved = "box";
        }
      }
    } else if (requestedMode === "soft_surface") {
      resultGeometry = trySoftSurface();
      if (resultGeometry) {
        modeResolved = "soft_surface";
        usedFallback = false;
      } else {
        usedFallback = true;
        resultGeometry = makeBoxProxy();
        modeResolved = "box";
      }
    } else if (requestedMode === "box") {
      resultGeometry = makeBoxProxy();
      modeResolved = "box";
      usedFallback = false;
    } else {
      // Unknown / undefined mode -> try heuristics then fallback box
      usedFallback = true;
      if (type === "armrest" || compId.startsWith("ARM")) {
        resultGeometry = tryLoftShell() || trySoftSurface() || makeBoxProxy();
      } else if (type === "seat" || type === "backrest" || compId.startsWith("SEAT") || compId.startsWith("BACK")) {
        resultGeometry = trySoftSurface() || makeBoxProxy();
      } else {
        resultGeometry = makeBoxProxy();
      }
      modeResolved = "box";
    }

    // Absolute fallback guarantee: NEVER return null geometry
    if (!resultGeometry || !resultGeometry.getAttribute("position") || resultGeometry.getAttribute("position").count === 0) {
      resultGeometry = makeBoxProxy();
      modeResolved = "box";
      usedFallback = true;
      failed = true;
    }

    resultGeometry.userData = {
      ...(resultGeometry.userData || {}),
      componentId: c.id,
      requestedMode,
      modeResolved,
      usedFallback,
      failed,
    };

    return resultGeometry;
  }
}
