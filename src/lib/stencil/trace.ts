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
  const raw = ImageTracer.imagedataToSVG(imageData, {
    ltres: options.ltres ?? 1,
    qtres: options.qtres ?? 1,
    pathomit: options.pathomit ?? 8,
    scale: options.scale ?? 1,
    numberofcolors: 12,
    colorquantcycles: 2,
    strokewidth: 0,
  });
  return normalizeSvg(raw, imageData.width, imageData.height, color);
}

export function traceSilhouetteToSvg(
  imageData: ImageData,
  options: TraceOptions = {},
): string {
  const hexToRgb = (s: string): RGB => {
    const h = s.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16) || 0,
      parseInt(h.slice(2, 4), 16) || 0,
      parseInt(h.slice(4, 6), 16) || 0,
    ];
  };
  const color: RGB =
    typeof options.background === "string"
      ? hexToRgb(options.background)
      : (options.background as RGB) ?? [0, 0, 0];
  const raw = ImageTracer.imagedataToSVG(imageData, {
    ltres: options.ltres ?? 1,
    qtres: options.qtres ?? 1,
    pathomit: options.pathomit ?? 8,
    scale: options.scale ?? 1,
    numberofcolors: 2,
    colorquantcycles: 2,
    strokewidth: 0,
  });
  return normalizeSvg(raw, imageData.width, imageData.height, color);
}

export function colorsConflict(
  a: RGB | string,
  b: RGB | string,
  threshold = 40,
): boolean {
  const toRgb = (c: RGB | string): RGB => {
    if (typeof c !== "string") return c;
    const h = c.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16) || 0,
      parseInt(h.slice(2, 4), 16) || 0,
      parseInt(h.slice(4, 6), 16) || 0,
    ];
  };
  const x = toRgb(a);
  const y = toRgb(b);
  const d = Math.sqrt(
    (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2,
  );
  return d < threshold;
}

export function validateExportSvg(svg: string): void {
  if (!svg || !/<path\b/i.test(svg)) {
    throw new Error("Exported SVG contains no <path> elements.");
  }
  if (!/fill\s*=\s*"(#[0-9a-fA-F]{3,8}|none)"/.test(svg)) {
    throw new Error("Exported SVG paths are missing inline fill attributes.");
  }
}