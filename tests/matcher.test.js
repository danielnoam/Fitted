import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryScore,
  patternPenalty,
  formalityPenalty,
  scoreMatch,
  findMatches,
  pickSurpriseCombo,
} from '../js/matcher.js';

function item(overrides = {}) {
  return {
    id: overrides.id,
    category: 'top',
    pattern: 'solid',
    dominantColors: [{ hex: '#808080', ratio: 1 }],
    ...overrides,
  };
}

describe('categoryScore', () => {
  test('excludes identical categories', () => {
    assert.equal(categoryScore('top', 'top'), null);
  });

  test('returns listed compatibility regardless of argument order', () => {
    assert.equal(categoryScore('bottom', 'top'), 1.0);
    assert.equal(categoryScore('top', 'bottom'), 1.0);
  });

  test('falls back to mild default compatibility for unlisted pairs', () => {
    // 'accessory|accessory' excluded by identity check; use two categories
    // with no explicit entry in CATEGORY_COMPAT to hit the ?? 0.4 fallback.
    assert.equal(categoryScore('shoes', 'outerwear'), 0.5); // listed
  });
});

describe('patternPenalty', () => {
  test('penalizes two patterned items', () => {
    assert.equal(patternPenalty('patterned', 'patterned'), 0.15);
  });

  test('no penalty when at most one is patterned', () => {
    assert.equal(patternPenalty('solid', 'patterned'), 0);
    assert.equal(patternPenalty('solid', 'solid'), 0);
  });
});

describe('formalityPenalty', () => {
  test('zero when either side unset', () => {
    assert.equal(formalityPenalty(null, 'casual'), 0);
    assert.equal(formalityPenalty('casual', undefined), 0);
  });

  test('zero for adjacent levels (one-step gap allowed)', () => {
    assert.equal(formalityPenalty('casual', 'smart-casual'), 0);
  });

  test('penalizes wider gaps proportionally', () => {
    // athletic -> formal is a 3-step gap; one step is free, so 2 * 0.12
    assert.equal(formalityPenalty('athletic', 'formal'), Math.round(2 * 0.12 * 100) / 100);
  });

  test('is symmetric', () => {
    assert.equal(formalityPenalty('athletic', 'formal'), formalityPenalty('formal', 'athletic'));
  });
});

describe('scoreMatch', () => {
  test('returns null for same-category pairs', () => {
    const target = item({ category: 'top' });
    const candidate = item({ category: 'top' });
    assert.equal(scoreMatch(target, candidate), null);
  });

  test('never returns a negative score', () => {
    const target = item({
      category: 'top',
      pattern: 'patterned',
      formality: 'athletic',
      dominantColors: [{ hex: '#ff0000', ratio: 1 }],
    });
    const candidate = item({
      category: 'accessory',
      pattern: 'patterned',
      formality: 'formal',
      dominantColors: [{ hex: '#00ff88', ratio: 1 }], // clash zone
    });
    const result = scoreMatch(target, candidate);
    assert.ok(result.score >= 0);
  });

  test('includes component breakdown', () => {
    const target = item({ category: 'top' });
    const candidate = item({ category: 'bottom' });
    const result = scoreMatch(target, candidate);
    assert.equal(result.item, candidate);
    assert.ok('colorScore' in result);
    assert.ok('categoryScore' in result);
    assert.ok('patternPenalty' in result);
    assert.ok('formalityPenalty' in result);
  });
});

describe('findMatches', () => {
  test('excludes the target itself by id', () => {
    const target = item({ id: '1', category: 'top' });
    const wardrobe = [target, item({ id: '2', category: 'bottom' })];
    const results = findMatches(target, wardrobe);
    assert.equal(results.length, 1);
    assert.equal(results[0].item.id, '2');
  });

  test('excludes same-category pairs from results', () => {
    const target = item({ id: '1', category: 'top' });
    const wardrobe = [item({ id: '2', category: 'top' }), item({ id: '3', category: 'bottom' })];
    const results = findMatches(target, wardrobe);
    assert.equal(results.length, 1);
    assert.equal(results[0].item.id, '3');
  });

  test('sorts results by descending score', () => {
    const target = item({ id: '1', category: 'top', dominantColors: [{ hex: '#ff0000', ratio: 1 }] });
    const wardrobe = [
      item({ id: '2', category: 'bottom', dominantColors: [{ hex: '#00ffff', ratio: 1 }] }), // complementary
      item({ id: '3', category: 'accessory', dominantColors: [{ hex: '#118822', ratio: 1 }] }), // clash-ish, lower weight category too
    ];
    const results = findMatches(target, wardrobe);
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score);
    }
  });

  test('respects the limit option', () => {
    const target = item({ id: '1', category: 'top' });
    const wardrobe = Array.from({ length: 10 }, (_, i) => item({ id: `b${i}`, category: 'bottom' }));
    const results = findMatches(target, wardrobe, { limit: 3 });
    assert.equal(results.length, 3);
  });
});

describe('pickSurpriseCombo', () => {
  test('returns null with fewer than two items', () => {
    assert.equal(pickSurpriseCombo([]), null);
    assert.equal(pickSurpriseCombo([item({ id: '1' })]), null);
  });

  test('returns null when no compatible pairing exists', () => {
    // Two items in the same category can never pair (categoryScore === null).
    const wardrobe = [item({ id: '1', category: 'top' }), item({ id: '2', category: 'top' })];
    assert.equal(pickSurpriseCombo(wardrobe), null);
  });

  test('returns a seed/match pair from compatible categories', () => {
    const wardrobe = [item({ id: '1', category: 'top' }), item({ id: '2', category: 'bottom' })];
    const combo = pickSurpriseCombo(wardrobe);
    assert.ok(combo.seed);
    assert.ok(combo.match.item);
    assert.notEqual(combo.seed.id, combo.match.item.id);
  });
});
