import ImageTracer from "imagetracerjs";

import type { RGB } from "./quantize";
import { normalizeSvg } from "./normalizeSvg";
import { optimizeSvg } from "./svgo";

// NEW geometry engine (we will fully build this next)
import {
  parseSvgPaths,
  analyzeGeometry,
  generateBridges,
  buildStencilLayers,
} from "./stencilgeometry";

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

export function traceCore(
  imageData: ImageData,
  color: RGB,
  options: TraceOptions,
): StencilLayers {
  const rawSvg = ImageTracer.imagedataToSVG(imageData, {
    ltres: options.ltres ?? 1,
    qtres: options.qtres ?? 1,
    pathomit: options.pathomit ?? 8,
    scale: options.scale ?? 1,
    numberofcolors: 12,
    colorquantcycles: 2,
    strokewidth: 0,
  });

  // 1. Clean + normalize SVG
  let svg = normalizeSvg(
    rawSvg,
    imageData.width,
    imageData.height,
    color,
  );

  // 2. Optimize SVG structure
  svg = optimizeSvg(svg);

  // 3. 🔥 GEOMETRY ENGINE (NEW CORE)
  const paths = parseSvgPaths(svg);

  const geometry = analyzeGeometry(paths, {
    width: imageData.width,
    height: imageData.height,
  });

  const bridged = generateBridges(geometry);

  const layers = buildStencilLayers(svg, bridged, {
    width: imageData.width,
    height: imageData.height,
  });

  return layers;
}

/**
 * Backwards compatible single export (used by UI)
 */
export function traceLayerToSvg(
  imageData: ImageData,
  color: RGB,
  options: TraceOptions = {},
): string {
  return traceCore(imageData, color, options).base;
}