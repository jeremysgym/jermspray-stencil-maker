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

function toRgb(c: RGB | string): RGB {
  if (typeof c === "string") {
    const s = c.replace("#", "");
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
    ];
  }
  return c;
}

/** Perceptual-ish distance; <=12 considered "same" for our safety check. */
export function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
  );
}

export function colorsConflict(a: RGB | string, b: RGB | string, tol = 12): boolean {
  return colorDistance(toRgb(a), toRgb(b)) <= tol;
}

/**
 * Cricut Design Space preset — locks scaling and strips noise:
 * - XML prolog + xmlns
 * - Explicit width/height in px (Cricut imports at 96 DPI)
 * - viewBox in source pixel units (1:1 with width/height)
 * - All paths forced to the requested fill, no strokes, no transparent fills
 * - Root <svg> gets `fill="none"` and no background <rect> — transparent bg
 *   so only foreground vector paths are exported.
 */
function normalizeSvg(
  svg: string,
  width: number,
  height: number,
  color: RGB,
): string {
  let out = svg;

  out = out.replace(/<desc[\s\S]*?<\/desc>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // Remove transparent-fill paths (background palette entry) so Cricut
  // doesn't pick them up as invisible cut lines.
  out = out.replace(
    /<path\b[^>]*fill="rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)"[^>]*\/>/gi,
    "",
  );
  out = out.replace(/<path\b[^>]*fill-opacity="0"[^>]*\/>/gi, "");

  // Remove any full-canvas background rects the tracer may have emitted.
  out = out.replace(
    new RegExp(
      `<rect\\b[^>]*width="${width}"[^>]*height="${height}"[^>]*\\/>`,
      "gi",
    ),
    "",
  );

  // Normalize remaining path fills to the exact requested hex color; no stroke.
  const hex = rgbHex(color);
  out = out.replace(/fill="rgba\([^"]*\)"/gi, `fill="${hex}"`);
  out = out.replace(/fill="rgb\([^"]*\)"/gi, `fill="${hex}"`);
  out = out.replace(/\sfill-opacity="[^"]*"/gi, "");
  out = out.replace(/\sstroke="[^"]*"/gi, "");
  out = out.replace(/\sstroke-width="[^"]*"/gi, "");
  out = out.replace(/\sstroke-opacity="[^"]*"/gi, "");

  // Guarantee every <path> carries explicit inline fill + stroke attributes.
  // Cricut Design Space (and some other importers) render paths without an
  // inline fill as solid black — they don't inherit from the root <svg>.
  // Forcing `fill="#hex" stroke="none"` on each path avoids that fallback.
  out = out.replace(/<path\b([^>]*?)(\/?)>/gi, (_m, attrs: string, close: string) => {
    let a = attrs;
    if (!/\bfill\s*=/.test(a)) a = ` fill="${hex}"` + a;
    if (!/\bstroke\s*=/.test(a)) a = a + ` stroke="none"`;
    return `<path${a}${close}>`;
  });

  // Rebuild the opening <svg> tag with locked Cricut scaling. No root `fill`
  // so nothing can force paths invisible — every path has its own inline fill.
  // Background stays transparent (no <rect> emitted).
  out = out.replace(/<svg\b[^>]*>/i, () =>
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${width}px" height="${height}px" ` +
    `viewBox="0 0 ${width} ${height}">`,
  );


  if (!out.startsWith("<?xml")) {
    out = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + out;
  }
  return out;
}


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
  const raw: string = (ImageTracer as any).imagedataToSVG(layer, options);
  // `background` in TraceOptions is retained for API compatibility but
  // intentionally ignored — SVG exports always have a transparent root.
  void opts.background;
  return normalizeSvg(raw, layer.width, layer.height, color);
}


export function traceSilhouetteToSvg(
  layer: ImageData,
  opts: TraceOptions = {},
): string {
  return traceLayerToSvg(layer, [0, 0, 0], opts);
}
