import ImageTracer from "imagetracerjs";
import { optimizeSvg } from "./svgo";
import { normalizeSvg } from "./normalizeSvg";
import type { RGB } from "./quantize";

export type TraceOptions = {
  ltres?: number;
  qtres?: number;
  pathomit?: number;
  scale?: number;
  background?: RGB | string | null;
};

type StencilLayers = {
  base: string;
  cut: string;
  detail: string;
  align: string;
};

function addAlignment(svg: string, w: number, h: number): string {
  return svg.replace(
    /<\/svg>/,
    `
    <g id="align">
      <rect x="10" y="10" width="10" height="10" fill="none" stroke="black"/>
      <rect x="${w - 20}" y="10" width="10" height="10" fill="none" stroke="black"/>
      <rect x="10" y="${h - 20}" width="10" height="10" fill="none" stroke="black"/>
      <rect x="${w - 20}" y="${h - 20}" width="10" height="10" fill="none" stroke="black"/>
    </g>
    </svg>
  `,
  );
}

function addBridges(svg: string): string {
  return svg.replace(/fill-rule="evenodd"/g, "fill-rule=\"nonzero\"");
}

export function traceCore(
  imageData: ImageData,
  color: RGB,
  options: TraceOptions,
): StencilLayers {
  const raw = ImageTracer.imagedataToSVG(imageData, {
    ltres: options.ltres ?? 1,
    qtres: options.qtres ?? 1,
    pathomit: options.pathomit ?? 8,
    scale: options.scale ?? 1,
    numberofcolors: 12,
    colorquantcycles: 2,
    strokewidth: 0,
  });

  // cleanup bad paths
  let svg = raw.replace(/<path[^>]*d="[^"]{20000,}"[^>]*>/g, "");

  // normalize → optimize
  svg = normalizeSvg(svg, imageData.width, imageData.height, color);
  svg = optimizeSvg(svg);

  // stencil adjustments
  svg = addBridges(svg);

  // ---------------- base
  const base = svg
    .replace(/stroke="[^"]*"/g, "")
    .replace(/fill="none"/g, 'fill="#000000"');

  // ---------------- cut
  const cut = svg
    .replace(/fill="[^"]*"/g, 'fill="none"')
    .replace(/stroke="none"/g, 'stroke="#000000"')
    .replace(/stroke-width="[^"]*"/g, 'stroke-width="1"');

  // ---------------- detail
  const detail = svg.replace(/stroke-width="[^"]*"/g, 'stroke-width="0.35"');

  // ---------------- align
  const align = addAlignment(svg, imageData.width, imageData.height);

  // optional background
  let finalBase = base;
  if (options.background) {
    finalBase = finalBase.replace(
      /<svg\b[^>]*>/i,
      (tag) =>
        `${tag}<rect width="${imageData.width}" height="${imageData.height}" fill="black"/>`,
    );
  }

  return {
    base: finalBase,
    cut,
    detail,
    align,
  };
}

export function traceLayerToSvg(
  imageData: ImageData,
  color: RGB,
  options: TraceOptions = {},
): string {
  const layers = traceCore(imageData, color, options);
  return layers.base;
}