import type { ColorLayer, ColorShape } from "../parser/colorExtractor";

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GeometryPath {
  id?: string;
  element: ColorShape;
  bbox: BoundingBox;
  area: number;
  isHole: boolean;
  parentId?: string;
}

export function buildGeometry(elements: ColorShape[]): GeometryPath[] {
  return elements.map((element) => ({
    id: element.id,
    element,
    bbox: emptyBox(),
    area: 0,
    isHole: false,
    parentId: undefined,
  }));
}

export function buildLayerGeometry(layer: ColorLayer): GeometryPath[] {
  return buildGeometry(layer.elements);
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
  return paths.find((path) => path.id === id);
}

export function holes(paths: GeometryPath[]): GeometryPath[] {
  return paths.filter((path) => path.isHole);
}

export function solids(paths: GeometryPath[]): GeometryPath[] {
  return paths.filter((path) => !path.isHole);
}
