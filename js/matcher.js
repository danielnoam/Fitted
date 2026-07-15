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

// Weather suitability. 'all-season' matches anything with no penalty; unset
// (null/undefined) on either item also skips this factor, same rationale as
// formality above. Only a genuine warm/cold clash is penalized - there's no
// gap scale to walk since there are just three buckets.
export const SEASONS = ['warm-weather', 'all-season', 'cold-weather'];
export const SEASON_LABELS = {
  'warm-weather': 'Warm weather',
  'all-season': 'All season',
  'cold-weather': 'Cold weather',
};
const SEASON_PENALTY = 0.2;

export const WEIGHTS = {
  color: 0.5,
  category: 0.3,
  patternPenalty: PATTERN_PENALTY,
  formalityPenaltyPerGap: FORMALITY_PENALTY_PER_GAP,
  seasonPenalty: SEASON_PENALTY,
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
 * Penalty for pairing a warm-weather item with a cold-weather one. Zero if
 * either item is 'all-season' or has no season set at all.
 */
export function seasonPenalty(seasonA, seasonB) {
  if (!seasonA || !seasonB) return 0;
  if (seasonA === 'all-season' || seasonB === 'all-season') return 0;
  return seasonA !== seasonB ? SEASON_PENALTY : 0;
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
  const seasonPen = seasonPenalty(target.season, candidate.season);

  const score =
    WEIGHTS.color * color.score + WEIGHTS.category * catScore - penalty - formalityPen - seasonPen;

  return {
    item: candidate,
    score: Math.max(0, score),
    colorScore: color.score,
    colorRelation: color.relation,
    categoryScore: catScore,
    patternPenalty: penalty,
    formalityPenalty: formalityPen,
    seasonPenalty: seasonPen,
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

// ---------- Full outfit builder ----------

const REQUIRED_OUTFIT_CATEGORIES = ['top', 'bottom', 'shoes'];
const OPTIONAL_OUTFIT_CATEGORIES = ['outerwear', 'accessory'];

/**
 * Scores a full outfit (3+ items, one per category) as the average of every
 * pairwise scoreMatch() between its items - the same deterministic scoring
 * findMatches() uses for pairs, just aggregated across every combination in
 * the outfit rather than just one.
 */
export function scoreOutfit(items) {
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const result = scoreMatch(items[i], items[j]);
      if (result) pairs.push({ a: items[i], ...result });
    }
  }
  const score = pairs.length ? pairs.reduce((sum, p) => sum + p.score, 0) / pairs.length : 0;
  return { items, score, pairs };
}

/**
 * Builds a full outfit (top + bottom + shoes, plus outerwear/accessory when
 * they help) from the wardrobe. Seeds on a random top, narrows bottom/shoes/
 * outerwear/accessory to each one's top matches against that seed (so the
 * search stays small regardless of wardrobe size), then brute-forces every
 * combination across those short pools and keeps the highest-scoring one.
 * Optional slots include a "leave this slot empty" option in their pool, so
 * an outerwear/accessory piece is only included when it actually improves
 * the outfit's average score.
 *
 * Returns null if the wardrobe doesn't have at least one top, bottom, and
 * pair of shoes.
 */
export function buildOutfit(wardrobeItems, { poolSize = 5 } = {}) {
  const byCategory = {};
  for (const item of wardrobeItems) {
    (byCategory[item.category] ??= []).push(item);
  }
  if (REQUIRED_OUTFIT_CATEGORIES.some((cat) => !byCategory[cat]?.length)) return null;

  const seed = byCategory.top[Math.floor(Math.random() * byCategory.top.length)];

  function pool(category) {
    return findMatches(seed, byCategory[category] || [], { limit: poolSize }).map((r) => r.item);
  }

  const slotPools = { top: [seed], bottom: pool('bottom'), shoes: pool('shoes') };
  if (!slotPools.bottom.length || !slotPools.shoes.length) return null;

  for (const cat of OPTIONAL_OUTFIT_CATEGORIES) {
    const candidates = pool(cat);
    if (candidates.length) slotPools[cat] = [null, ...candidates];
  }

  const slots = Object.keys(slotPools);
  let best = null;
  (function search(idx, chosen) {
    if (idx === slots.length) {
      const result = scoreOutfit(chosen);
      if (!best || result.score > best.score) best = result;
      return;
    }
    for (const item of slotPools[slots[idx]]) {
      search(idx + 1, item ? [...chosen, item] : chosen);
    }
  })(0, []);

  return best;
}
