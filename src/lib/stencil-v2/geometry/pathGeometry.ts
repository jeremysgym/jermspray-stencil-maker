// src/lib/stencil-v2/geometry/pathGeometry.ts

import { ParsedSvgElement } from "../parser/svgParser";

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GeometryPath {
  id?: string;
  element: ParsedSvgElement;
  bbox: BoundingBox;
  area: number;
  isHole: boolean;
  parentId?: string;
}

export function buildGeometry(
  elements: ParsedSvgElement[],
): GeometryPath[] {
  return elements.map((element) => ({
    id: element.id,
    element,
    bbox: emptyBox(),
    area: 0,
    isHole: false,
    parentId: undefined,
  }));
}

function emptyBox(): BoundingBox {
  return {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  };
}

export function findById(
  paths: GeometryPath[],
  id: string,
): GeometryPath | undefined {
  return paths.find((p) => p.id === id);
}

export function holes(
  paths: GeometryPath[],
): GeometryPath[] {
  return paths.filter((p) => p.isHole);
}

export function solids(
  paths: GeometryPath[],
): GeometryPath[] {
  return paths.filter((p) => !p.isHole);
}
