import type { ColorLayer } from "../parser/colorExtractor";
import type { BridgeCandidate, BridgePoint } from "../geometry/bridgeEngine";
import type { GeometryPath } from "../geometry/pathGeometry";

export type LayerKind = "base" | "cut" | "detail" | "align";

export interface LayerCanvas {
  width: number;
  height: number;
  viewBox?: string;
}

export interface LayerShapeStyle {
  fill: string | null;
  stroke: string | null;
  strokeWidth?: number;
}

export interface LayerShape {
  path: GeometryPath;
  style: LayerShapeStyle;
  bridges: BridgePoint[];
}

export interface RegistrationMark {
  x: number;
  y: number;
  size: number;
}

export interface StencilLayer {
  kind: LayerKind;
  color: string;
  canvas: LayerCanvas;
  shapes: LayerShape[];
  registrationMarks?: RegistrationMark[];
}

export interface StencilLayerSet {
  base: StencilLayer;
  cut: StencilLayer;
  detail: StencilLayer;
  align: StencilLayer;
}

export interface LayerBuildInput {
  layer: ColorLayer;
  paths: GeometryPath[];
  bridges: BridgeCandidate[];
  canvas: LayerCanvas;
}

const BASE_STYLE: LayerShapeStyle = {
  fill: "#000000",
  stroke: null,
};

const CUT_STYLE: LayerShapeStyle = {
  fill: "none",
  stroke: "#000000",
  strokeWidth: 1,
};

const DETAIL_STYLE: LayerShapeStyle = {
  fill: "#000000",
  stroke: "#000000",
  strokeWidth: 0.4,
};

export function buildStencilLayers(input: LayerBuildInput): StencilLayerSet {
  const bridgeMap = indexBridges(input.bridges);
  const shapes = input.paths.map((path) => ({
    path,
    bridges: bridgeMap.get(path.id ?? "") ?? [],
  }));

  return {
    base: buildStyledLayer("base", input.layer.color, input.canvas, shapes, BASE_STYLE),
    cut: buildStyledLayer("cut", input.layer.color, input.canvas, shapes, CUT_STYLE),
    detail: buildStyledLayer(
      "detail",
      input.layer.color,
      input.canvas,
      shapes,
      DETAIL_STYLE,
    ),
    align: buildAlignmentLayer(input.layer.color, input.canvas),
  };
}

export function layerShapeCount(layer: StencilLayer): number {
  return layer.shapes.length;
}

function buildStyledLayer(
  kind: Exclude<LayerKind, "align">,
  color: string,
  canvas: LayerCanvas,
  shapes: Array<{ path: GeometryPath; bridges: BridgePoint[] }>,
  style: LayerShapeStyle,
): StencilLayer {
  return {
    kind,
    color,
    canvas,
    shapes: shapes.map(({ path, bridges }) => ({
      path,
      style,
      bridges,
    })),
  };
}

function buildAlignmentLayer(color: string, canvas: LayerCanvas): StencilLayer {
  const markSize = 10;
  const inset = 10;

  return {
    kind: "align",
    color,
    canvas,
    shapes: [],
    registrationMarks: [
      { x: inset, y: inset, size: markSize },
      { x: canvas.width - inset - markSize, y: inset, size: markSize },
      { x: inset, y: canvas.height - inset - markSize, size: markSize },
      {
        x: canvas.width - inset - markSize,
        y: canvas.height - inset - markSize,
        size: markSize,
      },
    ],
  };
}

function indexBridges(
  bridges: BridgeCandidate[],
): Map<string, BridgePoint[]> {
  const map = new Map<string, BridgePoint[]>();

  for (const candidate of bridges) {
    if (!candidate.pathId) {
      continue;
    }

    map.set(candidate.pathId, candidate.bridges);
  }

  return map;
}
