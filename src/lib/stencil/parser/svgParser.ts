// src/lib/stencil-v2/parser/svgParser.ts

export interface SvgElementNode {
  id?: string;
  tag: string;
  fill: string | null;
  stroke: string | null;
  d?: string;
  transform?: string;
  element: Element;
}

export interface ParsedSvg {
  document: XMLDocument;
  root: SVGSVGElement;
  width: number;
  height: number;
  viewBox: string;
  elements: SvgElementNode[];
}

export function parseSvg(svg: string): ParsedSvg {
  const parser = new DOMParser();

  const document = parser.parseFromString(svg, "image/svg+xml");

  const root = document.documentElement as SVGSVGElement;

  if (root.nodeName === "parsererror") {
    throw new Error("Invalid SVG");
  }

  const width =
    parseFloat(root.getAttribute("width") || "0") || 0;

  const height =
    parseFloat(root.getAttribute("height") || "0") || 0;

  const viewBox =
    root.getAttribute("viewBox") ??
    `0 0 ${width} ${height}`;

  const supported = [
    "path",
    "polygon",
    "polyline",
    "rect",
    "circle",
    "ellipse",
    "line",
  ];

  const elements: SvgElementNode[] = [];

  supported.forEach((tag) => {
    root.querySelectorAll(tag).forEach((node) => {
      elements.push({
        id: node.getAttribute("id") ?? undefined,
        tag,
        fill: node.getAttribute("fill"),
        stroke: node.getAttribute("stroke"),
        d: node.getAttribute("d") ?? undefined,
        transform:
          node.getAttribute("transform") ?? undefined,
        element: node,
      });
    });
  });

  return {
    document,
    root,
    width,
    height,
    viewBox,
    elements,
  };
}
