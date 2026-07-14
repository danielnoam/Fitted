// HSL conversion + color harmony scoring. Pure functions, no DOM/storage deps.

export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }

  return { h, s, l };
}

export function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

/** Circular hue distance in degrees, range [0, 180]. */
export function hueDistance(h1, h2) {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

/** Low saturation or near-black/near-white counts as neutral ("matches anything"). */
export function isNeutral(hsl) {
  return hsl.s < 0.15 || hsl.l < 0.12 || hsl.l > 0.92;
}

// Hue-distance -> base harmony score anchor points, interpolated linearly.
// Peaks at 180 (complementary) and 30-60 (analogous), troughs at ~120 (clash).
const HARMONY_ANCHORS = [
  [0, 0.75],
  [30, 0.8],
  [60, 0.85],
  [90, 0.55],
  [120, 0.25],
  [150, 0.55],
  [160, 0.85],
  [180, 1.0],
];

function interpolateAnchors(d) {
  for (let i = 0; i < HARMONY_ANCHORS.length - 1; i++) {
    const [d0, s0] = HARMONY_ANCHORS[i];
    const [d1, s1] = HARMONY_ANCHORS[i + 1];
    if (d >= d0 && d <= d1) {
      const t = d1 === d0 ? 0 : (d - d0) / (d1 - d0);
      return s0 + (s1 - s0) * t;
    }
  }
  return HARMONY_ANCHORS[HARMONY_ANCHORS.length - 1][1];
}

const NEUTRAL_PAIR_SCORE = 0.85;
const CLASH_ZONE = [90, 150];
const MILD_CLASH_FLOOR = 0.65;

/**
 * Score how well two single hex colors pair, 0-1.
 * Returns a relation label alongside the score for use in explanations.
 */
export function scoreColorPair(hexA, hexB) {
  const hslA = hexToHsl(hexA);
  const hslB = hexToHsl(hexB);

  if (isNeutral(hslA) || isNeutral(hslB)) {
    return { score: NEUTRAL_PAIR_SCORE, relation: 'neutral' };
  }

  const d = hueDistance(hslA.h, hslB.h);
  let score = interpolateAnchors(d);
  let relation = 'analogous';

  if (d >= CLASH_ZONE[0] && d <= CLASH_ZONE[1]) {
    const satFactor = Math.min(hslA.s, hslB.s);
    score = score + (MILD_CLASH_FLOOR - score) * (1 - satFactor);
    relation = 'clash';
  } else if (d >= 160) {
    relation = 'complementary';
  }

  return { score: Math.max(0, Math.min(1, score)), relation };
}

/**
 * Score overall color harmony between two items' dominant-color sets,
 * weighting each pair by the product of their prevalence ratios.
 */
export function scoreColorHarmony(colorsA, colorsB) {
  if (!colorsA?.length || !colorsB?.length) {
    return { score: 0.5, relation: 'unknown' };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  let best = { score: -1, relation: 'analogous' };

  for (const a of colorsA) {
    for (const b of colorsB) {
      const weight = (a.ratio ?? 1) * (b.ratio ?? 1);
      const pair = scoreColorPair(a.hex, b.hex);
      weightedSum += pair.score * weight;
      weightTotal += weight;
      if (pair.score > best.score) best = pair;
    }
  }

  const score = weightTotal ? weightedSum / weightTotal : 0.5;
  return { score, relation: best.relation };
}
