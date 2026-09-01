import * as THREE from "three";
import {
  ProjectionView,
  CANONICAL_PROJECTION_AXES,
  ProjectionSanity,
} from "../../../shared/geometryEvaluation.js";
import { Point2D } from "./engineeringProfileProvider.js";
import { MeshBounds } from "../../../shared/meshAlignment.js";

export interface ProjectedSilhouette2D {
  view: ProjectionView;
  points2D: Point2D[];
  contour: Point2D[];
  bounds2D: { minX: number; maxX: number; minY: number; maxY: number };
  widthMm: number;
  heightMm: number;
}

export interface ProjectMeshOptions {
  bounds?: MeshBounds;
  vertices?: { x: number; y: number; z: number }[];
  geometry?: THREE.BufferGeometry;
  engineeringMatrix?: THREE.Matrix4 | number[];
}

/**
 * Projects placed AI mesh geometry deterministically onto FRONT, SIDE, and TOP orthographic 2D planes
 * consuming the CANONICAL_PROJECTION_AXES contract.
 */
export function projectMeshToView(
  options: ProjectMeshOptions,
  view: ProjectionView
): ProjectedSilhouette2D {
  const matrix = options.engineeringMatrix
    ? options.engineeringMatrix instanceof THREE.Matrix4
      ? options.engineeringMatrix
      : new THREE.Matrix4().fromArray(options.engineeringMatrix)
    : new THREE.Matrix4().identity();

  let pts3D: THREE.Vector3[] = [];

  if (options.vertices && options.vertices.length > 0) {
    pts3D = options.vertices.map((v) => new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(matrix));
  } else if (options.geometry && options.geometry.attributes.position) {
    const posAttr = options.geometry.attributes.position;
    const stride = Math.max(1, Math.floor(posAttr.count / 200)); // Sample up to ~200 points for performance & determinism
    for (let i = 0; i < posAttr.count; i += stride) {
      const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
      v.applyMatrix4(matrix);
      pts3D.push(v);
    }
  } else if (options.bounds) {
    // Generate 8 corner vertices of bounding box
    const { min, max } = options.bounds;
    const corners = [
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(max.x, max.y, min.z),
      new THREE.Vector3(min.x, max.y, min.z),
      new THREE.Vector3(min.x, min.y, max.z),
      new THREE.Vector3(max.x, min.y, max.z),
      new THREE.Vector3(max.x, max.y, max.z),
      new THREE.Vector3(min.x, max.y, max.z),
    ];
    pts3D = corners.map((c) => c.applyMatrix4(matrix));
  } else {
    // Fallback default box
    pts3D = [
      new THREE.Vector3(-50, -50, -50),
      new THREE.Vector3(50, 50, 50),
    ].map((c) => c.applyMatrix4(matrix));
  }

  // Consume canonical projection axis contract
  const axisDef = CANONICAL_PROJECTION_AXES[view];
  const getAxisVal = (v: THREE.Vector3, axis: "X" | "Y" | "Z") =>
    axis === "X" ? v.x : axis === "Y" ? v.y : v.z;

  const points2D: Point2D[] = pts3D.map((v) => ({
    x: getAxisVal(v, axisDef.horizontalAxis),
    y: getAxisVal(v, axisDef.verticalAxis),
  }));

  // Calculate 2D bounds
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  let sumX = 0,
    sumY = 0;

  for (const pt of points2D) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
    sumX += pt.x;
    sumY += pt.y;
  }

  // Center points2D relative to bounding center for canonical comparison
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const centeredPoints: Point2D[] = points2D.map((pt) => ({
    x: pt.x - midX,
    y: pt.y - midY,
  }));

  const widthMm = Math.max(0.001, maxX - minX);
  const heightMm = Math.max(0.001, maxY - minY);

  // Simple 2D bounding contour box
  const halfW = widthMm / 2;
  const halfH = heightMm / 2;
  const contour: Point2D[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];

  return {
    view,
    points2D: centeredPoints,
    contour,
    bounds2D: { minX: -halfW, maxX: halfW, minY: -halfH, maxY: halfH },
    widthMm,
    heightMm,
  };
}

/**
 * Calculates projection sanity metrics for FRONT/SIDE/TOP comparison.
 */
export function computeProjectionSanity(
  refWidthMm: number,
  refHeightMm: number,
  aiWidthMm: number,
  aiHeightMm: number
): ProjectionSanity {
  const safeRefW = Math.max(0.001, refWidthMm);
  const safeRefH = Math.max(0.001, refHeightMm);
  const widthRatio = Number((aiWidthMm / safeRefW).toFixed(3));
  const heightRatio = Number((aiHeightMm / safeRefH).toFixed(3));

  const refAspect = safeRefW / safeRefH;
  const aiAspect = aiWidthMm / Math.max(0.001, aiHeightMm);
  const aspectDiff = Math.abs(refAspect - aiAspect) / refAspect;

  const axisSuspect =
    widthRatio < 0.25 ||
    widthRatio > 4.0 ||
    heightRatio < 0.25 ||
    heightRatio > 4.0 ||
    aspectDiff > 1.5;

  return {
    refWidthMm: Number(refWidthMm.toFixed(2)),
    refHeightMm: Number(refHeightMm.toFixed(2)),
    aiWidthMm: Number(aiWidthMm.toFixed(2)),
    aiHeightMm: Number(aiHeightMm.toFixed(2)),
    widthRatio,
    heightRatio,
    axisSuspect,
  };
}
