import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRgb,
  rgbToHsl,
  hexToHsl,
  hueDistance,
  isNeutral,
  scoreColorPair,
  scoreColorHarmony,
} from '../js/colorMatch.js';

describe('hexToRgb', () => {
  test('parses 6-digit hex', () => {
    assert.deepEqual(hexToRgb('#ff0080'), { r: 255, g: 0, b: 128 });
  });

  test('expands 3-digit shorthand hex', () => {
    assert.deepEqual(hexToRgb('#f08'), hexToRgb('#ff0088'));
  });
});

describe('rgbToHsl / hexToHsl', () => {
  test('pure red', () => {
    const hsl = rgbToHsl(255, 0, 0);
    assert.equal(hsl.h, 0);
    assert.equal(hsl.s, 1);
    assert.equal(hsl.l, 0.5);
  });

  test('grayscale has zero saturation', () => {
    const hsl = rgbToHsl(128, 128, 128);
    assert.equal(hsl.s, 0);
  });

  test('hexToHsl matches manual conversion', () => {
    assert.deepEqual(hexToHsl('#ff0000'), rgbToHsl(255, 0, 0));
  });
});

describe('hueDistance', () => {
  test('zero for identical hues', () => {
    assert.equal(hueDistance(10, 10), 0);
  });

  test('handles simple difference', () => {
    assert.equal(hueDistance(10, 40), 30);
  });

  test('wraps around 360 to stay within [0, 180]', () => {
    assert.equal(hueDistance(350, 10), 20);
  });

  test('caps at 180 for opposite hues', () => {
    assert.equal(hueDistance(0, 180), 180);
  });
});

describe('isNeutral', () => {
  test('low saturation counts as neutral', () => {
    assert.ok(isNeutral({ h: 0, s: 0.1, l: 0.5 }));
  });

  test('near-black counts as neutral regardless of saturation', () => {
    assert.ok(isNeutral({ h: 0, s: 1, l: 0.05 }));
  });

  test('near-white counts as neutral regardless of saturation', () => {
    assert.ok(isNeutral({ h: 0, s: 1, l: 0.95 }));
  });

  test('saturated mid-lightness color is not neutral', () => {
    assert.ok(!isNeutral({ h: 200, s: 0.6, l: 0.5 }));
  });
});

describe('scoreColorPair', () => {
  test('neutral pairs score highly regardless of the other color', () => {
    const result = scoreColorPair('#808080', '#ff0000');
    assert.equal(result.relation, 'neutral');
    assert.equal(result.score, 0.85);
  });

  test('complementary hues score at the top of the range', () => {
    const result = scoreColorPair('#ff0000', '#00ffff'); // 0 vs 180 deg
    assert.equal(result.relation, 'complementary');
    assert.ok(result.score > 0.9);
  });

  test('clashing hues score lower and are labeled clash', () => {
    const result = scoreColorPair('#ff0000', '#00ff00'); // ~120 deg apart
    assert.equal(result.relation, 'clash');
    assert.ok(result.score < 0.75);
  });

  test('score is always within [0, 1]', () => {
    for (let h = 0; h < 360; h += 15) {
      const hex = hslToHexApprox(h);
      const result = scoreColorPair('#ff0000', hex);
      assert.ok(result.score >= 0 && result.score <= 1);
    }
  });
});

describe('scoreColorHarmony', () => {
  test('returns a neutral 0.5 fallback when either side has no colors', () => {
    assert.deepEqual(scoreColorHarmony([], [{ hex: '#ff0000', ratio: 1 }]), { score: 0.5, relation: 'unknown' });
    assert.deepEqual(scoreColorHarmony(null, [{ hex: '#ff0000', ratio: 1 }]), { score: 0.5, relation: 'unknown' });
  });

  test('weights pairs by prevalence ratio product', () => {
    const dominant = [{ hex: '#ff0000', ratio: 0.9 }, { hex: '#00ff00', ratio: 0.1 }];
    const other = [{ hex: '#00ffff', ratio: 1 }]; // complementary to red, clash-ish to green
    const result = scoreColorHarmony(dominant, other);
    // Should skew toward the complementary (red/cyan) pairing since it dominates by ratio.
    const redCyan = scoreColorPair('#ff0000', '#00ffff').score;
    const greenCyan = scoreColorPair('#00ff00', '#00ffff').score;
    assert.ok(Math.abs(result.score - redCyan) < Math.abs(result.score - greenCyan));
  });

  test('defaults missing ratios to 1', () => {
    const a = [{ hex: '#ff0000' }];
    const b = [{ hex: '#00ffff' }];
    const result = scoreColorHarmony(a, b);
    assert.equal(result.score, scoreColorPair('#ff0000', '#00ffff').score);
  });
});

// Crude HSL(fixed s=1,l=0.5) -> hex helper for the range test above.
function hslToHexApprox(h) {
  const c = 1;
  const x = 1 - Math.abs(((h / 60) % 2) - 1);
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
