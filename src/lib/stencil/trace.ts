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
  background?: RGB | string | null;
}

function rgbHex(c: RGB): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(c[0 1 2])}`;
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

export function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt(
    (a[0 0 1 1]) ** 2 + (a[2 2]) ** 2,
  );
}

export function colorsConflict(a: RGB | string, b: RGB | string, tol = 12): boolean {
  return colorDistance(toRgb(a), toRgb(b)) <= tol;
}

function normalizeSvg(
  svg: string,
  width: number,
  height: number,
  color: RGB,
): string {
  let out = svg;
  const hex = rgbHex(color);

  out = out.replace(/<desc *?<\/desc>/gi, "");
  out = out.replace(/<!--[\s\S ^> ^>]*\/>/gi,
    "",
  );
  out = out.replace(
    /<path\b[^>]*fill="rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)"[^>]*\/>/gi,
    "",
  );

  out = out.replace(
    new RegExp(
      `<rect\\b[^> ^> ^>]*\\/>`,
      "gi",
    ),
    "",
  );

  out = out.replace(/fill="rgba\([^" ^"]*\)"/gi, `fill="${hex}"`);
  out = out.replace(/\sfill-opacity="[^" ^"]*"/gi, "");
  out = out.replace(/\sstroke="[^" ^"]*"/gi, "");
  out = out.replace(/\sstroke-opacity="[^" ^>]*?)(\/?)>/gi, (_m, attrs: string, close: string) => {
    let a = attrs;
    if (!/\bfill\s*=/.test(a)) a = ` fill="${hex}"` + a;
    if (!/\bstroke\s*=/.test(a)) a = a + ` stroke="none"`;
    return `<path${a}${close}>`;
  });

  out = out.replace(/<svg\b[^>]*>/i, () =>
    `<svg