// Canvas-based image resize, dominant color extraction, and pattern detection.
// All client-side, no network calls.

import { rgbToHsl, isNeutral, hueDistance } from './colorMatch.js';

// Long enough edge to still look sharp filling most of a phone's width in
// the detail view (previously 300px, which was fine for a grid card but
// blurry once stretched across the full screen).
const THUMB_MAX_DIM = 900;
const THUMB_QUALITY = 0.85;

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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
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
 * Detect solid vs. patterned via local hue/lightness variance between
 * neighboring grid cells. Hue-led rather than raw-RGB-led on purpose:
 * fabric shadows and folds shift lightness a lot but barely shift hue, so
 * weighting hue heavily (and lightness lightly) keeps ordinary lighting on
 * a solid garment from reading as "patterned". A genuine print/stripe/check
 * still shows up as neighboring cells with clearly different hues (or a
 * strong color-vs-neutral contrast, e.g. navy against a white stripe).
 */
export function detectPattern(imageData) {
  const { data, width, height } = imageData;
  const GRID = 20; // sample grid resolution
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
      row.push(count ? rgbToHsl(rSum / count, gSum / count, bSum / count) : null);
    }
    grid.push(row);
  }

  function cellDiff(a, b) {
    const neutralA = isNeutral(a);
    const neutralB = isNeutral(b);
    const lightDiff = Math.abs(a.l - b.l);

    if (!neutralA && !neutralB) {
      // Two colored cells: real hue contrast is the strongest pattern signal;
      // lightness contributes lightly since shading alone can still vary it.
      return (hueDistance(a.h, b.h) / 180) * 0.75 + lightDiff * 0.25;
    }
    if (neutralA !== neutralB) {
      // One colored, one neutral (e.g. a white/black stripe against a
      // colored ground) - a real contrast, but keep it below the max so an
      // isolated flash glare or shadow doesn't dominate the average alone.
      return 0.55 + lightDiff * 0.2;
    }
    // Both neutral/gray-ish: only lightness to go on. Ordinary shading is a
    // gentle gradient; a true black/white pattern is a sharp jump - weight
    // accordingly rather than flagging every shadow.
    return lightDiff * 0.7;
  }

  // Count what fraction of neighboring pairs look like a real edge, rather
  // than averaging all pairs. A plain average gets diluted whenever the
  // pattern's repeat size doesn't line up neatly with the sample grid (a
  // checkerboard can have most cell-pairs fall inside one square), while a
  // handful of true edges still reliably show up as a real fraction of
  // pairs - unlike an isolated lighting artifact, which stays a rare outlier.
  const EDGE_DIFF = 0.32;
  let edgeCount = 0;
  let pairCount = 0;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const cell = grid[gy][gx];
      if (!cell) continue;
      const right = gx + 1 < GRID ? grid[gy][gx + 1] : null;
      const down = gy + 1 < GRID ? grid[gy + 1][gx] : null;
      for (const neighbor of [right, down]) {
        if (!neighbor) continue;
        if (cellDiff(cell, neighbor) > EDGE_DIFF) edgeCount++;
        pairCount++;
      }
    }
  }

  const edgeFraction = pairCount ? edgeCount / pairCount : 0;
  const PATTERN_THRESHOLD = 0.1; // >=10% of neighbor pairs look like real edges
  return edgeFraction > PATTERN_THRESHOLD ? 'patterned' : 'solid';
}
