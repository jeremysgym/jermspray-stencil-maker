import type { RGB } from "./quantize";

function rgbHex(color: RGB): string {
  const [r, g, b] = color;
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * SAFE Cricut SVG normalizer (no DOMParser dependency)
 */
export function normalizeSvg(
  svg: string,
  width: number,
  height: number,
  color: RGB,
): string {
  const hex = rgbHex(color);

  let out = svg;

  // -----------------------------
  // 1. Fix root SVG tag (CRITICAL)
  // -----------------------------
  out = out.replace(
    /<svg\b[^>]*>/i,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}">`
  );

  // -----------------------------
  // 2. Remove metadata junk
  // -----------------------------
  out = out.replace(/<desc[\s\S]*?<\/desc>/gi, "");
  out = out.replace(/<metadata[\s\S]*?<\/metadata>/gi, "");
  out = out.replace(/<title[\s\S]*?<\/title>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // -----------------------------
  // 3. Remove invisible paths
  // -----------------------------
  out = out.replace(
    /<path\b[^>]*opacity="0[^"]*"[^>]*\/?>/gi,
    ""
  );

  out = out.replace(
    /<path\b[^>]*fill-opacity="0[^"]*"[^>]*\/?>/gi,
    ""
  );

  // -----------------------------
  // 4. Remove strokes completely
  // -----------------------------
  out = out.replace(/\sstroke="[^"]*"/gi, "");
  out = out.replace(/\sstroke-width="[^"]*"/gi, "");
  out = out.replace(/\sstroke-opacity="[^"]*"/gi, "");

  // -----------------------------
  // 5. Force fill color
  // -----------------------------
  out = out.replace(/fill="[^"]*"/gi, `fill="${hex}"`);

  // ensure paths always have fill
  out = out.replace(/<path\b(?![^>]*fill=)/gi, `<path fill="${hex}"`);

  // -----------------------------
  // 6. Remove full-canvas rects
  // -----------------------------
  out = out.replace(
    new RegExp(
      `<rect\\b[^>]*width="${width}"[^>]*height="${height}"[^>]*\\/>`,
      "gi"
    ),
    ""
  );

  // -----------------------------
  // 7. Ensure XML header
  // -----------------------------
  if (!out.startsWith("<?xml")) {
    out = `<?xml version="1.0" encoding="UTF-8"?>\n` + out;
  }

  return out;
}