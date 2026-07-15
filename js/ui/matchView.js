import { getAllItems } from '../storage.js';
import { findMatches } from '../matcher.js';
import { explainMatch } from '../explain.js';
import { renderSwatches, openItemDetail } from './wardrobeView.js';
import { escapeHtml, revokeBlobImagesOnLoad } from '../domUtil.js';

/**
 * Show ranked matches for a target item as a full-screen overlay.
 * `target` can be a saved wardrobe item (has `.id`) or a transient,
 * unsaved "use once" item (no `.id`).
 */
export async function openMatchResults(target) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="overlay-header">
      <button class="icon-btn" id="match-close" aria-label="Close">✕</button>
      <h2>Matches</h2>
      <span style="width:34px"></span>
    </div>
    <div class="overlay-body">
      <div class="loading-row"><span class="spinner"></span> Scoring your wardrobe…</div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#match-close').addEventListener('click', () => overlay.remove());

  const wardrobe = await getAllItems();
  const results = findMatches(target, wardrobe, { limit: 30 });
  const body = overlay.querySelector('.overlay-body');

  if (!results.length) {
    body.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji" aria-hidden="true">🤷</span>
        No compatible items found yet. Add more pieces to your wardrobe to get matches.
      </div>
    `;
    return;
  }

  body.innerHTML = `<div class="match-list">${results.map((r) => matchRowHtml(target, r)).join('')}</div>`;
  revokeBlobImagesOnLoad(body);

  body.querySelectorAll('.match-row').forEach((row) => {
    row.addEventListener('click', () => {
      const result = results.find((r) => r.item.id === row.dataset.id);
      if (result?.item?.id) {
        openItemDetail(result.item, {});
      }
    });
  });
}

export function matchRowHtml(target, result) {
  const thumbUrl = URL.createObjectURL(result.item.thumbnail);
  const pct = Math.round(result.score * 100);
  return `
    <div class="match-row" data-id="${result.item.id ?? ''}">
      <div class="thumb-wrap"><img src="${thumbUrl}" alt="${result.item.category}" /></div>
      <div class="match-info">
        <div class="category-badge">${escapeHtml(result.item.category)}${result.item.subCategory ? ' · ' + escapeHtml(result.item.subCategory) : ''}</div>
        <div class="swatch-row" style="margin-bottom:4px;">${renderSwatches(result.item.dominantColors)}</div>
        <div class="match-why">${explainMatch(target, result)}</div>
      </div>
      <div class="match-score">${pct}%</div>
    </div>
  `;
}
