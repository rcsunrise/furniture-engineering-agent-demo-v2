import type { CadBounds } from "../../shared/cad.js";

export interface ViewportTransformOptions {
  bounds: CadBounds;
  containerWidth: number;
  containerHeight: number;
  zoom: number;
  pan: { x: number; y: number };
  marginMm?: number;
}

export interface ViewportTransform {
  scale: number;
  baseScale: number;
  centerXMm: number;
  centerYMm: number;
  engToScreenX: (xMm: number) => number;
  engToScreenY: (yMm: number) => number;
  engToScreenDist: (distMm: number) => number;
  screenToEngX: (xPx: number) => number;
  screenToEngY: (yPx: number) => number;
}

export function createCadViewportTransform({
  bounds,
  containerWidth,
  containerHeight,
  zoom,
  pan,
  marginMm = 120,
}: ViewportTransformOptions): ViewportTransform {
  const minX = bounds.minX - marginMm;
  const maxX = bounds.maxX + marginMm;
  const minY = bounds.minY - marginMm;
  const maxY = bounds.maxY + marginMm;

  const contentWidthMm = Math.max(10, maxX - minX);
  const contentHeightMm = Math.max(10, maxY - minY);

  const baseScale = Math.min(
    (containerWidth || 800) / contentWidthMm,
    (containerHeight || 600) / contentHeightMm
  );

  const scale = Math.max(0.01, baseScale * zoom);

  const centerXMm = (bounds.minX + bounds.maxX) / 2;
  const centerYMm = (bounds.minY + bounds.maxY) / 2;

  const engToScreenX = (xMm: number) => {
    return containerWidth / 2 + (xMm - centerXMm) * scale + pan.x;
  };

  const engToScreenY = (yMm: number) => {
    // Engineering Y (representing Z height) goes UP; Screen Y goes DOWN
    return containerHeight / 2 - (yMm - centerYMm) * scale + pan.y;
  };

  const engToScreenDist = (distMm: number) => {
    return distMm * scale;
  };

  const screenToEngX = (xPx: number) => {
    return (xPx - containerWidth / 2 - pan.x) / scale + centerXMm;
  };

  const screenToEngY = (yPx: number) => {
    return -(yPx - containerHeight / 2 - pan.y) / scale + centerYMm;
  };

  return {
    scale,
    baseScale,
    centerXMm,
    centerYMm,
    engToScreenX,
    engToScreenY,
    engToScreenDist,
    screenToEngX,
    screenToEngY,
  };
}
