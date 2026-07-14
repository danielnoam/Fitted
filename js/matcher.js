// Combines color harmony + category compatibility + pattern rules into a
// single ranked score. Deterministic, no AI involved.

import { scoreColorHarmony } from './colorMatch.js';

// Category compatibility, symmetric. Keys are the two category names sorted
// alphabetically and joined with '|' (must match categoryKey() below).
// null/absent = excluded from results.
const CATEGORY_COMPAT = {
  'bottom|top': 1.0,
  'outerwear|top': 1.0,
  'shoes|top': 0.5,
  'accessory|top': 0.3,
  'bottom|outerwear': 0.6,
  'bottom|shoes': 0.6,
  'accessory|bottom': 0.3,
  'outerwear|shoes': 0.5,
  'accessory|outerwear': 0.3,
  'accessory|shoes': 0.3,
};

const PATTERN_PENALTY = 0.15;

export const WEIGHTS = {
  color: 0.5,
  category: 0.3,
  patternPenalty: PATTERN_PENALTY,
};

function categoryKey(catA, catB) {
  return [catA, catB].sort().join('|');
}

/**
 * Category compatibility score, or null if the pairing is excluded
 * (e.g. same category paired with itself).
 */
export function categoryScore(catA, catB) {
  if (catA === catB) return null;
  const key = categoryKey(catA, catB);
  return CATEGORY_COMPAT[key] ?? 0.4; // default mild compatibility for unlisted pairs
}

export function patternPenalty(patternA, patternB) {
  return patternA === 'patterned' && patternB === 'patterned' ? PATTERN_PENALTY : 0;
}

/**
 * Score a candidate item against a target item. Returns null if the pair
 * is excluded (same category).
 */
export function scoreMatch(target, candidate) {
  const catScore = categoryScore(target.category, candidate.category);
  if (catScore === null) return null;

  const color = scoreColorHarmony(target.dominantColors, candidate.dominantColors);
  const penalty = patternPenalty(target.pattern, candidate.pattern);

  const score =
    WEIGHTS.color * color.score + WEIGHTS.category * catScore - penalty;

  return {
    item: candidate,
    score: Math.max(0, score),
    colorScore: color.score,
    colorRelation: color.relation,
    categoryScore: catScore,
    patternPenalty: penalty,
  };
}

/**
 * Rank all wardrobe items against a target, excluding the target itself
 * and any excluded category pairs.
 */
export function findMatches(target, wardrobeItems, { limit = 20 } = {}) {
  const results = [];
  for (const candidate of wardrobeItems) {
    if (candidate.id && target.id && candidate.id === target.id) continue;
    const result = scoreMatch(target, candidate);
    if (result) results.push(result);
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * "Surprise me": pick a random valid, well-scoring combo from the wardrobe.
 * Picks a random seed item, finds its best matches, then picks weighted-random
 * among the top matches so results vary between calls without being nonsense.
 */
export function pickSurpriseCombo(wardrobeItems, { topPoolSize = 5 } = {}) {
  if (wardrobeItems.length < 2) return null;

  const seed = wardrobeItems[Math.floor(Math.random() * wardrobeItems.length)];
  const matches = findMatches(seed, wardrobeItems, { limit: topPoolSize });
  if (!matches.length) return null;

  const pick = matches[Math.floor(Math.random() * matches.length)];
  return { seed, match: pick };
}
