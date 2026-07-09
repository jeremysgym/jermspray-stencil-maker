import type { SvgDocument } from "./svgParser";

const SHAPE_TAGS = new Set([
  "path",
  "polygon",
  "polyline",
  "circle",
  "ellipse",
  "rect",
  "line",
]);

export interface ColorShape {
  id?: string;
  tag: string;
  fill: string | null;
  stroke: string | null;
  transform?: string;
  element: Element;
}

export interface ColorLayer {
  color: string;
  elements: ColorShape[];
}

export function extractColorLayers(svg: SvgDocument): ColorLayer[] {
  const groups = new Map<string, ColorShape[]>();

  for (const shape of collectShapes(svg.root)) {
    const color = normalizeFill(shape.fill);

    if (!groups.has(color)) {
      groups.set(color, []);
    }

    groups.get(color)!.push(shape);
  }

  return Array.from(groups.entries())
    .map(([color, elements]) => ({ color, elements }))
    .sort((a, b) => a.color.localeCompare(b.color));
}

export function getLayer(
  layers: ColorLayer[],
  color: string,
): ColorLayer | undefined {
  return layers.find(
    (layer) => layer.color.toLowerCase() === color.toLowerCase(),
  );
}

export function layerCount(layers: ColorLayer[]): number {
  return layers.length;
}

function collectShapes(root: Element): ColorShape[] {
  const shapes: ColorShape[] = [];
  const nodes = root.getElementsByTagName("*");

  for (let i = 0; i < nodes.length; i++) {
    const element = nodes[i];
    const tag = element.tagName.toLowerCase();

    if (!SHAPE_TAGS.has(tag)) {
      continue;
    }

    shapes.push({
      id: element.getAttribute("id") ?? undefined,
      tag,
      fill: element.getAttribute("fill"),
      stroke: element.getAttribute("stroke"),
      transform: element.getAttribute("transform") ?? undefined,
      element,
    });
  }

  return shapes;
}

function normalizeFill(fill: string | null): string {
  if (!fill || fill.trim() === "") {
    return "#000000";
  }

  const value = fill.trim().toLowerCase();

  if (value === "none") {
    return "none";
  }

  return value;
}
