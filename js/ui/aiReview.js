// "Re-check with AI" for a single wardrobe item: sends its actual photo
// (not just the recorded text) and offers per-field Apply/Dismiss fixes for
// subCategory/pattern/colors/formality, the same deterministic values the
// app otherwise derives from pixels alone (formality is the one exception -
// there's no pixel-based formality detector, so this is its only AI check).

import { updateItem } from '../storage.js';
import { sendMessageWithFallback, getAiConfig, hasPrimaryKey } from '../ai/aiRouter.js';
import { MAX_SUBCATEGORY_LENGTH } from '../constants.js';
import { escapeHtml } from '../domUtil.js';
import { colorFamily } from '../colorMatch.js';
import { FORMALITY_LEVELS, FORMALITY_LABELS } from '../matcher.js';

const HEX_RE = /^#[0-9a-f]{6}$/i;

function buildPrompt(item) {
  const colors = (item.dominantColors || []).map((c) => c.hex).join(', ') || '(none)';
  const formality = item.formality ? FORMALITY_LABELS[item.formality] : '(none)';
  return `You are reviewing one clothing item photo in a wardrobe app. Current recorded data:
subCategory: ${item.subCategory || '(none)'}
pattern: ${item.pattern}
colors: ${colors}
formality: ${formality}

Look at the actual photo. For pattern, colors, and formality, only suggest a replacement if the current value is clearly wrong or unset - leave it null if it already looks right. For subCategory, also suggest a replacement whenever a more specific, descriptive garment name would help - not only when the current one is wrong. For example, if subCategory is the generic "long pants" but the photo clearly shows chinos, suggest "chinos" even though "long pants" wasn't technically wrong. Leave subCategory null only if it's already reasonably specific. Keep suggestions to a short, common garment name (2-3 words max).

Respond with ONLY JSON, no prose, no markdown fences:
{"subCategory": "<short name, e.g. \\"chinos\\">" or null, "pattern": "solid" or "patterned" or null, "colors": ["#rrggbb", ...] or null, "formality": one of ${JSON.stringify(FORMALITY_LEVELS)} or null}`;
}

