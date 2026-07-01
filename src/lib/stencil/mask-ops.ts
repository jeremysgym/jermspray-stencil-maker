// Morphological + stencil-bridging helpers that operate on ImageData layer
// masks (alpha > 128 = foreground). All functions treat the image as a binary
// mask and preserve the RGB fill color of foreground pixels.

import type { RGB } from "./quantize";

/**
 * Dilate the foreground of an isolated layer by `radius` pixels using a
 * square structuring element (separable, O(w*h) per axis). Fills newly
 * added pixels with `color`. Returns a new ImageData.
 *
 * Used to grow color layers outward to eliminate gaps between adjacent
 * stencil layers ("bleed"). Skip for the silhouette/outline layer.
 */
export function dilateLayer(img: ImageData, radius: number, color: RGB): ImageData {
  if (radius <= 0) return img;
  const w = img.width, h = img.height;
  const n = w * h;
  const src = new Uint8Array(n);
  for (let p = 0; p < n; p++) src[p] = img.data[p * 4 + 3] > 128 ? 1 : 0;

  const r = Math.max(1, Math.round(radius));
  // Horizontal pass — running window max via monotonic deque.
  const horiz = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let count = 0;
    // count of 1s in current window
    // Prime the window [0, r].
    for (let x = 0; x <= Math.min(r, w - 1); x++) count += src[row + x];
    for (let x = 0; x < w; x++) {
      horiz[row + x] = count > 0 ? 1 : 0;
      const addX = x + r + 1;
      if (addX < w) count += src[row + addX];
      const remX = x - r;
      if (remX >= 0) count -= src[row + remX];
    }
  }
  // Vertical pass
  const dst = new Uint8Array(n);
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) count += horiz[y * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = count > 0 ? 1 : 0;
      const addY = y + r + 1;
      if (addY < h) count += horiz[addY * w + x];
      const remY = y - r;
      if (remY >= 0) count -= horiz[remY * w + x];
    }
  }

  const out = new ImageData(w, h);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (dst[p]) {
      // Preserve original color for existing foreground; use `color` for grown pixels.
      if (src[p]) {
        out.data[i] = img.data[i];
        out.data[i + 1] = img.data[i + 1];
        out.data[i + 2] = img.data[i + 2];
      } else {
        out.data[i] = color[0];
        out.data[i + 1] = color[1];
        out.data[i + 2] = color[2];
      }
      out.data[i + 3] = 255;
    } else {
      out.data[i + 3] = 0;
    }
  }
  return out;
}

/**
 * Detect fully-enclosed holes in a layer mask and cut structural bridges
 * through them so the physical stencil doesn't lose interior islands.
 *
 * Algorithm:
 *   1. Flood-fill background from the image border to identify "outside".
 *   2. Remaining non-foreground pixels are enclosed holes.
 *   3. For each hole above a size threshold, cut 3 bridge rectangles
 *      (two horizontal at 1/3 and 2/3 height, one vertical at center x)
 *      of thickness `bridgePx`, extending past the hole so they cross the
 *      foreground into the outside on both sides.
 *
 * Mutates and returns `img`.
 */
export function applyAutoBridges(img: ImageData, bridgePx: number): ImageData {
  if (bridgePx <= 0) return img;
  const w = img.width, h = img.height;
  const n = w * h;
  const M = new Uint8Array(n);
  for (let p = 0; p < n; p++) M[p] = img.data[p * 4 + 3] > 128 ? 1 : 0;

  // Flood-fill "outside" from border across non-foreground pixels.
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  const seed = (p: number) => {
    if (!M[p] && !outside[p]) { outside[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }

  // BFS each enclosed hole, then cut bridges.
  const visited = new Uint8Array(n);
  const halfB = Math.max(1, Math.round(bridgePx / 2));
  const extend = Math.max(2, Math.round(bridgePx * 3));
  const minSize = Math.max(64, bridgePx * bridgePx * 4);

  const cutRect = (rx0: number, ry0: number, rx1: number, ry1: number) => {
    const x0 = Math.max(0, rx0), y0 = Math.max(0, ry0);
    const x1 = Math.min(w - 1, rx1), y1 = Math.min(h - 1, ry1);
    for (let yy = y0; yy <= y1; yy++) {
      const row = yy * w;
      for (let xx = x0; xx <= x1; xx++) {
        img.data[(row + xx) * 4 + 3] = 0;
      }
    }
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (M[p] || outside[p] || visited[p]) continue;
      let x0 = x, y0 = y, x1 = x, y1 = y, count = 0;
      const q: number[] = [p];
      visited[p] = 1;
      while (q.length) {
        const cur = q.pop()!;
        const cx = cur % w;
        const cy = (cur - cx) / w;
        count++;
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        if (cx > 0) { const nb = cur - 1; if (!M[nb] && !outside[nb] && !visited[nb]) { visited[nb] = 1; q.push(nb); } }
        if (cx < w - 1) { const nb = cur + 1; if (!M[nb] && !outside[nb] && !visited[nb]) { visited[nb] = 1; q.push(nb); } }
        if (cy > 0) { const nb = cur - w; if (!M[nb] && !outside[nb] && !visited[nb]) { visited[nb] = 1; q.push(nb); } }
        if (cy < h - 1) { const nb = cur + w; if (!M[nb] && !outside[nb] && !visited[nb]) { visited[nb] = 1; q.push(nb); } }
      }
      if (count < minSize) continue;
      const cy1 = Math.round(y0 + (y1 - y0) / 3);
      const cy2 = Math.round(y0 + ((y1 - y0) * 2) / 3);
      const cxC = Math.round((x0 + x1) / 2);
      cutRect(x0 - extend, cy1 - halfB, x1 + extend, cy1 + halfB);
      cutRect(x0 - extend, cy2 - halfB, x1 + extend, cy2 + halfB);
      cutRect(cxC - halfB, y0 - extend, cxC + halfB, y1 + extend);
    }
  }
  return img;
}

/**
 * Build a binary mask (1 = keep, 0 = discard) that removes near-white
 * pixels. Used both to skip near-white pixels during quantization and to
 * feed the background-removal step when the user hasn't manually painted.
 * `tolerance` 0 disables (returns null so callers can short-circuit).
 */
export function buildNearWhiteMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
): Uint8Array | null {
  if (tolerance <= 0) return null;
  const n = width * height;
  const out = new Uint8Array(n);
  const threshold = 255 - tolerance;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    out[p] = r > threshold && g > threshold && b > threshold ? 0 : 1;
  }
  return out;
}
