// Bitmap -> vector SVG tracer for Cricut / Silhouette compatibility.
// Wraps imagetracerjs to produce single-color path-based SVGs from an
// isolated layer ImageData (transparent background, single color foreground).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import ImageTracer from "imagetracerjs";
import type { RGB } from "./quantize";

export interface TraceOptions {
  ltres?: number;
  qtres?: number;
  pathomit?: number;
  scale?: number;
  /**
   * Optional background color (hex like "#ffffff" or RGB tuple).
   * - Inserted as a full-bleed <rect> beneath the traced paths.
   * - If it matches the layer color it is automatically omitted so the
   *   layer never disappears into its own background.
   * - Pass `null` (default) for a transparent background.
   */
  background?: RGB | string | null;
}

function rgbHex(c: RGB): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

/** Accepts a hex string or R
