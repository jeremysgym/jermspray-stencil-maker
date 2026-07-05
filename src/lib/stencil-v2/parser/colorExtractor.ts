// src/lib/stencil-v2/parser/colorExtractor.ts

import { ParsedSvg, ParsedSvgElement } from "./svgParser";

export interface ColorLayer {
  color: string;
  elements: ParsedSvgElement[];
}

export function extractColorLayers(svg: ParsedSvg): ColorLayer[] {
  const groups = new Map<string, ParsedSvgElement[]>();

  for (const element of svg.elements) {
    const color = normalizeFill(element.fill);

    if (!groups.has(color)) {
      groups.set(color, []);
    }

    groups.get(color)!.push(element);
  }

  return Array.from(groups.entries())
    .map(([color, elements]) => ({
      color,
      elements,
    }))
    .sort((a, b) => a.color.localeCompare(b.color));
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
