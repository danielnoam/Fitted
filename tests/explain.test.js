import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { explainMatch } from '../js/explain.js';

function result(overrides = {}) {
  return {
    item: { pattern: 'solid', formality: null, season: null },
    colorRelation: 'neutral',
    categoryScore: 1.0,
    patternPenalty: 0,
    formalityPenalty: 0,
    seasonPenalty: 0,
    ...overrides,
  };
}

function target(overrides = {}) {
  return { pattern: 'solid', formality: null, season: null, ...overrides };
}

describe('explainMatch', () => {
  test('mentions the color relation phrase', () => {
    const text = explainMatch(target(), result({ colorRelation: 'complementary' }));
    assert.match(text, /complementary colors/i);
  });

  test('falls back to the unknown color phrase for an unrecognized relation', () => {
    const text = explainMatch(target(), result({ colorRelation: 'not-a-real-relation' }));
    assert.match(text, /colors that work together/i);
  });

  test('describes a high category score as a classic pairing', () => {
    const text = explainMatch(target(), result({ categoryScore: 1.0 }));
    assert.match(text, /classic pairing/);
  });

  test('describes a low category score as a light accent pairing', () => {
    const text = explainMatch(target(), result({ categoryScore: 0.3 }));
    assert.match(text, /light accent pairing/);
  });

  test('flags a pattern penalty as "keep it deliberate"', () => {
    const text = explainMatch(
      target({ pattern: 'patterned' }),
      result({ item: { pattern: 'patterned', formality: null }, patternPenalty: 0.15 })
    );
    assert.match(text, /keep it deliberate/);
  });

  test('describes pattern balanced with solid when exactly one side is patterned', () => {
    const text = explainMatch(
      target({ pattern: 'patterned' }),
      result({ item: { pattern: 'solid', formality: null }, patternPenalty: 0 })
    );
    assert.match(text, /pattern balanced with solid/);
  });

  test('omits the formality clause when there is no formality penalty', () => {
    const text = explainMatch(target(), result({ formalityPenalty: 0 }));
    assert.doesNotMatch(text, /mismatched/);
  });

  test('appends a mismatch clause naming both formality labels when penalized', () => {
    const text = explainMatch(
      target({ formality: 'athletic' }),
      result({ item: { pattern: 'solid', formality: 'formal' }, formalityPenalty: 0.24 })
    );
    assert.match(text, /Athletic vs Formal may feel mismatched/);
  });

  test('omits the season clause when there is no season penalty', () => {
    const text = explainMatch(target(), result({ seasonPenalty: 0 }));
    assert.doesNotMatch(text, /weather/);
  });

  test('appends a season-clash clause naming both season labels when penalized', () => {
    const text = explainMatch(
      target({ season: 'warm-weather' }),
      result({ item: { pattern: 'solid', formality: null, season: 'cold-weather' }, seasonPenalty: 0.2 })
    );
    assert.match(text, /Warm weather vs Cold weather won't suit the same weather/);
  });

  test('joins both a formality and a season clause when both are penalized', () => {
    const text = explainMatch(
      target({ formality: 'athletic', season: 'warm-weather' }),
      result({
        item: { pattern: 'solid', formality: 'formal', season: 'cold-weather' },
        formalityPenalty: 0.24,
        seasonPenalty: 0.2,
      })
    );
    assert.match(text, /mismatched, though Warm weather vs Cold weather/);
  });

  test('ends with a single period regardless of clause count', () => {
    const withFormality = explainMatch(
      target({ formality: 'athletic' }),
      result({ item: { pattern: 'solid', formality: 'formal' }, formalityPenalty: 0.24 })
    );
    const withoutFormality = explainMatch(target(), result());
    assert.equal(withFormality.endsWith('.'), true);
    assert.equal(withoutFormality.endsWith('.'), true);
    assert.equal((withFormality.match(/\./g) || []).length, 1);
  });
});