function parseReview(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Reveals + wires the "Re-check with AI" button (only if a key is set) to
 * send `item`'s photo and render suggested fixes into `resultEl`.
 */
export async function wireAiReview(container, item, resultEl, onChange) {
  const btn = container.querySelector('#detail-ai-review');
  if (!btn) return;

  const config = await getAiConfig();
  if (!hasPrimaryKey(config)) return;

  btn.style.display = '';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Looking at the photo…</div>`;

    try {
      const reply = await sendMessageWithFallback({
        config,
        messages: [{ role: 'user', content: buildPrompt(item) }],
        image: item.thumbnail,
      });
      renderReviewResult(resultEl, item, parseReview(reply), onChange);
    } catch (err) {
      resultEl.innerHTML = `<div class="chat-bubble error">${escapeHtml(err.message || 'Something went wrong.')}</div>`;
    }
    btn.disabled = false;
  });
}

function renderReviewResult(resultEl, item, parsed, onChange) {
  if (!parsed) {
    resultEl.innerHTML = `<div class="empty-state"><span class="empty-emoji" aria-hidden="true">🤔</span>Couldn't read a suggestion from the AI's reply.</div>`;
    return;
  }

  const fieldFixes = [];
  const suggestedSubCategory = typeof parsed.subCategory === 'string' ? parsed.subCategory.trim().slice(0, MAX_SUBCATEGORY_LENGTH) : '';
  if (suggestedSubCategory && suggestedSubCategory !== item.subCategory) {
    fieldFixes.push({ field: 'subCategory', label: 'Sub-category', current: item.subCategory || '(none)', suggested: suggestedSubCategory });
  }
  if ((parsed.pattern === 'solid' || parsed.pattern === 'patterned') && parsed.pattern !== item.pattern) {
    fieldFixes.push({ field: 'pattern', label: 'Pattern', current: item.pattern, suggested: parsed.pattern });
  }
  if (typeof parsed.formality === 'string' && FORMALITY_LEVELS.includes(parsed.formality) && parsed.formality !== item.formality) {
    fieldFixes.push({
      field: 'formality',
      label: 'Formality',
      current: item.formality ? FORMALITY_LABELS[item.formality] : '(not set)',
      suggested: FORMALITY_LABELS[parsed.formality],
      value: parsed.formality, // the enum key to actually store - "suggested" above is just the display label
    });
  }

  let colorSuggestion = null;
  if (Array.isArray(parsed.colors)) {
    const validHexes = parsed.colors.filter((h) => typeof h === 'string' && HEX_RE.test(h)).slice(0, 3);
    if (validHexes.length) {
      colorSuggestion = validHexes.map((hex) => ({ hex, ratio: +(1 / validHexes.length).toFixed(3) }));
    }
  }

  if (!fieldFixes.length && !colorSuggestion) {
    resultEl.innerHTML = `<div class="empty-state"><span class="empty-emoji" aria-hidden="true">✅</span>The AI agrees with what's recorded.</div>`;
    return;
  }

  const totalSuggestions = fieldFixes.length + (colorSuggestion ? 1 : 0);

  resultEl.innerHTML = `<div class="suggestion-list">
    ${totalSuggestions > 1 ? applyAllButtonHtml() : ''}
    ${fieldFixes.map(fieldCardHtml).join('')}
    ${colorSuggestion ? colorCardHtml(item.dominantColors, colorSuggestion) : ''}
  </div>`;

  fieldFixes.forEach((c) => {
    const card = resultEl.querySelector(`[data-field="${c.field}"]`);
    card.querySelector('.review-apply').addEventListener('click', async () => {
      item[c.field] = c.value ?? c.suggested;
      await updateItem(item);
      onChange();
      markCardApplied(card);
      updateApplyAllVisibility(resultEl);
    });
    card.querySelector('.review-dismiss').addEventListener('click', () => {
      card.remove();
      updateApplyAllVisibility(resultEl);
    });
  });

  if (colorSuggestion) {
    const card = resultEl.querySelector('[data-field="colors"]');
    card.querySelector('.review-apply').addEventListener('click', async () => {
      item.dominantColors = colorSuggestion;
      await updateItem(item);
      onChange();
      markCardApplied(card);
      updateApplyAllVisibility(resultEl);
    });
    card.querySelector('.review-dismiss').addEventListener('click', () => {
      card.remove();
      updateApplyAllVisibility(resultEl);
    });
  }

  resultEl.querySelector('#review-apply-all')?.addEventListener('click', async () => {
    // Only act on cards still pending (not already individually applied or
    // dismissed) - re-reading the live DOM avoids double-applying or
    // reviving something the user already dealt with.
    const pendingCards = [...resultEl.querySelectorAll('.suggestion-card:not(.applied)')];
    if (!pendingCards.length) return;

    for (const card of pendingCards) {
      const field = card.dataset.field;
      if (field === 'colors') {
        item.dominantColors = colorSuggestion;
      } else {
        const fix = fieldFixes.find((f) => f.field === field);
        if (fix) item[fix.field] = fix.value ?? fix.suggested;
      }
    }
    await updateItem(item);
    onChange();
    pendingCards.forEach(markCardApplied);
    updateApplyAllVisibility(resultEl);
  });
}

function updateApplyAllVisibility(resultEl) {
  const applyAllRow = resultEl.querySelector('#review-apply-all')?.closest('.btn-row');
  if (!applyAllRow) return;
  const pending = resultEl.querySelectorAll('.suggestion-card:not(.applied)').length;
  applyAllRow.style.display = pending > 1 ? '' : 'none';
}

function applyAllButtonHtml() {
  return `<div class="btn-row" style="margin-bottom:2px;"><button class="btn btn-primary btn-block" id="review-apply-all">Apply all</button></div>`;
}

function fieldCardHtml(c) {
  return `
    <div class="suggestion-card" data-field="${c.field}">
      <p class="suggestion-issue">${c.label}</p>
      <p class="suggestion-change">${escapeHtml(String(c.current))} → <strong>${escapeHtml(String(c.suggested))}</strong></p>
      <div class="btn-row">
        <button class="btn btn-primary review-apply">Apply</button>
        <button class="btn review-dismiss">Dismiss</button>
      </div>
    </div>
  `;
}

function colorCardHtml(current, suggested) {
  const swatch = (c) =>
    `<span class="swatch" style="background:${c.hex}" title="${c.hex}" role="img" aria-label="${colorFamily(c.hex)} swatch, ${c.hex}"></span>`;
  return `
    <div class="suggestion-card" data-field="colors">
      <p class="suggestion-issue">Dominant colors</p>
      <div class="suggestion-change" style="display:flex;align-items:center;gap:8px;">
        <span class="swatch-row">${(current || []).map(swatch).join('')}</span>
        <span>→</span>
        <span class="swatch-row">${suggested.map(swatch).join('')}</span>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary review-apply">Apply</button>
        <button class="btn review-dismiss">Dismiss</button>
      </div>
    </div>
  `;
}

function markCardApplied(card) {
  card.classList.add('applied');
  card.querySelectorAll('button').forEach((b) => (b.disabled = true));
}
