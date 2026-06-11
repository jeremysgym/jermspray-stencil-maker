// K-means color quantization on an ImageData.
// Returns palette (RGB) and label per pixel.

export type RGB = [number, number, number];

export function rgbToHex([r, g, b]: RGB): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}

export function hexToRgb(hex: string): RGB {
  const s = hex.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

// Estimate the SMALLEST number of distinct dominant colors that still represent the image.
export function estimateColorCount(data: Uint8ClampedArray, alphaMask?: Uint8Array): number {
  // Use a coarser bucket (4 bits per channel) and require a larger share of pixels per bucket.
  const bucket = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    if (alphaMask && alphaMask[i / 4] === 0) continue;
    const r = data[i] >> 6;
    const g = data[i + 1] >> 6;
    const b = data[i + 2] >> 6;
    const key = (r << 4) | (g << 2) | b;
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }
  const total = Array.from(bucket.values()).reduce((a, b) => a + b, 0);
  // Require at least 4% of pixels to count as a dominant color — keeps stencil minimal.
  const threshold = Math.max(200, total * 0.04);
  let n = 0;
  for (const v of bucket.values()) if (v >= threshold) n++;
  return Math.max(2, Math.min(12, n));
}

export interface QuantizeResult {
  palette: RGB[];
  labels: Int32Array; // length = w*h, value = palette index or -1 if transparent
  counts: number[];
}

export function quantize(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  k: number,
  alphaMask?: Uint8Array,
): QuantizeResult {
  const n = width * height;
  // Sample pixels for speed.
  const samples: RGB[] = [];
  const step = Math.max(1, Math.floor(n / 8000));
  for (let p = 0; p < n; p += step) {
    const i = p * 4;
    if (data[i + 3] < 16) continue;
    if (alphaMask && alphaMask[p] === 0) continue;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (samples.length === 0) {
    return { palette: [[0, 0, 0]], labels: new Int32Array(n).fill(-1), counts: [0] };
  }
  // k-means++ init
  const centers: RGB[] = [];
  centers.push(samples[Math.floor(Math.random() * samples.length)]);
  while (centers.length < k) {
    const dists = samples.map((s) => {
      let min = Infinity;
      for (const c of centers) {
        const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
        if (d < min) min = d;
      }
      return min;
    });
    const sum = dists.reduce((a, b) => a + b, 0);
    if (sum === 0) break;
    let r = Math.random() * sum;
    let idx = 0;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    centers.push(samples[idx]);
  }
  while (centers.length < k) centers.push(samples[Math.floor(Math.random() * samples.length)]);

  // Lloyd's iterations
  for (let iter = 0; iter < 8; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const cc = centers[c];
        const d = (s[0] - cc[0]) ** 2 + (s[1] - cc[1]) ** 2 + (s[2] - cc[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      sums[best][0] += s[0];
      sums[best][1] += s[1];
      sums[best][2] += s[2];
      sums[best][3] += 1;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3] > 0) {
        centers[c] = [
          Math.round(sums[c][0] / sums[c][3]),
          Math.round(sums[c][1] / sums[c][3]),
          Math.round(sums[c][2] / sums[c][3]),
        ];
      }
    }
  }

  // Label all pixels
  const labels = new Int32Array(n);
  const counts = new Array(centers.length).fill(0);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (data[i + 3] < 16 || (alphaMask && alphaMask[p] === 0)) {
      labels[p] = -1;
      continue;
    }
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < centers.length; c++) {
      const cc = centers[c];
      const d = (data[i] - cc[0]) ** 2 + (data[i + 1] - cc[1]) ** 2 + (data[i + 2] - cc[2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    labels[p] = best;
    counts[best]++;
  }

  // Sort palette by luminance (background = lightest first)
  const order = centers
    .map((c, i) => ({ c, i, lum: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], count: counts[i] }))
    .sort((a, b) => b.lum - a.lum);
  const remap = new Map<number, number>();
  order.forEach((o, ni) => remap.set(o.i, ni));
  const newPalette = order.map((o) => o.c);
  const newCounts = order.map((o) => o.count);
  for (let p = 0; p < n; p++) {
    if (labels[p] >= 0) labels[p] = remap.get(labels[p])!;
  }
  return { palette: newPalette, labels, counts: newCounts };
}

// Render the full quantized preview ImageData.
export function renderQuantized(
  labels: Int32Array,
  palette: RGB[],
  width: number,
  height: number,
  bg: RGB = [255, 255, 255],
): ImageData {
  const out = new ImageData(width, height);
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p];
    const i = p * 4;
    if (l < 0) {
      out.data[i] = bg[0];
      out.data[i + 1] = bg[1];
      out.data[i + 2] = bg[2];
      out.data[i + 3] = 255;
    } else {
      const c = palette[l];
      out.data[i] = c[0];
      out.data[i + 1] = c[1];
      out.data[i + 2] = c[2];
      out.data[i + 3] = 255;
    }
  }
  return out;
}

// Render a single layer: that color over background, includes all layers below.
export function renderLayerCumulative(
  labels: Int32Array,
  palette: RGB[],
  width: number,
  height: number,
  layerIndex: number,
  bg: RGB = [255, 255, 255],
): ImageData {
  const out = new ImageData(width, height);
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p];
    const i = p * 4;
    let c: RGB = bg;
    if (l >= 0 && l <= layerIndex) c = palette[l];
    out.data[i] = c[0];
    out.data[i + 1] = c[1];
    out.data[i + 2] = c[2];
    out.data[i + 3] = 255;
  }
  return out;
}

// Render an isolated layer (mask): color where label==layerIndex, transparent elsewhere.
export function renderLayerIsolated(
  labels: Int32Array,
  palette: RGB[],
  width: number,
  height: number,
  layerIndex: number,
  bg: RGB | null = [255, 255, 255],
): ImageData {
  const out = new ImageData(width, height);
  const c = palette[layerIndex];
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p];
    const i = p * 4;
    if (l === layerIndex) {
      out.data[i] = c[0];
      out.data[i + 1] = c[1];
      out.data[i + 2] = c[2];
      out.data[i + 3] = 255;
    } else if (bg) {
      out.data[i] = bg[0];
      out.data[i + 1] = bg[1];
      out.data[i + 2] = bg[2];
      out.data[i + 3] = 255;
    } else {
      out.data[i + 3] = 0;
    }
  }
  return out;
}

// Render a silhouette: black where any color label exists, transparent or bg elsewhere.
export function renderSilhouette(
  labels: Int32Array,
  width: number,
  height: number,
  fg: RGB = [0, 0, 0],
  bg: RGB | null = [255, 255, 255],
): ImageData {
  const out = new ImageData(width, height);
  for (let p = 0; p < labels.length; p++) {
    const i = p * 4;
    if (labels[p] >= 0) {
      out.data[i] = fg[0];
      out.data[i + 1] = fg[1];
      out.data[i + 2] = fg[2];
      out.data[i + 3] = 255;
    } else if (bg) {
      out.data[i] = bg[0];
      out.data[i + 1] = bg[1];
      out.data[i + 2] = bg[2];
      out.data[i + 3] = 255;
    } else {
      out.data[i + 3] = 0;
    }
  }
  return out;
}
