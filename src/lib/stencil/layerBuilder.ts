import type { BridgedPath } from "./bridgeGenerator";

export type StencilLayers = {
  base: string;
  cut: string;
  detail: string;
  align: string;
};

export type LayerOptions = {
  width: number;
  height: number;
  strokeWidth?: number;
};

export function buildStencilLayers(
  svg: string,
  paths: BridgedPath[],
  opts: LayerOptions,
): StencilLayers {
  const baseSvg = stripBridgeRects(svg);

  return {
    base: buildBaseLayer(baseSvg),
    cut: buildCutLayer(baseSvg),
    detail: buildDetailLayer(baseSvg),
    align: buildAlignmentLayer(opts.width, opts.height),
  };
}

function buildBaseLayer(svg: string): string {
  return svg
    .replace(/fill="none"/gi, 'fill="#000000"')
    .replace(/stroke="[^"]*"/gi, "")
    .replace(/stroke-width="[^"]*"/gi, "");
}

function buildCutLayer(svg: string): string {
  return svg
    .replace(/fill="[^"]*"/gi, 'fill="none"')
    .replace(/stroke="[^"]*"/gi, 'stroke="#000000"')
    .replace(/stroke-width="[^"]*"/gi, 'stroke-width="1"')
    .replace(
      /<path(?![^>]*stroke=)/gi,
      '<path stroke="#000000" stroke-width="1" fill="none"'
    );
}

function buildDetailLayer(svg: string): string {
  return svg
    .replace(/fill="none"/gi, 'fill="#000000"')
    .replace(/stroke-width="[^"]*"/gi, 'stroke-width="0.4"')
    .replace(
      /<path(?![^>]*stroke=)/gi,
      '<path stroke="#000000" stroke-width="0.4"'
    );
}

function buildAlignmentLayer(width: number, height: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${width}"
     height="${height}"
     viewBox="0 0 ${width} ${height}">
  <rect x="10" y="10" width="10" height="10" fill="none" stroke="#000"/>
  <rect x="${width - 20}" y="10" width="10" height="10" fill="none" stroke="#000"/>
  <rect x="10" y="${height - 20}" width="10" height="10" fill="none" stroke="#000"/>
  <rect x="${width - 20}" y="${height - 20}" width="10" height="10" fill="none" stroke="#000"/>
</svg>`;
}

function stripBridgeRects(svg: string): string {
  return svg.replace(
    /<rect[^>]*(?:bridge|bridge-marker)[^>]*\/?>/gi,
    "",
  );
}