import * as THREE from "three";
import type { CoordinateUpAxis, ModelBoundingBox, ModelDimensions } from "../../../shared/imported3dAsset.js";

export interface AdapterOptions {
  sourceUp: CoordinateUpAxis;
  targetUp?: "Y_UP" | "Z_UP" | "FES";
  alignGround?: boolean;
  centerOrigin?: boolean;
  scaleFactor?: number;
}

export interface AlignmentResult {
  wrapper: THREE.Group;
  computedBoundingBox: ModelBoundingBox;
  dimensions: ModelDimensions;
}

export class CoordinateSystemAdapter {
  public static applyTransform(
    sourceObject: THREE.Object3D,
    options: AdapterOptions
  ): void {
    CoordinateSystemAdapter.applyAdapter(sourceObject, options);
  }

  /**
   * Directly adjusts local orientation, scaling and offsets on an existing 3D Object.
   */
  public static applyAdapter(
    sourceObject: THREE.Object3D,
    options: AdapterOptions
  ): void {
    const {
      sourceUp = "Y_UP",
      targetUp = "Y_UP",
      alignGround = true,
      centerOrigin = true,
      scaleFactor = 1.0,
    } = options;

    if (scaleFactor !== 1.0) {
      sourceObject.scale.multiplyScalar(scaleFactor);
    }

    if (targetUp === "FES") {
      if (sourceUp === "Y_UP") {
        sourceObject.rotation.x = Math.PI / 2;
      }
    } else {
      if (sourceUp === "Z_UP") {
        sourceObject.rotation.x = -Math.PI / 2;
      }
    }

    sourceObject.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(sourceObject);
    if (!box.isEmpty()) {
      if (centerOrigin) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        sourceObject.position.x -= center.x;
        if (targetUp === "FES") {
          sourceObject.position.y -= center.y;
        } else {
          sourceObject.position.z -= center.z;
        }
      }
      if (alignGround) {
        if (targetUp === "FES") {
          sourceObject.position.z -= box.min.z;
        } else {
          sourceObject.position.y -= box.min.y;
        }
      }
    }
    sourceObject.updateMatrixWorld(true);
  }

  /**
   * Wraps an Object3D inside an alignment container without mutating original vertex buffers.
   * Applies rotation, scaling, ground placement and centering.
   */
  public static wrapAndAlign(
    sourceObject: THREE.Object3D,
    options: AdapterOptions
  ): AlignmentResult {
    const {
      sourceUp = "Y_UP",
      targetUp = "Y_UP",
      alignGround = true,
      centerOrigin = true,
      scaleFactor = 1.0,
    } = options;

    // Reset local transform of source object inside wrapper
    sourceObject.position.set(0, 0, 0);
    sourceObject.scale.set(1, 1, 1);
    sourceObject.rotation.set(0, 0, 0);
    sourceObject.updateMatrixWorld(true);

    // Compute original unscaled bounding box
    const originalBox = new THREE.Box3().setFromObject(sourceObject);
    const size = new THREE.Vector3();
    originalBox.getSize(size);
    const center = new THREE.Vector3();
    originalBox.getCenter(center);

    // Wrapper group that handles orientation conversion and ground offset
    const wrapper = new THREE.Group();
    wrapper.name = `CoordinateAdapter_${sourceObject.name || "Object"}`;

    const innerGroup = new THREE.Group();
    innerGroup.name = "InnerTransformedGroup";
    innerGroup.add(sourceObject);
    wrapper.add(innerGroup);

    // 1. Orientation adjustment
    // In Three.js default viewport, Y is vertical up.
    // In FES standard, Z is vertical up (Ground Z=0), X is Width, Y is Depth.
    if (targetUp === "FES") {
      if (sourceUp === "Y_UP") {
        // Rotate -90 deg around X so Y becomes Z (Z-UP)
        innerGroup.rotation.x = -Math.PI / 2;
      }
    } else if (targetUp === "Y_UP") {
      if (sourceUp === "Z_UP") {
        // Rotate -90 deg around X so Z (0,0,1) transforms to Y (0,1,0) (Y-UP)
        innerGroup.rotation.x = -Math.PI / 2;
      }
    }

    // 2. Unit Scale
    if (scaleFactor !== 1.0) {
      innerGroup.scale.setScalar(scaleFactor);
    }

    innerGroup.updateMatrixWorld(true);

    // Compute bounding box after orientation and scale
    const transformedBox = new THREE.Box3().setFromObject(innerGroup);
    const tCenter = new THREE.Vector3();
    transformedBox.getCenter(tCenter);
    const tSize = new THREE.Vector3();
    transformedBox.getSize(tSize);

    // 3. Centering and Ground Alignment
    const offset = new THREE.Vector3();
    if (centerOrigin) {
      offset.x = -tCenter.x;
      // If FES (Z is up): center X and Y, place min Z on ground
      if (targetUp === "FES") {
        offset.y = -tCenter.y;
        if (alignGround) {
          offset.z = -transformedBox.min.z;
        }
      } else {
        // Standard Three.js (Y is up): center X and Z, place min Y on ground
        offset.z = -tCenter.z;
        if (alignGround) {
          offset.y = -transformedBox.min.y;
        }
      }
    } else if (alignGround) {
      if (targetUp === "FES") {
        offset.z = -transformedBox.min.z;
      } else {
        offset.y = -transformedBox.min.y;
      }
    }

    innerGroup.position.copy(offset);
    wrapper.updateMatrixWorld(true);

    // Final aligned box
    const finalBox = new THREE.Box3().setFromObject(wrapper);
    const finalSize = new THREE.Vector3();
    finalBox.getSize(finalSize);

    const computedBoundingBox: ModelBoundingBox = {
      min: [finalBox.min.x, finalBox.min.y, finalBox.min.z],
      max: [finalBox.max.x, finalBox.max.y, finalBox.max.z],
    };

    const dimensions: ModelDimensions = {
      width: Math.round(finalSize.x * 100) / 100,
      depth: Math.round(finalSize.y * 100) / 100,
      height: Math.round(finalSize.z * 100) / 100,
    };

    return {
      wrapper,
      computedBoundingBox,
      dimensions,
    };
  }

  /**
   * Calculates camera position and target to fit the object nicely into the viewport.
   * Does NOT alter mesh geometry or object transform.
   */
  public static calculateCameraFit(
    object: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
    controls?: { target: THREE.Vector3 },
    margin = 1.3
  ): { position: THREE.Vector3; target: THREE.Vector3; distance: number } {
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    const radius = Math.max(sphere.radius, 10);
    const fov = camera.fov * (Math.PI / 180);
    let distance = (radius / Math.sin(fov / 2)) * margin;
    distance = Math.max(distance, 50);

    // Optimal isometric angle: 45° horizontal, 30° elevation
    const elevation = Math.PI / 6; // 30 deg
    const azimuth = Math.PI / 4;   // 45 deg

    const posX = center.x + distance * Math.cos(elevation) * Math.sin(azimuth);
    const posY = center.y + distance * Math.sin(elevation);
    const posZ = center.z + distance * Math.cos(elevation) * Math.cos(azimuth);

    const position = new THREE.Vector3(posX, posY, posZ);
    const target = center.clone();

    if (controls) {
      controls.target.copy(target);
    }

    return {
      position,
      target,
      distance,
    };
  }
}
