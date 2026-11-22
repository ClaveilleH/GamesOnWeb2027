function colorDistance(a, b, i) {
  return Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) +
    Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]);
}

export function countIsolatedChanges(a, b, c, mask, threshold, returnThreshold, out) {
  let count = 0;
  for (let pixel = 0; pixel < a.length / 4; pixel++) {
    if (mask && !mask[pixel]) continue;
    const i = 4 * pixel;
    if (colorDistance(a, b, i) > threshold && colorDistance(b, c, i) > threshold &&
        colorDistance(a, c, i) < returnThreshold) {
      if (out) out[count] = pixel;
      count++;
    }
  }
  if (Array.isArray(out)) out.length = count;
  return count;
}

export function segmentDistanceSquared(x, y, { ax, ay, bx, by }) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared)) : 0;
  return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
}

export function outlineMask(segments, width, height, band, mask) {
  mask ??= new Uint8Array(width * height);
  mask.fill(0);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const { ax, ay, bx, by } = segment;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - band));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + band));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - band));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by) + band));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (segmentDistanceSquared(x + 0.5, y + 0.5, segment) < band * band) mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}
