import { DOMParser } from "@xmldom/xmldom";

export interface SvgDocument {
  document: Document;
  root: Element;
}

export function parseSvg(svg: string): SvgDocument {
  const parser = new DOMParser();

  const document = parser.parseFromString(svg, "image/svg+xml");

  const root = document.documentElement;

  if (!root || root.nodeName !== "svg") {
    throw new Error("Invalid SVG document.");
  }

  return {
    document,
    root,
  };
}