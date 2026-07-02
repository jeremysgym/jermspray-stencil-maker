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
  const hex = rgbHex(color);

  // Strip metadata that some SVG parsers choke on.
  out = out.replace(/<desc[\s\S]*?<\/desc>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // Delete any <path> that represents the transparent palette entry.
  // imagetracerjs emits it as `fill="rgb(255,255,255)" ... opacity="0"`,
  // NOT rgba — so match on `opacity="0"` (also covers `fill-opacity="0"`).
  // If we don't strip this, the next step rewrites its fill to the layer
  // hex and Cricut renders it as a full-canvas colored rectangle,
  // hiding the actual stencil shapes.
  out = out.replace(
    /<path\b[^>]*\s(?:fill-)?opacity="0(?:\.0+)?"[^>]*\/>/gi,
    "",
  );
  out = out.replace(
    /<path\b[^>]*fill="rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)"[^>]*\/>/gi,
    "",
  );

  // Remove any full-canvas background rects the tracer may have emitted.
  out = out.replace(
    new RegExp(
      `<rect\\b[^>]*width="${width}"[^>]*height="${height}"[^>]*\\/>`,
      "gi",
    ),
    "",
  );

  // Normalize remaining path fills to the exact requested hex color and
  // strip stroke / opacity attributes that could hide or recolor paths.
  out = out.replace(/fill="rgba\([^"]*\)"/gi, `fill="${hex}"`);
  out = out.replace(/fill="rgb\([^"]*\)"/gi, `fill="${hex}"`);
  out = out.replace(/\sfill-opacity="[^"]*"/gi, "");
  out = out.replace(/\sopacity="[^"]*"/gi, "");
  out = out.replace(/\sstroke="[^"]*"/gi, "");
  out = out.replace(/\sstroke-width="[^"]*"/gi, "");
  out = out.replace(/\sstroke-opacity="[^"]*"/gi, "");

  // Guarantee every remaining <path> carries explicit inline fill + stroke.
  // Cricut Design Space renders paths without inline fill as solid black
  // and doesn't inherit from the root <svg>.
  out = out.replace(/<path\b([^>]*?)(\/?)>/gi, (_m, attrs: string, close: string) => {
    let a = attrs;
    if (!/\bfill\s*=/.test(a)) a = ` fill="${hex}"` + a;
    if (!/\bstroke\s*=/.test(a)) a = a + ` stroke="none"`;
    return `<path${a}${close}>`;
  });

  // Rebuild the opening <svg> tag with locked Cricut scaling; no root fill
  // (each path has its own inline fill). Background stays transparent.
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

/**
 * Validate a generated Cricut SVG before download:
 *  - at least one <path> element remains
 *  - every <path>, <rect>, <circle>, <polygon> has an inline fill
 *    (either "#..." or "none") and inline stroke attribute
 *  - no leftover rgb()/rgba() fills — those signal an unnormalized element
 * Throws with a descriptive message on failure.
 */
export function validateExportSvg(svg: string): void {
  const pathCount = (svg.match(/<path\b/gi) || []).length;
  if (pathCount === 0) {
    throw new Error("SVG has no <path> elements — the export would be empty.");
  }
  const shapeRe = /<(path|rect|circle|ellipse|polygon|polyline)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = shapeRe.exec(svg)) !== null) {
    const attrs = m[2];
    if (!/\bfill\s*=\s*"(?:#[0-9a-f]{3,8}|none)"/i.test(attrs)) {
      throw new Error(
        `<${m[1]}> is missing an explicit inline fill (must be "#HEX" or "none").`,
      );
    }
    if (!/\bstroke\s*=/i.test(attrs)) {
      throw new Error(`<${m[1]}> is missing an explicit inline stroke attribute.`);
    }
    if (/fill\s*=\s*"rgba?\(/i.test(attrs)) {
      throw new Error(`<${m[1]}> still has a non-hex rgb() fill after normalization.`);
    }
  }
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
