// "Re-check with AI" for a single wardrobe item: sends its actual photo
// (not just the recorded text) and offers per-field Apply/Dismiss fixes for
// subCategory/pattern/colors, the same deterministic values the app
// otherwise derives from pixels alone.

import { getSetting, updateItem } from '../storage.js';
import { sendMessage, DEFAULT_PROVIDER } from '../ai/aiRouter.js';

const HEX_RE = /^#[0-9a-f]{6}$/i;

function buildPrompt(item) {
  const colors = (item.dominantColors || []).map((c) => c.hex).join(', ') || '(none)';
  return `You are reviewing one clothing item photo in a wardrobe app. Current recorded data:
subCategory: ${item.subCategory || '(none)'}
pattern: ${item.pattern}
colors: ${colors}

Look at the actual photo and suggest corrections only for fields that are clearly wrong - leave a field null if the current guess already looks right. Respond with ONLY JSON, no prose, no markdown fences:
{"subCategory": "<short name, e.g. \\"t-shirt\\">" or null, "pattern": "solid" or "patterned" or null, "colors": ["#rrggbb", ...] or null}`;
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

  const apiKey = await getSetting('aiApiKey');
  if (!apiKey) return;
  const provider = await getSetting('aiProvider', DEFAULT_PROVIDER);

  btn.style.display = '';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Looking at the photo…</div>`;

    try {
      const reply = await sendMessage({
        provider,
        apiKey,
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
    resultEl.innerHTML = `<div class="empty-state">Couldn't read a suggestion from the AI's reply.</div>`;
    return;
  }

  const fieldFixes = [];
  if (typeof parsed.subCategory === 'string' && parsed.subCategory.trim() && parsed.subCategory.trim() !== item.subCategory) {
    fieldFixes.push({ field: 'subCategory', label: 'Sub-category', current: item.subCategory || '(none)', suggested: parsed.subCategory.trim() });
  }
  if ((parsed.pattern === 'solid' || parsed.pattern === 'patterned') && parsed.pattern !== item.pattern) {
    fieldFixes.push({ field: 'pattern', label: 'Pattern', current: item.pattern, suggested: parsed.pattern });
  }

  let colorSuggestion = null;
  if (Array.isArray(parsed.colors)) {
    const validHexes = parsed.colors.filter((h) => typeof h === 'string' && HEX_RE.test(h)).slice(0, 3);
    if (validHexes.length) {
      colorSuggestion = validHexes.map((hex) => ({ hex, ratio: +(1 / validHexes.length).toFixed(3) }));
    }
  }

  if (!fieldFixes.length && !colorSuggestion) {
    resultEl.innerHTML = `<div class="empty-state"><span class="empty-emoji">✅</span>The AI agrees with what's recorded.</div>`;
    return;
  }

  resultEl.innerHTML = `<div class="suggestion-list">
    ${fieldFixes.map(fieldCardHtml).join('')}
    ${colorSuggestion ? colorCardHtml(item.dominantColors, colorSuggestion) : ''}
  </div>`;

  fieldFixes.forEach((c) => {
    const card = resultEl.querySelector(`[data-field="${c.field}"]`);
    card.querySelector('.review-apply').addEventListener('click', async () => {
      item[c.field] = c.suggested;
      await updateItem(item);
      onChange();
      markCardApplied(card);
    });
    card.querySelector('.review-dismiss').addEventListener('click', () => card.remove());
  });

  if (colorSuggestion) {
    const card = resultEl.querySelector('[data-field="colors"]');
    card.querySelector('.review-apply').addEventListener('click', async () => {
      item.dominantColors = colorSuggestion;
      await updateItem(item);
      onChange();
      markCardApplied(card);
    });
    card.querySelector('.review-dismiss').addEventListener('click', () => card.remove());
  }
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
  const swatch = (c) => `<span class="swatch" style="background:${c.hex}" title="${c.hex}"></span>`;
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

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
