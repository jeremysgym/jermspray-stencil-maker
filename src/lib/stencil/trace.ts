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
 * - Optional background <rect>, automatically dropped if it equals the layer
 */
function normalizeSvg(
  svg: string,
  width: number,
  height: number,
  color: RGB,
  background: RGB | null,
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

  // Normalize remaining path fills to the exact requested hex color; no stroke.
  const hex = rgbHex(color);
  out = out.replace(/fill="rgba\([^"]*\)"/gi, `fill="${hex}"`);
  out = out.replace(/fill="rgb\([^"]*\)"/gi, `fill="${hex}"`);
  out = out.replace(/\sfill-opacity="[^"]*"/gi, "");
  out = out.replace(/\sstroke="[^"]*"/gi, "");
  out = out.replace(/\sstroke-width="[^"]*"/gi, "");
  out = out.replace(/\sstroke-opacity="[^"]*"/gi, "");

  // Rebuild the opening <svg> tag with locked Cricut scaling.
  out = out.replace(/<svg\b[^>]*>/i, () =>
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${width}px" height="${height}px" ` +
    `viewBox="0 0 ${width} ${height}">`,
  );

  // Inject background rect *after* the opening tag (so paths render on top).
  // Skip when it would match the layer color — keeps the cut visible.
  if (background && !colorsConflict(background, color)) {
    const bgHex = rgbHex(background);
    out = out.replace(
      /(<svg\b[^>]*>)/i,
      `$1<rect x="0" y="0" width="${width}" height="${height}" fill="${bgHex}"/>`,
    );
  }

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
  const bg =
    opts.background == null ? null : toRgb(opts.background);
  return normalizeSvg(raw, layer.width, layer.height, color, bg);
}

export function traceSilhouetteToSvg(
  layer: ImageData,
  opts: TraceOptions = {},
): string {
  return traceLayerToSvg(layer, [0, 0, 0], opts);
}
