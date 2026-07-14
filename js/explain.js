// Templated "why this matches" text generated purely from scorer output.
// No AI call involved.

const COLOR_PHRASES = {
  complementary: 'complementary colors',
  analogous: 'analogous colors',
  neutral: 'a neutral that pairs with anything',
  clash: 'bold, contrasting colors',
  unknown: 'colors that work together',
};

function categoryPhrase(categoryScore) {
  if (categoryScore >= 0.9) return 'a classic pairing';
  if (categoryScore >= 0.55) return 'a solid pairing';
  if (categoryScore >= 0.45) return 'a workable pairing';
  return 'a light accent pairing';
}

function patternPhrase(target, candidate, penalty) {
  if (penalty > 0) return 'both patterned, so keep it deliberate';
  if (target.pattern === 'patterned' || candidate.pattern === 'patterned') {
    return 'pattern balanced with solid';
  }
  return 'both solid';
}

/**
 * Build a short explanation string for a matcher.js scoreMatch() result.
 * `result` is one entry from findMatches(), `target` is the item it was
 * scored against.
 */
export function explainMatch(target, result) {
  const colorPhrase = COLOR_PHRASES[result.colorRelation] ?? COLOR_PHRASES.unknown;
  const catPhrase = categoryPhrase(result.categoryScore);
  const patPhrase = patternPhrase(target, result.item, result.patternPenalty);

  return `${capitalize(colorPhrase)}, ${catPhrase}, ${patPhrase}.`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
