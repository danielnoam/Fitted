// Shared season <select>, used by both the capture form and the wardrobe
// item detail view. Plain manual field, no AI-suggest button (unlike
// formalityField.js) - there's no photo-classification hook for weather
// suitability the way there is for formality.

import { SEASONS, SEASON_LABELS } from '../matcher.js';

export function seasonFieldHtml(idPrefix, currentValue) {
  return `
    <div class="field">
      <label for="${idPrefix}-season">Season (optional)</label>
      <select id="${idPrefix}-season">
        <option value="">Not set</option>
        ${SEASONS.map(
          (s) => `<option value="${s}" ${currentValue === s ? 'selected' : ''}>${SEASON_LABELS[s]}</option>`
        ).join('')}
      </select>
    </div>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {string} idPrefix - must match what was passed to seasonFieldHtml
 * @param {(value: string|null) => void} onChange
 */
export function wireSeasonField(container, idPrefix, onChange) {
  const select = container.querySelector(`#${idPrefix}-season`);
  if (!select) return;
  select.addEventListener('change', () => onChange(select.value || null));
}
