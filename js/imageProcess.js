// Canvas-based image resize, dominant color extraction, and pattern detection.
// All client-side, no network calls.

const THUMB_MAX_DIM = 300;
const THUMB_QUALITY = 0.7;

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function drawResized(img, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

export function canvasToBlob(canvas, quality = THUMB_QUALITY) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/**
 * Process a File into a thumbnail blob + analysis (dominant colors, pattern).
 */
export async function processImageFile(file, maxDim = THUMB_MAX_DIM) {
  const { img, revoke } = await loadImageFromFile(file);
  try {
    const { canvas, ctx, w, h } = drawResized(img, maxDim);
    const imageData = ctx.getImageData(0, 0, w, h);
    const dominantColors = extractDominantColors(imageData, 3);
    const pattern = detectPattern(imageData);
    const thumbnail = await canvasToBlob(canvas, THUMB_QUALITY);
    return { thumbnail, dominantColors, pattern, width: w, height: h };
  } finally {
    revoke();
  }
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract dominant colors via RGB histogram bucketing (quantized to 8 levels
 * per channel = 512 buckets), returning the top N by pixel count.
 */
export function extractDominantColors(imageData, n = 3) {
  const { data, width, height } = imageData;
  const BUCKET_BITS = 5; // quantize each 8-bit channel into 32 buckets -> merge to fewer levels below
  const LEVELS = 8; // 8 levels per channel = 512 total buckets
  const step = 256 / LEVELS;

  const buckets = new Map(); // key -> { count, rSum, gSum, bSum }
  const totalPixels = width * height;
  let opaqueCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue; // skip transparent pixels
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const rl = Math.min(LEVELS - 1, Math.floor(r / step));
    const gl = Math.min(LEVELS - 1, Math.floor(g / step));
    const bl = Math.min(LEVELS - 1, Math.floor(b / step));
    const key = rl * LEVELS * LEVELS + gl * LEVELS + bl;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, rSum: 0, gSum: 0, bSum: 0 };
      buckets.set(key, bucket);
    }
    bucket.count++;
    bucket.rSum += r;
    bucket.gSum += g;
    bucket.bSum += b;
    opaqueCount++;
  }

  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, n);
  const denom = opaqueCount || totalPixels || 1;

  return top.map((bucket) => ({
    hex: rgbToHex(
      Math.round(bucket.rSum / bucket.count),
      Math.round(bucket.gSum / bucket.count),
      Math.round(bucket.bSum / bucket.count)
    ),
    ratio: +(bucket.count / denom).toFixed(3),
  }));
}

/**
 * Detect solid vs. patterned via local pixel variance (edge density proxy).
 * Downsamples to a small grid, computes gradient magnitude between
 * neighboring cells, and thresholds the average against a fixed cutoff.
 */
export function detectPattern(imageData) {
  const { data, width, height } = imageData;
  const GRID = 24; // sample grid resolution
  const cellW = Math.max(1, Math.floor(width / GRID));
  const cellH = Math.max(1, Math.floor(height / GRID));

  const grid = [];
  for (let gy = 0; gy < GRID; gy++) {
    const row = [];
    for (let gx = 0; gx < GRID; gx++) {
      const x0 = gx * cellW;
      const y0 = gy * cellH;
      if (x0 >= width || y0 >= height) {
        row.push(null);
        continue;
      }
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let y = y0; y < Math.min(y0 + cellH, height); y++) {
        for (let x = x0; x < Math.min(x0 + cellW, width); x++) {
          const i = (y * width + x) * 4;
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          count++;
        }
      }
      row.push(count ? [rSum / count, gSum / count, bSum / count] : null);
    }
    grid.push(row);
  }

  let diffSum = 0;
  let diffCount = 0;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const cell = grid[gy][gx];
      if (!cell) continue;
      const right = gx + 1 < GRID ? grid[gy][gx + 1] : null;
      const down = gy + 1 < GRID ? grid[gy + 1][gx] : null;
      for (const neighbor of [right, down]) {
        if (!neighbor) continue;
        const d =
          Math.abs(cell[0] - neighbor[0]) +
          Math.abs(cell[1] - neighbor[1]) +
          Math.abs(cell[2] - neighbor[2]);
        diffSum += d;
        diffCount++;
      }
    }
  }

  const avgDiff = diffCount ? diffSum / diffCount : 0;
  const PATTERN_THRESHOLD = 18; // empirical cutoff on avg per-channel-sum diff
  return avgDiff > PATTERN_THRESHOLD ? 'patterned' : 'solid';
}
