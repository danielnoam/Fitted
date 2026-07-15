import { getAllItems, deleteItem, updateItem } from '../storage.js';
import { openMatchResults } from './matchView.js';
import { openItemChat } from './aiChatView.js';
import { formalityFieldHtml, wireFormalityField } from './formalityField.js';
import { seasonFieldHtml, wireSeasonField } from './seasonField.js';
import { wireAiReview } from './aiReview.js';
import { pickImage } from '../camera.js';
import { processImageFile } from '../imageProcess.js';
import { escapeHtml, revokeBlobImagesOnLoad } from '../domUtil.js';
import { CATEGORIES } from '../constants.js';
import { FORMALITY_LEVELS, FORMALITY_LABELS } from '../matcher.js';
import { colorFamily } from '../colorMatch.js';
import { formatRelativeDate } from '../dateUtil.js';
import { logWorn } from '../wearLog.js';
import { openHistory } from './historyView.js';

let activeFilter = 'all';
let activeFormality = 'all';
let activeColor = 'all';
let searchQuery = '';
let filtersOpen = false;

export function renderSwatches(colors, size = 'sm') {
  const cls = size === 'lg' ? 'swatch-lg' : 'swatch';
  return (colors || [])
    .map((c) => `<span class="${cls}" style="background:${c.hex}" title="${c.hex}"></span>`)
    .join('');
}

export function itemCardHtml(item) {
  const thumbUrl = URL.createObjectURL(item.thumbnail);
  return `
    <button class="item-card" data-id="${item.id}">
      <div class="thumb-wrap"><img src="${thumbUrl}" alt="${item.category}" /></div>
      <div class="card-body">
        <span class="category-badge">${escapeHtml(item.category)}${item.subCategory ? ' · ' + escapeHtml(item.subCategory) : ''}</span>
        <div class="swatch-row">${renderSwatches(item.dominantColors)}</div>
      </div>
    </button>
  `;
}

export async function render(container) {
  container.innerHTML = `
    <div class="wardrobe-toolbar" style="display:flex;gap:8px;margin-bottom:10px;">
      <input type="search" id="wardrobe-search" placeholder="Search notes, sub-category…" style="flex:1;" />
      <button class="btn" id="wardrobe-filter-toggle">⚙️ Filters</button>
      <button class="icon-btn" id="wardrobe-history" aria-label="Wear history">📜</button>
    </div>
    <div class="chip-row" id="wardrobe-filters"></div>
    <div id="wardrobe-extra-filters" style="display:none;">
      <p class="section-title" style="margin-bottom:6px;">Formality</p>
      <div class="chip-row" id="wardrobe-formality-filters"></div>
      <p class="section-title" style="margin:10px 0 6px;">Color</p>
      <div class="chip-row" id="wardrobe-color-filters"></div>
    </div>
    <div id="wardrobe-grid"></div>
  `;

  const items = await getAllItems();

  const searchInput = container.querySelector('#wardrobe-search');
  searchInput.value = searchQuery;
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderGrid(container, items);
  });

  const extraFilters = container.querySelector('#wardrobe-extra-filters');
  extraFilters.style.display = filtersOpen ? '' : 'none';
  container.querySelector('#wardrobe-filter-toggle').addEventListener('click', () => {
    filtersOpen = !filtersOpen;
    extraFilters.style.display = filtersOpen ? '' : 'none';
  });

  container.querySelector('#wardrobe-history').addEventListener('click', () => openHistory());

  renderFilters(container, items);
  renderFormalityFilters(container, items);
  renderColorFilters(container, items);
  renderGrid(container, items);
}

function renderFilters(container, items) {
  const filterRow = container.querySelector('#wardrobe-filters');
  const counts = { all: items.length };
  for (const cat of CATEGORIES) counts[cat] = items.filter((i) => i.category === cat).length;

  const chips = ['all', ...CATEGORIES];
  filterRow.innerHTML = chips
    .map(
      (cat) => `
      <button class="chip ${activeFilter === cat ? 'active' : ''}" data-cat="${cat}">
        ${cat === 'all' ? 'All' : cat[0].toUpperCase() + cat.slice(1)} (${counts[cat]})
      </button>`
    )
    .join('');

  filterRow.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.cat;
      renderFilters(container, items);
      renderGrid(container, items);
    });
  });
}

function renderFormalityFilters(container, items) {
  const row = container.querySelector('#wardrobe-formality-filters');
  const levels = ['all', ...FORMALITY_LEVELS];
  row.innerHTML = levels
    .map((level) => {
      const label = level === 'all' ? 'All' : FORMALITY_LABELS[level];
      return `<button class="chip ${activeFormality === level ? 'active' : ''}" data-formality="${level}">${label}</button>`;
    })
    .join('');

  row.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeFormality = chip.dataset.formality;
      renderFormalityFilters(container, items);
      renderGrid(container, items);
    });
  });
}

function itemColorFamilies(item) {
  return new Set((item.dominantColors || []).map((c) => colorFamily(c.hex)));
}

function renderColorFilters(container, items) {
  const row = container.querySelector('#wardrobe-color-filters');
  const present = new Set();
  items.forEach((item) => itemColorFamilies(item).forEach((fam) => present.add(fam)));
  const families = ['all', ...[...present].sort()];

  row.innerHTML = families
    .map(
      (fam) =>
        `<button class="chip ${activeColor === fam ? 'active' : ''}" data-color="${fam}">${fam === 'all' ? 'All' : fam[0].toUpperCase() + fam.slice(1)}</button>`
    )
    .join('');

  row.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeColor = chip.dataset.color;
      renderColorFilters(container, items);
      renderGrid(container, items);
    });
  });
}

