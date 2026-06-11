// Simple flood-fill background removal from image corners using color similarity.

export function detectAndRemoveBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 32,
): Uint8Array {
  const n = width * height;
  const mask = new Uint8Array(n).fill(1); // 1 = keep, 0 = removed
  const visited = new Uint8Array(n);
  const seeds: number[] = [0, width - 1, n - width, n - 1];

  const queue: number[] = [];
  for (const s of seeds) {
    if (visited[s]) continue;
    const i = s * 4;
    const sr = data[i], sg = data[i + 1], sb = data[i + 2];
    queue.push(s);
    visited[s] = 1;
    while (queue.length) {
      const p = queue.pop()!;
      const pi = p * 4;
      const dr = data[pi] - sr, dg = data[pi + 1] - sg, db = data[pi + 2] - sb;
      if (dr * dr + dg * dg + db * db > tolerance * tolerance * 3) continue;
      mask[p] = 0;
      const x = p % width;
      const y = (p - x) / width;
      if (x > 0 && !visited[p - 1]) { visited[p - 1] = 1; queue.push(p - 1); }
      if (x < width - 1 && !visited[p + 1]) { visited[p + 1] = 1; queue.push(p + 1); }
      if (y > 0 && !visited[p - width]) { visited[p - width] = 1; queue.push(p - width); }
      if (y < height - 1 && !visited[p + width]) { visited[p + width] = 1; queue.push(p + width); }
    }
  }
  return mask;
}
