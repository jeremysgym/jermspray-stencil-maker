// src/lib/stencil-v2/geometry/bridgeEngine.ts

import { GeometryPath } from "./pathGeometry";

export interface BridgePoint {
  x: number;
  y: number;
  width: number;
  angle: number;
}

export interface BridgeCandidate {
  pathId?: string;
  bridges: BridgePoint[];
}

export interface BridgeSettings {
  bridgeWidth: number;
  minimumArea: number;
}

const DEFAULT_SETTINGS: BridgeSettings = {
  bridgeWidth: 8,
  minimumArea: 150,
};

export function buildBridgePlan(
  paths: GeometryPath[],
  settings: Partial<BridgeSettings> = {},
): BridgeCandidate[] {

  const config = {
    ...DEFAULT_SETTINGS,
    ...settings,
  };

  const results: BridgeCandidate[] = [];

  for (const path of paths) {

    if (!path.isHole)
      continue;

    if (path.area < config.minimumArea)
      continue;

    const box = path.bbox;

    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;

    results.push({
      pathId: path.id,
      bridges: [
        {
          x: cx,
          y: box.minY,
          width: config.bridgeWidth,
          angle: 90,
        },
        {
          x: cx,
          y: box.maxY,
          width: config.bridgeWidth,
          angle: 90,
        },
      ],
    });
  }

  return results;
}

export function bridgeCount(
  plans: BridgeCandidate[],
): number {

  return plans.reduce(
    (sum, p) => sum + p.bridges.length,
    0,
  );
}
