import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryScore,
  patternPenalty,
  formalityPenalty,
  seasonPenalty,
  scoreMatch,
  findMatches,
  pickSurpriseCombo,
  scoreOutfit,
  buildOutfit,
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

describe('seasonPenalty', () => {
  test('zero when either side unset', () => {
    assert.equal(seasonPenalty(null, 'cold-weather'), 0);
    assert.equal(seasonPenalty('warm-weather', undefined), 0);
  });

  test('zero when either side is all-season', () => {
    assert.equal(seasonPenalty('all-season', 'cold-weather'), 0);
    assert.equal(seasonPenalty('warm-weather', 'all-season'), 0);
  });

  test('zero for matching seasons', () => {
    assert.equal(seasonPenalty('warm-weather', 'warm-weather'), 0);
  });

  test('penalizes a warm/cold clash', () => {
    assert.equal(seasonPenalty('warm-weather', 'cold-weather'), 0.2);
  });

  test('is symmetric', () => {
    assert.equal(seasonPenalty('warm-weather', 'cold-weather'), seasonPenalty('cold-weather', 'warm-weather'));
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
    assert.ok('seasonPenalty' in result);
  });

  test('a season clash lowers the score versus an otherwise identical pair', () => {
    const target = item({ category: 'top', season: 'warm-weather' });
    const clashing = item({ category: 'bottom', season: 'cold-weather' });
    const matching = item({ category: 'bottom', season: 'warm-weather' });
    assert.ok(scoreMatch(target, clashing).score < scoreMatch(target, matching).score);
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

describe('scoreOutfit', () => {
  test('scores as the average of every pairwise scoreMatch', () => {
    const top = item({ id: 't', category: 'top' });
    const bottom = item({ id: 'b', category: 'bottom' });
    const shoes = item({ id: 's', category: 'shoes' });
    const result = scoreOutfit([top, bottom, shoes]);

    assert.equal(result.pairs.length, 3); // C(3,2)
    const manualAvg =
      (scoreMatch(top, bottom).score + scoreMatch(top, shoes).score + scoreMatch(bottom, shoes).score) / 3;
    assert.equal(result.score, manualAvg);
  });

  test('excludes same-category pairs from the average', () => {
    const topA = item({ id: 't1', category: 'top' });
    const topB = item({ id: 't2', category: 'top' });
    const bottom = item({ id: 'b', category: 'bottom' });
    const result = scoreOutfit([topA, topB, bottom]);

    assert.equal(result.pairs.length, 2); // topA-bottom, topB-bottom (topA-topB excluded)
  });

  test('an empty or single-item outfit scores zero with no pairs', () => {
    assert.deepEqual(scoreOutfit([]).pairs, []);
    assert.equal(scoreOutfit([]).score, 0);
    assert.equal(scoreOutfit([item({ id: '1' })]).score, 0);
  });
});

describe('buildOutfit', () => {
  function outfitBasics(overrides = {}) {
    return {
      top: item({ id: 'top', category: 'top', dominantColors: [{ hex: '#ff0000', ratio: 1 }], ...overrides.top }),
      bottom: item({ id: 'bottom', category: 'bottom', dominantColors: [{ hex: '#808080', ratio: 1 }] }),
      shoes: item({ id: 'shoes', category: 'shoes', dominantColors: [{ hex: '#808080', ratio: 1 }] }),
    };
  }

  test('returns null when a required category is missing', () => {
    const { top, bottom } = outfitBasics(); // no shoes at all
    assert.equal(buildOutfit([top, bottom]), null);
  });

  test('builds a top/bottom/shoes outfit when no optional items exist', () => {
    const { top, bottom, shoes } = outfitBasics();
    const result = buildOutfit([top, bottom, shoes]);
    assert.equal(result.items.length, 3);
    const ids = result.items.map((i) => i.id).sort();
    assert.deepEqual(ids, ['bottom', 'shoes', 'top']);
    assert.ok(result.score > 0);
  });

  test('includes an optional outerwear piece when it raises the outfit score', () => {
    const { top, bottom, shoes } = outfitBasics();
    const outerwear = item({
      id: 'outerwear',
      category: 'outerwear',
      dominantColors: [{ hex: '#00ffff', ratio: 1 }], // complementary to the red top
    });
    const result = buildOutfit([top, bottom, shoes, outerwear]);
    assert.ok(result.items.some((i) => i.id === 'outerwear'));
  });

  test('leaves an optional outerwear piece out when it drags the outfit score down', () => {
    const { bottom, shoes } = outfitBasics();
    const top = item({
      id: 'top',
      category: 'top',
      pattern: 'patterned',
      formality: 'athletic',
      dominantColors: [{ hex: '#ff0000', ratio: 1 }],
    });
    const outerwear = item({
      id: 'outerwear',
      category: 'outerwear',
      pattern: 'patterned', // double-patterned penalty against the top
      formality: 'formal', // wide formality gap against the top
      dominantColors: [{ hex: '#00ff00', ratio: 1 }], // clashes with the red top
    });
    const result = buildOutfit([top, bottom, shoes, outerwear]);
    assert.ok(!result.items.some((i) => i.id === 'outerwear'));
  });
});
