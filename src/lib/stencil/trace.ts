import ImageTracer from "imagetracerjs";

import type { RGB } from "./quantize";
import { normalizeSvg } from "./normalizeSvg";
import { optimizeSvg } from "./svgo";

import {
  parseSvgPaths,
  analyzeGeometry,
} from "./stencilGeometry";

import {
  generateBridges,
} from "./bridgeGenerator";

import {
  buildStencilLayers,
} from "./layerBuilder";

import {
  exportStencilPackage,
} from "./exporter";

export type TraceOptions = {
  ltres?: number;
  qtres?: number;
  pathomit?: number;
  scale?: number;
  background?: RGB | string | null;

  /** if true → returns ZIP instead of SVG */
  exportZip?: boolean;

  /** name of exported file set */
  name?: string;
};

type StencilResult = {
  base: string;
  cut: string;
  detail: string;
  align: string;
};

/* -------------------------------------------------------
   MAIN PIPELINE
------------------------------------------------------- */
export async function traceCore(
  imageData: ImageData,
  color: RGB,
  options: TraceOptions = {},
): Promise<StencilResult | Blob> {
  const rawSvg = ImageTracer.imagedataToSVG(imageData, {
    ltres: options.ltres ?? 1,
    qtres: options.qtres ?? 1,
    pathomit: options.pathomit ?? 8,
    scale: options.scale ?? 1,
    numberofcolors: 12,
    colorquantcycles: 2,
    strokewidth: 0,
  });

  // 1. Normalize SVG (Cricut-safe)
  let svg = normalizeSvg(
    rawSvg,
    imageData.width,
    imageData.height,
    color,
  );

  // 2. Optimize SVG structure
  svg = optimizeSvg(svg);

  // 3. Geometry analysis
  const paths = parseSvgPaths(svg);
  const geometry = analyzeGeometry(paths);

  // 4. Bridge generation
  const bridged = generateBridges(geometry.paths);

  // 5. Build stencil layers
  const layers = buildStencilLayers(svg, bridged, {
    width: imageData.width,
    height: imageData.height,
  });

  // -----------------------------
  // EXPORT MODE (ZIP)
  // -----------------------------
  if (options.exportZip) {
    return await exportStencilPackage(layers, {
      name: options.name ?? "stencil",
    });
  }

  // -----------------------------
  // DEFAULT MODE (LAYERS)
  // -----------------------------
  return layers;
}

/* -------------------------------------------------------
   BACKWARD COMPATIBILITY
------------------------------------------------------- */
export function traceLayerToSvg(
  imageData: ImageData,
  color: RGB,
  options: TraceOptions = {},
): string {
  return ImageTracer.imagedataToSVG(imageData, {
    ltres: options.ltres ?? 1,
    qtres: options.qtres ?? 1,
    pathomit: options.pathomit ?? 8,
    scale: options.scale ?? 1,
    numberofcolors: 12,
    colorquantcycles: 2,
    strokewidth: 0,
  });
}