import { CalibrationAdapter, type CalibrationParams, type Point3DMm } from "../inference/calibrationAdapter.js";

export { CalibrationAdapter, type CalibrationParams, type Point3DMm };

export function calibrateFrontPoint(u: number, v: number, overallWidth: number, overallHeight: number): { x: number; z: number } {
  const x = Math.round((u - 0.5) * overallWidth * 10) / 10;
  const z = Math.round((1 - v) * overallHeight * 10) / 10;
  return { x, z };
}

export function calibrateSidePoint(u: number, v: number, overallDepth: number, overallHeight: number): { y: number; z: number } {
  const y = Math.round((u - 0.5) * overallDepth * 10) / 10;
  const z = Math.round((1 - v) * overallHeight * 10) / 10;
  return { y, z };
}