function itemMatchesSearch(item, query) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (item.subCategory || '').toLowerCase().includes(q) || (item.notes || '').toLowerCase().includes(q);
}

function renderGrid(container, items) {
  const grid = container.querySelector('#wardrobe-grid');
  const filtered = items.filter(
    (item) =>
      (activeFilter === 'all' || item.category === activeFilter) &&
      (activeFormality === 'all' || item.formality === activeFormality) &&
      (activeColor === 'all' || itemColorFamilies(item).has(activeColor)) &&
      itemMatchesSearch(item, searchQuery)
  );

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">🧺</span>
        ${items.length === 0 ? 'Your wardrobe is empty. Tap + to add your first item.' : 'No items match your filters.'}
      </div>
    `;
    return;
  }

  grid.innerHTML = `<div class="card-grid">${filtered.map(itemCardHtml).join('')}</div>`;
  revokeBlobImagesOnLoad(grid);
  grid.querySelectorAll('.item-card').forEach((card) => {
    card.addEventListener('click', () => {
      const item = items.find((i) => i.id === card.dataset.id);
      if (item) openItemDetail(item, { onChange: () => render(container) });
    });
  });
}

export function openItemDetail(item, { onChange } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const thumbUrl = URL.createObjectURL(item.thumbnail);

  overlay.innerHTML = `
    <div class="overlay-header">
      <button class="icon-btn" id="detail-close" aria-label="Close">✕</button>
      <h2>${item.category[0].toUpperCase() + item.category.slice(1)}</h2>
      <button class="icon-btn" id="detail-favorite" aria-label="Favorite">${item.favorite ? '★' : '☆'}</button>
    </div>
    <div class="overlay-body">
      <div class="detail-thumb"><img src="${thumbUrl}" alt="${item.category}" /></div>
      <div class="detail-meta-row">
        <span class="pill">${item.pattern}</span>
        ${item.subCategory ? `<span class="pill">${escapeHtml(item.subCategory)}</span>` : ''}
      </div>
      <div class="detail-meta-row">${renderSwatches(item.dominantColors, 'lg')}</div>
      ${item.notes ? `<p style="color:var(--text-dim);font-size:14px;">${escapeHtml(item.notes)}</p>` : ''}
      ${formalityFieldHtml('detail', item.formality || null)}
      ${seasonFieldHtml('detail', item.season || null)}
      <p style="color:var(--text-dim);font-size:13px;margin:4px 0 0;">
        ${item.lastWorn ? `Last worn: ${formatRelativeDate(item.lastWorn)}` : 'Not worn yet'}
      </p>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-block" id="detail-mark-worn">👕 Mark as worn today</button>
      </div>
      <div class="btn-row" style="margin-top:20px;">
        <button class="btn btn-primary btn-block" id="detail-find-matches">Find matches</button>
      </div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-block" id="detail-retake">📷 Retake photo</button>
      </div>
      <div id="detail-retake-status" style="font-size:12px;color:var(--text-dim);margin-top:4px;"></div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-block" id="detail-ai-review" style="display:none;">🔍 Re-check with AI</button>
      </div>
      <div id="detail-ai-review-result"></div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-block" id="detail-ask-ai">Ask AI about this</button>
      </div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-danger btn-block" id="detail-delete">Delete</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  revokeBlobImagesOnLoad(overlay);

  // Closes and reopens the detail overlay so the thumbnail/pills/swatches
  // reflect whatever an AI review or retake just changed on `item`.
  const refreshDetail = () => {
    overlay.remove();
    openItemDetail(item, { onChange });
  };

  overlay.querySelector('#detail-close').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#detail-favorite').addEventListener('click', async () => {
    item.favorite = !item.favorite;
    await updateItem(item);
    overlay.querySelector('#detail-favorite').textContent = item.favorite ? '★' : '☆';
    onChange?.();
  });

  overlay.querySelector('#detail-find-matches').addEventListener('click', () => {
    openMatchResults(item);
  });

  wireFormalityField(overlay, 'detail', () => item.thumbnail, async (value) => {
    item.formality = value;
    await updateItem(item);
    onChange?.();
  });

  wireSeasonField(overlay, 'detail', async (value) => {
    item.season = value;
    await updateItem(item);
    onChange?.();
  });

  overlay.querySelector('#detail-mark-worn').addEventListener('click', async () => {
    await logWorn([item]);
    onChange?.();
    refreshDetail();
  });

  wireAiReview(overlay, item, overlay.querySelector('#detail-ai-review-result'), () => {
    onChange?.();
    refreshDetail();
  });

  overlay.querySelector('#detail-retake').addEventListener('click', async () => {
    const file = await pickImage();
    if (!file) return;
    const statusEl = overlay.querySelector('#detail-retake-status');
    statusEl.textContent = 'Updating photo…';
    try {
      const analysis = await processImageFile(file);
      item.thumbnail = analysis.thumbnail;
      item.dominantColors = analysis.dominantColors;
      item.pattern = analysis.pattern;
      await updateItem(item);
      onChange?.();
      refreshDetail();
    } catch (err) {
      statusEl.textContent = "Couldn't read that photo. Try again.";
    }
  });

  overlay.querySelector('#detail-ask-ai').addEventListener('click', () => {
    overlay.remove();
    openItemChat(item);
  });

  overlay.querySelector('#detail-delete').addEventListener('click', async () => {
    if (!confirm('Delete this item from your wardrobe?')) return;
    await deleteItem(item.id);
    overlay.remove();
    onChange?.();
  });
}
