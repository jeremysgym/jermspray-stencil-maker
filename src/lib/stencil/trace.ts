// Bitmap -> vector SVG tracer for Cricut / Silhouette compatibility.
// Wraps imagetracerjs to produce single-color path-based SVGs from an
// isolated layer ImageData (transparent background, single color foreground).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import ImageTracer from "imagetracerjs";
import type { RGB } from "./quantize";

export interface TraceOptions {
  // Path precision / smoothing
  ltres?: number;
  qtres?: number;
  pathomit?: number;
  // Scale of output paths (1 = source pixels)
  scale?: number;
}

/**
 * Trace an isolated single-color layer (transparent background) into a
 * Cricut-compatible SVG with vector <path> elements (no embedded raster).
 */
export function traceLayerToSvg(
  layer: ImageData,
  color: RGB,
  opts: TraceOptions = {},
): string {
  const options = {
    ltres: opts.ltres ?? 1,
    qtres: opts.qtres ?? 1,
    pathomit: opts.pathomit ?? 8,
    rightangleenhance: true,
    colorsampling: 0,
    numberofcolors: 2,
    mincolorratio: 0,
    colorquantcycles: 1,
    blurradius: 0,
    blurdelta: 20,
    strokewidth: 0,
    linefilter: false,
    scale: opts.scale ?? 1,
    roundcoords: 1,
    viewbox: true,
    desc: false,
    pal: [
      { r: 255, g: 255, b: 255, a: 0 },
      { r: color[0], g: color[1], b: color[2], a: 255 },
    ],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg: string = (ImageTracer as any).imagedataToSVG(layer, options);
  // Ensure XML prolog + xmlns for Cricut Design Space compatibility.
  let out = svg;
  if (!/xmlns=/.test(out)) {
    out = out.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  if (!out.startsWith("<?xml")) {
    out = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + out;
  }
  return out;
}

/**
 * Trace a silhouette mask (black foreground, transparent background) into SVG.
 */
export function traceSilhouetteToSvg(layer: ImageData, opts: TraceOptions = {}): string {
  return traceLayerToSvg(layer, [0, 0, 0], opts);
}
