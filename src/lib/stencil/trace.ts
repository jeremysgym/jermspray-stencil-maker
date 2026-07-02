// Bitmap -> vector SVG tracer for Cricut / Silhouette compatibility.
// Wraps imagetracerjs to produce single-color path-based SVGs from an
// isolated layer ImageData (transparent background, single color foreground).

import ImageTracer from "imagetracerjs";
import type { RGB } from "./quantize";

export interface TraceOptions {
  ltres?: number;
  qtres?: number;
  pathomit?: number;
  scale?: number;
  /**
   * Final resolved background color for this export (hex or RGB).
   * Callers (StencilMaker) already handle conflict-detection / swapping
   * before calling in, so this is drawn as-is, no further checks here.
   * Pass null for a transparent background.
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
 * - Root <svg> gets no background rect by default — transparent bg
 *   so only foreground vector paths are exported.
 */
function normalizeSvg( 
svg: string, 
width: number, 
height: number, 
color: RGB, 
): string { 
const hex = rgbHex(color);

let out = svg;

// Remove comments / metadata 
out = out.replace(/<desc[\s\S]*?</desc>/gi, ""); 
out = out.replace(/<!--[\s\S]*?-->/g, "");

// 🚨 HARD FIX: remove ANY path with opacity = 0 (opening or self-closing) 
out = out.replace( 
/<path\b[^>]opacity="0[^"]"[^>]*/?>/gi, 
"" 
);

out = out.replace( 
/<path\b[^>]fill-opacity="0[^"]"[^>]*/?>/gi, 
"" 
);

// Remove full-canvas rectangles (background artifacts) 
out = out.replace( 
/<rect\b[^>]*width="?\d+"?[^>]height="?\d+"?[^>]/>/gi, 
"" 
);

// 🚨 DO NOT blindly recolor everything 
// Instead only set fill IF it is a valid color path (has d attribute) 
out = out.replace( 
/<path\b(?![^>]opacity="0")[^>]>/gi, 
(match) => { 
// remove stroke noise 
let cleaned = match 
.replace(/\sstroke="[^"]"/g, "") 
.replace(/\sstroke-width="[^"]"/g, "") 
.replace(/\sfill-opacity="[^"]"/g, "") 
.replace(/\sopacity="[^"]"/g, "");

  // ensure fill exists
  if (!/fill=/.test(cleaned)) {
    cleaned = cleaned.replace("<path", `<path fill="${hex}"`);
  } else {
    cleaned = cleaned.replace(/fill="[^"]*"/, `fill="${hex}"`);
  }

  // ensure no stroke
  if (!/stroke=/.test(cleaned)) {
    cleaned = cleaned.replace("<path", `<path stroke="none"`);
  }

  return cleaned;
}
);

// Fix SVG root 
out = out.replace( 
/<svg\b[^>]*>/i, 
() => 
<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}"> 
);

if (!out.startsWith("<?xml")) {
out = `<?xml version="1.0" encoding="UTF-8"?>\n` + out; 
}


return out; 
}
  // Strip metadata that some SVG parsers choke on.
  out = out.replace(/<desc[\s\S]*?<\/desc>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // Delete any <path> that represents the transparent palette entry.
  // imagetracerjs emits it as fill="rgb(255,255,255)" ... opacity="0",
  // NOT rgba — so match on opacity="0" (also covers fill-opacity="0").
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
    if (!/\bfill\s*=/.test(a)) a = `fill="${hex}"` + a;
    if (!/\bstroke\s*=/.test(a)) a = a + ` stroke="none"`;
    return `<path${a}${close}>`;
  });

  // Rebuild the opening <svg> tag with locked Cricut scaling; no root fill
  // (each path has its own inline fill). Background stays transparent
  // unless the caller adds a <rect> after this returns.
  out = out.replace(/<svg\b[^>]*>/i, () =>
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}">`,
  );

  if (!out.startsWith("<?xml")) {
    out = '<?xml version="1.0" encoding="UTF-8"?>\n' + out;
  }

  return out;
}

function traceCore(
  imageData: ImageData,
  color: RGB,
  options: TraceOptions,
): string {
  const { ltres = 1, qtres = 1, pathomit = 8, scale = 1, background = null } = options;

  const raw = ImageTracer.imagedataToSVG(imageData, {
    ltres,
    qtres,
    pathomit,
    scale,
    // Force a 2-color palette (transparent + the layer color) so the
    // tracer doesn't quantize/anti-alias into extra shades.
    numberofcolors: 2,
    pal: [
      { r: 255, g: 255, b: 255, a: 0 },
      { r: color[0], g: color[1], b: color[2], a: 255 },
    ],
  });

  let svg = normalizeSvg(raw, imageData.width, imageData.height, color);

  if (background != null) {
    const bgHex = rgbHex(toRgb(background));
    svg = svg.replace(
      /<svg\b[^>]*>/i,
      (tag) =>
        `${tag}<rect x="0" y="0" width="${imageData.width}" height="${imageData.height}" fill="${bgHex}"/>`,
    );
  }

  return svg;
}

/**
 * Traces one isolated color layer (transparent-bg ImageData) into a
 * Cricut/Silhouette-ready SVG string, using the given foreground color.
 */
export function traceLayerToSvg(
  imageData: ImageData,
  color: RGB,
  options: TraceOptions = {},
): string {
  return traceCore(imageData, color, options);
}

/**
 * Traces the full black silhouette (transparent-bg ImageData) into a
 * Cricut/Silhouette-ready SVG string.
 */
export function traceSilhouetteToSvg(
  imageData: ImageData,
  options: TraceOptions = {},
): string {
  return traceCore(imageData, [0, 0, 0], options);
}

/**
 * Throws if the generated SVG is unsafe to hand to Cricut/Silhouette —
 * e.g. empty output, missing root element/dimensions, no traced paths,
 * or corrupted numeric path data.
 */
export function validateExportSvg(svg: string): void {
  if (!svg || typeof svg !== "string") {
    throw new Error("Empty SVG output");
  }
  if (!/<svg\b/i.test(svg)) {
    throw new Error("Missing <svg> root element");
  }
  if (!/\bwidth="[\d.]+(?:px)?"/i.test(svg) || !/\bheight="[\d.]+(?:px)?"/i.test(svg)) {
    throw new Error("Missing explicit width/height on <svg> root");
  }
  const pathCount = (svg.match(/<path\b/gi) || []).length;
  if (pathCount === 0) {
    throw new Error("No traced paths found — layer may be empty or fully transparent");
  }
  if (/NaN|Infinity/i.test(svg)) {
    throw new Error("SVG contains invalid numeric path data (NaN/Infinity)");
  }
}
