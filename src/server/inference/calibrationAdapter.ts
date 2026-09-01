import type {
  ContourPoint2D,
  KeypointObservation,
  ReferenceViewType,
} from "../../shared/g3_inference.js";

export interface CalibrationParams {
  overallWidthMm: number;
  overallDepthMm: number;
  overallHeightMm: number;
}

export interface Point3DMm {
  x: number;
  y: number;
  z: number;
}

/**
 * Calibration Adapter
 * Centralizes all image coordinate scaling, origin offset, and image Y-flip
 * conversions to transform 0..1 normalized (u, v) coordinates into FES engineering space (mm).
 *
 * FES Coordinate System:
 * - X = Left-Right ([-W/2, +W/2])
 * - Y = Front-Back ([0, D] or [-D/2, +D/2])
 * - Z = Up-Down ([0, H])
 */
export class CalibrationAdapter {
  private params: CalibrationParams;

  constructor(params: CalibrationParams) {
    this.params = params;
  }

  /**
   * Converts normalized (u, v) from a specific reference view to 3D engineering coordinates (mm).
   */
  public normalizedToMm(u: number, v: number, view: ReferenceViewType): Point3DMm {
    const { overallWidthMm, overallDepthMm, overallHeightMm } = this.params;

    // Image V coordinates usually run from 0 (top) to 1 (bottom).
    // In FES engineering Z runs from 0 (bottom) to H (top).
    // Thus: engineering Z = (1.0 - v) * overallHeightMm
    const zMm = Math.round((1.0 - Math.max(0, Math.min(1, v))) * overallHeightMm * 10) / 10;

    switch (view) {
      case "front":
      case "hero": {
        // X centered at 0: u=0 -> -W/2, u=0.5 -> 0, u=1.0 -> +W/2
        const xMm = Math.round((u - 0.5) * overallWidthMm * 10) / 10;
        // Default Y depth at front plane = 0
        return { x: xMm, y: 0, z: zMm };
      }

      case "side_left":
      case "side_right": {
        // Depth Y centered or running front-to-back
        const yMm = Math.round((u - 0.5) * overallDepthMm * 10) / 10;
        return { x: 0, y: yMm, z: zMm };
      }

      case "top": {
        const xMm = Math.round((u - 0.5) * overallWidthMm * 10) / 10;
        const yMm = Math.round((v - 0.5) * overallDepthMm * 10) / 10;
        return { x: xMm, y: yMm, z: overallHeightMm };
      }

      default: {
        const xMm = Math.round((u - 0.5) * overallWidthMm * 10) / 10;
        return { x: xMm, y: 0, z: zMm };
      }
    }
  }

  /**
   * Calibrate keypoint observation into engineering space.
   */
  public calibrateKeypoint(kp: KeypointObservation, view: ReferenceViewType): KeypointObservation & { pointMm: Point3DMm } {
    const pointMm = this.normalizedToMm(kp.u, kp.v, view);
    return {
      ...kp,
      pointMm,
    };
  }

  /**
   * Calibrate contour points array into engineering space.
   */
  public calibrateContour(
    points: ContourPoint2D[],
    view: ReferenceViewType
  ): Array<ContourPoint2D & { xMm: number; yMm: number; zMm: number }> {
    return points.map((pt) => {
      const pMm = this.normalizedToMm(pt.u, pt.v, view);
      return {
        ...pt,
        xMm: pMm.x,
        yMm: pMm.y,
        zMm: pMm.z,
      };
    });
  }

  /**
   * Calibrate bounding box normalized to mm bounds.
   */
  public calibrateBBox(
    bbox: { uMin: number; vMin: number; uMax: number; vMax: number },
    view: ReferenceViewType
  ) {
    const pMin = this.normalizedToMm(bbox.uMin, bbox.vMax, view); // vMax is bottom in image -> min Z
    const pMax = this.normalizedToMm(bbox.uMax, bbox.vMin, view); // vMin is top in image -> max Z

    const width = Math.round(Math.abs(bbox.uMax - bbox.uMin) * this.params.overallWidthMm);
    const height = Math.round(Math.abs(bbox.vMax - bbox.vMin) * this.params.overallHeightMm);

    return {
      xMin: Math.min(pMin.x, pMax.x),
      xMax: Math.max(pMin.x, pMax.x),
      zMin: Math.min(pMin.z, pMax.z),
      zMax: Math.max(pMin.z, pMax.z),
      estimatedWidthMm: width,
      estimatedHeightMm: height,
    };
  }
}
