// Shared formality <select> + "Suggest with AI" button, used by both the
// capture form and the wardrobe item detail view.

import { classifyFormality, getAiConfig, hasPrimaryKey } from '../ai/aiRouter.js';
import { FORMALITY_LEVELS, FORMALITY_LABELS } from '../matcher.js';

/**
 * @param {string} idPrefix
 * @param {string|null} currentValue
 * @param {{showAiSuggest?: boolean}} [opts] - the capture form has no other
 *   way to get an AI opinion before the item is saved, so it keeps the
 *   inline "Suggest" button; the wardrobe detail view has "Re-check with
 *   AI" for that instead, so it passes showAiSuggest: false to skip it.
 */
export function formalityFieldHtml(idPrefix, currentValue, { showAiSuggest = true } = {}) {
  return `
    <div class="field">
      <label for="${idPrefix}-formality">Formality (optional)</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="${idPrefix}-formality" style="flex:1;">
          <option value="">Not set</option>
          ${FORMALITY_LEVELS.map(
            (f) => `<option value="${f}" ${currentValue === f ? 'selected' : ''}>${FORMALITY_LABELS[f]}</option>`
          ).join('')}
        </select>
        ${showAiSuggest ? `<button type="button" class="btn" id="${idPrefix}-suggest-formality" style="display:none;white-space:nowrap;">✨ Suggest</button>` : ''}
      </div>
      ${showAiSuggest ? `<div id="${idPrefix}-formality-status" class="loading-row" style="padding:4px 0 0;display:none;"></div>` : ''}
    </div>
  `;
}

/**
 * Wires the formality select's change handler, and (unless showAiSuggest is
 * false) reveals + wires the "Suggest with AI" button when an API key is
 * already set.
 *
 * @param {HTMLElement} container
 * @param {string} idPrefix - must match what was passed to formalityFieldHtml
 * @param {() => Blob} getImage - returns the item's thumbnail blob on demand
 * @param {(value: string|null) => void} onChange
 * @param {{showAiSuggest?: boolean}} [opts]
 */
export async function wireFormalityField(container, idPrefix, getImage, onChange, { showAiSuggest = true } = {}) {
  const select = container.querySelector(`#${idPrefix}-formality`);
  if (!select) return;
  select.addEventListener('change', () => onChange(select.value || null));
  if (!showAiSuggest) return;

  const btn = container.querySelector(`#${idPrefix}-suggest-formality`);
  const status = container.querySelector(`#${idPrefix}-formality-status`);
  if (!btn || !status) return;

  const config = await getAiConfig();
  if (!hasPrimaryKey(config)) return;

  btn.style.display = '';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.style.display = 'flex';
    status.innerHTML = '<span class="spinner"></span> Looking at the photo…';
    try {
      const result = await classifyFormality({ config, image: getImage() });
      if (result) {
        select.value = result;
        onChange(result);
        status.style.display = 'none';
      } else {
        status.textContent = "Couldn't tell from the photo — pick manually.";
      }
    } catch (err) {
      status.textContent = err.message || 'Something went wrong.';
    }
    btn.disabled = false;
  });
}
