// src/lib/stencil-v2/geometry/holeDetection.ts

import { GeometryPath } from "./pathGeometry";

export function detectHoles(paths: GeometryPath[]): GeometryPath[] {
  // Reset
  for (const path of paths) {
    path.isHole = false;
    path.parentId = undefined;
  }

  for (let i = 0; i < paths.length; i++) {
    const child = paths[i];

    for (let j = 0; j < paths.length; j++) {
      if (i === j) continue;

      const parent = paths[j];

      if (contains(parent, child)) {
        child.isHole = true;
        child.parentId = parent.id;
        break;
      }
    }
  }

  return paths;
}

function contains(parent: GeometryPath, child: GeometryPath): boolean {
  return (
    child.bbox.minX >= parent.bbox.minX &&
    child.bbox.maxX <= parent.bbox.maxX &&
    child.bbox.minY >= parent.bbox.minY &&
    child.bbox.maxY <= parent.bbox.maxY
  );
}

export function holeCount(paths: GeometryPath[]): number {
  return paths.filter((p) => p.isHole).length;
}

export function solidCount(paths: GeometryPath[]): number {
  return paths.filter((p) => !p.isHole).length;
}
