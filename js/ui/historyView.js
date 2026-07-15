// Wear-history overlay: lists past "marked as worn" log entries, newest
// first, reusing the wardrobe.js/aiChatView.js suggestion-card styling so it
// doesn't need any new CSS.

import { getAllHistoryEntries, deleteHistoryEntry, getAllItems } from '../storage.js';
import { escapeHtml, revokeBlobImagesOnLoad } from '../domUtil.js';
import { formatRelativeDate } from '../dateUtil.js';

export async function openHistory() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="overlay-header">
      <button class="icon-btn" id="history-close" aria-label="Close">✕</button>
      <h2>Wear history</h2>
      <span style="width:34px"></span>
    </div>
    <div class="overlay-body">
      <div class="loading-row"><span class="spinner"></span> Loading…</div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#history-close').addEventListener('click', () => overlay.remove());

  const [entries, items] = await Promise.all([getAllHistoryEntries(), getAllItems()]);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  renderEntries(overlay, entries, itemsById);
}

function renderEntries(overlay, entries, itemsById) {
  const body = overlay.querySelector('.overlay-body');

  if (!entries.length) {
    body.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">📜</span>
        Nothing logged yet — mark an item or outfit as worn to start a history.
      </div>
    `;
    return;
  }

  body.innerHTML = `<div class="suggestion-list">${entries.map(entryHtml).join('')}</div>`;
  revokeBlobImagesOnLoad(body);

  entries.forEach((entry) => {
    body.querySelector(`[data-entry="${entry.id}"] .history-delete`)?.addEventListener('click', async () => {
      if (!confirm('Delete this history entry?')) return;
      await deleteHistoryEntry(entry.id);
      renderEntries(overlay, entries.filter((e) => e.id !== entry.id), itemsById);
    });
  });

  function entryHtml(entry) {
    const items = entry.itemIds.map((id) => itemsById.get(id)).filter(Boolean);
    const thumbs = items.length
      ? items.map(miniItemHtml).join('')
      : '<span style="color:var(--text-dim);font-size:12px;">(items no longer in your wardrobe)</span>';

    return `
      <div class="suggestion-card" data-entry="${entry.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span class="pill">${escapeHtml(formatRelativeDate(entry.date))}</span>
          <button class="icon-btn history-delete" aria-label="Delete entry">🗑</button>
        </div>
        <div class="suggestion-item-row">${thumbs}</div>
      </div>
    `;
  }
}

function miniItemHtml(item) {
  const thumbUrl = URL.createObjectURL(item.thumbnail);
  return `
    <div class="suggestion-mini-item">
      <img src="${thumbUrl}" alt="${item.category}" />
      <span>${escapeHtml(item.category)}${item.subCategory ? ' · ' + escapeHtml(item.subCategory) : ''}</span>
    </div>
  `;
}
