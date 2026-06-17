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
}

function rgbHex(c: RGB): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

/**
 * Post-process imagetracer SVG output for Cricut Design Space compatibility:
 * - Add XML prolog + xmlns
 * - Force explicit pixel width/height attributes (Cricut imports at 96 DPI)
 * - Ensure viewBox uses source pixel coordinates (1:1 with width/height)
 * - Strip any fully-transparent background paths so no invisible cut lines
 * - Force single-color fill to the requested color (no stroke)
 */
function normalizeSvg(svg: string, width: number, height: number, color: RGB): string {
  let out = svg;

  // Strip any <desc>, comments, and the imagetracer signature.
  out = out.replace(/<desc[\s\S]*?<\/desc>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // Remove paths whose fill is transparent (alpha 0) — these are the
  // background palette entry and would otherwise become invisible cut lines.
  out = out.replace(
    /<path\b[^>]*fill="rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)"[^>]*\/>/gi,
    "",
  );
  out = out.replace(
    /<path\b[^>]*fill-opacity="0"[^>]*\/>/gi,
    "",
  );

  // Normalize remaining path fills to the exact requested hex color and
  // ensure no stroke (Cricut treats strokes as separate cut/draw lines).
  const hex = rgbHex(color);
  out = out.replace(/fill="rgba\([^"]*\)"/gi, `fill="${hex}"`);
  out = out.replace(/fill="rgb\([^"]*\)"/gi, `fill="${hex}"`);
  out = out.replace(/\sstroke="[^"]*"/gi, "");
  out = out.replace(/\sstroke-width="[^"]*"/gi, "");

  // Ensure xmlns + explicit pixel width/height + viewBox in source pixels.
  // Replace the opening <svg ...> tag entirely.
  out = out.replace(/<svg\b[^>]*>/i, (match) => {
    // Preserve nothing from imagetracer's svg tag — rebuild cleanly.
    void match;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${width}px" height="${height}px" ` +
      `viewBox="0 0 ${width} ${height}">`
    );
  });

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
  return normalizeSvg(raw, layer.width, layer.height, color);
}

export function traceSilhouetteToSvg(layer: ImageData, opts: TraceOptions = {}): string {
  return traceLayerToSvg(layer, [0, 0, 0], opts);
}
