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

/* -------------------------------------------------------
   MAIN ENTRY
------------------------------------------------------- */
export function buildStencilLayers(
  svg: string,
  paths: BridgedPath[],
  opts: LayerOptions,
): StencilLayers {
  const base = buildBaseLayer(svg, paths);
  const cut = buildCutLayer(svg, paths);
  const detail = buildDetailLayer(svg, paths);
  const align = buildAlignmentLayer(opts.width, opts.height);

  return { base, cut, detail, align };
}

/* -------------------------------------------------------
   BASE LAYER
   - Solid fill stencil preview
------------------------------------------------------- */
function buildBaseLayer(svg: string, paths: BridgedPath[]): string {
  let out = svg;

  // ensure visible fill
  out = out.replace(/fill="none"/g, 'fill="#000000"');

  // remove bridge artifacts from preview
  out = stripBridgeRects(out);

  return out;
}

/* -------------------------------------------------------
   CUT LAYER
   - actual Cricut cut paths
------------------------------------------------------- */
function buildCutLayer(svg: string, paths: BridgedPath[]): string {
  let out = svg;

  // remove fills, keep outlines
  out = out.replace(/fill="[^"]*"/g, 'fill="none"');

  // enforce cut stroke
  out = out.replace(
    /<path\b/g,
    `<path stroke="#000000" stroke-width="1" fill="none"`
  );

  out = stripBridgeRects(out);

  return out;
}

/* -------------------------------------------------------
   DETAIL LAYER
   - fine stroke preview for UI
------------------------------------------------------- */
function buildDetailLayer(svg: string, paths: BridgedPath[]): string {
  let out = svg;

  out = out.replace(
    /stroke-width="[^"]*"/g,
    'stroke-width="0.4"'
  );

  return stripBridgeRects(out);
}

/* -------------------------------------------------------
   ALIGNMENT LAYER
------------------------------------------------------- */
function buildAlignmentLayer(w: number, h: number): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg"
     width="${w}"
     height="${h}"
     viewBox="0 0 ${w} ${h}">
  <rect x="10" y="10" width="10" height="10" fill="none" stroke="black"/>
  <rect x="${w - 20}" y="10" width="10" height="10" fill="none" stroke="black"/>
  <rect x="10" y="${h - 20}" width="10" height="10" stroke="black" fill="none"/>
  <rect x="${w - 20}" y="${h - 20}" width="10" height="10" stroke="black" fill="none"/>
</svg>
  `.trim();
}

/* -------------------------------------------------------
   REMOVE BRIDGE MARKERS FROM OUTPUT
------------------------------------------------------- */
function stripBridgeRects(svg: string): string {
  return svg.replace(/<rect[^>]*bridge[^>]*>/gi, "");
}