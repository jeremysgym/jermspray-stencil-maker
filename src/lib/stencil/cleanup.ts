// Morphological cleanup for label maps:
// - Remove tiny connected components (noise dots / hairlines)
// - Close small gaps so nearby strokes merge into one bold shape
// Operates per-label and writes the chosen label back into `labels`.

export interface CleanupOptions {
  minArea?: number;       // remove components smaller than this many pixels
  closeRadius?: number;   // dilate + erode radius (pixels) — connects nearby pieces
  openRadius?: number;    // erode + dilate radius — removes thin strands
}

function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src;
  // Two-pass (horizontal then vertical) box dilation
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let xx = x0; xx <= x1; xx++) {
        if (src[y * w + xx]) { v = 1; break; }
      }
      tmp[y * w + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 0;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) {
        if (tmp[yy * w + x]) { v = 1; break; }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function erode(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let xx = x0; xx <= x1; xx++) {
        if (!src[y * w + xx]) { v = 0; break; }
      }
      tmp[y * w + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 1;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) {
        if (!tmp[yy * w + x]) { v = 0; break; }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function removeSmallComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea: number,
): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(mask);
  const visited = new Uint8Array(n);
  const stack: number[] = [];
  const comp: number[] = [];
  for (let p = 0; p < n; p++) {
    if (visited[p] || !out[p]) continue;
    stack.length = 0;
    comp.length = 0;
    stack.push(p);
    visited[p] = 1;
    while (stack.length) {
      const q = stack.pop()!;
      comp.push(q);
      const x = q % w;
      const y = (q - x) / w;
      if (x > 0 && !visited[q - 1] && out[q - 1]) { visited[q - 1] = 1; stack.push(q - 1); }
      if (x < w - 1 && !visited[q + 1] && out[q + 1]) { visited[q + 1] = 1; stack.push(q + 1); }
      if (y > 0 && !visited[q - w] && out[q - w]) { visited[q - w] = 1; stack.push(q - w); }
      if (y < h - 1 && !visited[q + w] && out[q + w]) { visited[q + w] = 1; stack.push(q + w); }
    }
    if (comp.length < minArea) {
      for (const c of comp) out[c] = 0;
    }
  }
  return out;
}

// Clean labels: sharpen layers and remove noise.
// Pixels stripped from a layer are reassigned to the nearest remaining label
// (preferring the lower-indexed dominant layer, then a 1px neighbor vote).
export function cleanupLabels(
  labels: Int32Array,
  width: number,
  height: number,
  paletteSize: number,
  opts: CleanupOptions = {},
): Int32Array {
  const minArea = Math.max(0, opts.minArea ?? Math.round(width * height * 0.0015));
  const closeR = Math.max(0, opts.closeRadius ?? 1);
  const openR = Math.max(0, opts.openRadius ?? 1);
  const n = width * height;

  // Build cleaned per-label masks
  const masks: Uint8Array[] = [];
  for (let l = 0; l < paletteSize; l++) {
    const m = new Uint8Array(n);
    for (let p = 0; p < n; p++) m[p] = labels[p] === l ? 1 : 0;
    // Close = dilate then erode (joins nearby strokes)
    let cleaned = erode(dilate(m, width, height, closeR), width, height, closeR);
    // Open = erode then dilate (removes thin specks)
    cleaned = dilate(erode(cleaned, width, height, openR), width, height, openR);
    cleaned = removeSmallComponents(cleaned, width, height, minArea);
    masks.push(cleaned);
  }

  // Reassemble label map. Conflict resolution: prefer the smaller-index layer
  // (sorted lightest→darkest by quantize) so dark/detail layers stay on top.
  const out = new Int32Array(n).fill(-1);
  for (let p = 0; p < n; p++) {
    if (labels[p] < 0) { out[p] = -1; continue; }
    // Reverse so the last (darkest/detail) layer wins overlaps from dilation.
    for (let l = paletteSize - 1; l >= 0; l--) {
      if (masks[l][p]) { out[p] = l; break; }
    }
  }
  // Fill any holes left by removed noise using nearest neighbor from original labels.
  for (let p = 0; p < n; p++) {
    if (out[p] !== -1 || labels[p] < 0) continue;
    // Search expanding rings up to 6 px for a valid neighbor.
    const x = p % width;
    const y = (p - x) / width;
    let found = -1;
    for (let r = 1; r <= 6 && found < 0; r++) {
      for (let dy = -r; dy <= r && found < 0; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const v = out[yy * width + xx];
          if (v >= 0) { found = v; break; }
        }
      }
    }
    out[p] = found >= 0 ? found : labels[p];
  }
  return out;
}
