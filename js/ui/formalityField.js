// Shared formality <select> + "Suggest with AI" button, used by both the
// capture form and the wardrobe item detail view.

import { getSetting } from '../storage.js';
import { classifyFormality, DEFAULT_PROVIDER } from '../ai/aiRouter.js';
import { FORMALITY_LEVELS, FORMALITY_LABELS } from '../matcher.js';

export function formalityFieldHtml(idPrefix, currentValue) {
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
        <button type="button" class="btn" id="${idPrefix}-suggest-formality" style="display:none;white-space:nowrap;">✨ Suggest</button>
      </div>
      <div id="${idPrefix}-formality-status" class="loading-row" style="padding:4px 0 0;display:none;"></div>
    </div>
  `;
}

/**
 * Wires the formality select's change handler, and reveals + wires the
 * "Suggest with AI" button only if an API key is already set (the rest of
 * the app must keep working with no key, so this is purely additive).
 *
 * @param {HTMLElement} container
 * @param {string} idPrefix - must match what was passed to formalityFieldHtml
 * @param {() => Blob} getImage - returns the item's thumbnail blob on demand
 * @param {(value: string|null) => void} onChange
 */
export async function wireFormalityField(container, idPrefix, getImage, onChange) {
  const select = container.querySelector(`#${idPrefix}-formality`);
  const btn = container.querySelector(`#${idPrefix}-suggest-formality`);
  const status = container.querySelector(`#${idPrefix}-formality-status`);
  if (!select || !btn || !status) return;

  select.addEventListener('change', () => onChange(select.value || null));

  const apiKey = await getSetting('aiApiKey');
  if (!apiKey) return;
  const provider = await getSetting('aiProvider', DEFAULT_PROVIDER);

  btn.style.display = '';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.style.display = 'flex';
    status.innerHTML = '<span class="spinner"></span> Looking at the photo…';
    try {
      const result = await classifyFormality({ provider, apiKey, image: getImage() });
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
