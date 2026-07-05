// src/lib/stencil-v2/parser/svgParser.ts

export interface ParsedSvgElement {
  id?: string;
  tag: string;
  fill: string | null;
  stroke: string | null;
  transform?: string;
  attributes: Record<string, string>;
  node: Element;
}

export interface ParsedSvg {
  root: SVGSVGElement;
  width: number;
  height: number;
  viewBox: string;
  elements: ParsedSvgElement[];
}

export function parseSvg(svg: string): ParsedSvg {
  const parser = new DOMParser();

  const doc = parser.parseFromString(svg, "image/svg+xml");

  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid SVG.");
  }

  const root = doc.documentElement as SVGSVGElement;

  const width = Number(root.getAttribute("width")) || 0;
  const height = Number(root.getAttribute("height")) || 0;

  const viewBox =
    root.getAttribute("viewBox") ??
    `0 0 ${width} ${height}`;

  const elements: ParsedSvgElement[] = [];

  root.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();

    if (
      ![
        "path",
        "polygon",
        "polyline",
        "circle",
        "ellipse",
        "rect",
        "line",
      ].includes(tag)
    ) {
      return;
    }

    const attributes: Record<string, string> = {};

    for (const attr of Array.from(el.attributes)) {
      attributes[attr.name] = attr.value;
    }

    elements.push({
      id: el.getAttribute("id") ?? undefined,
      tag,
      fill: el.getAttribute("fill"),
      stroke: el.getAttribute("stroke"),
      transform: el.getAttribute("transform") ?? undefined,
      attributes,
      node: el,
    });
  });

  return {
    root,
    width,
    height,
    viewBox,
    elements,
  };
}
