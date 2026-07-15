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

// Dressiness scale, low to high. Unset (null/undefined) on either item
// skips this factor entirely, so matching stays fully deterministic and
// works with zero formality tags set - it only kicks in once tagged,
// whether by hand or via the AI tab's suggestion.
export const FORMALITY_LEVELS = ['athletic', 'casual', 'smart-casual', 'formal'];
export const FORMALITY_LABELS = {
  athletic: 'Athletic',
  casual: 'Casual',
  'smart-casual': 'Smart Casual',
  formal: 'Formal',
};
const FORMALITY_PENALTY_PER_GAP = 0.12;

export const WEIGHTS = {
  color: 0.5,
  category: 0.3,
  patternPenalty: PATTERN_PENALTY,
  formalityPenaltyPerGap: FORMALITY_PENALTY_PER_GAP,
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
 * Penalty for pairing items at very different dressiness levels (e.g.
 * athletic shorts with a smart-casual polo). A one-step gap (athletic vs.
 * casual, casual vs. smart-casual, ...) is treated as fine; only wider gaps
 * are penalized. Returns 0 if either item has no formality set.
 */
export function formalityPenalty(formalityA, formalityB) {
  if (!formalityA || !formalityB) return 0;
  const gap = Math.abs(FORMALITY_LEVELS.indexOf(formalityA) - FORMALITY_LEVELS.indexOf(formalityB));
  return Math.max(0, gap - 1) * FORMALITY_PENALTY_PER_GAP;
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
  const formalityPen = formalityPenalty(target.formality, candidate.formality);

  const score =
    WEIGHTS.color * color.score + WEIGHTS.category * catScore - penalty - formalityPen;

  return {
    item: candidate,
    score: Math.max(0, score),
    colorScore: color.score,
    colorRelation: color.relation,
    categoryScore: catScore,
    patternPenalty: penalty,
    formalityPenalty: formalityPen,
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
