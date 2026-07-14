import { getAllItems, deleteItem, updateItem } from '../storage.js';
import { openMatchResults } from './matchView.js';
import { openItemChat } from './aiChatView.js';

const CATEGORIES = ['top', 'bottom', 'outerwear', 'shoes', 'accessory'];

let activeFilter = 'all';

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
        <span class="category-badge">${item.category}${item.subCategory ? ' · ' + item.subCategory : ''}</span>
        <div class="swatch-row">${renderSwatches(item.dominantColors)}</div>
      </div>
    </button>
  `;
}

export async function render(container) {
  container.innerHTML = `
    <div class="chip-row" id="wardrobe-filters"></div>
    <div id="wardrobe-grid"></div>
  `;

  const items = await getAllItems();
  renderFilters(container, items);
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

function renderGrid(container, items) {
  const grid = container.querySelector('#wardrobe-grid');
  const filtered = activeFilter === 'all' ? items : items.filter((i) => i.category === activeFilter);

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">🧺</span>
        ${items.length === 0 ? 'Your wardrobe is empty. Tap + to add your first item.' : 'No items in this category yet.'}
      </div>
    `;
    return;
  }

  grid.innerHTML = `<div class="card-grid">${filtered.map(itemCardHtml).join('')}</div>`;
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
        ${item.subCategory ? `<span class="pill">${item.subCategory}</span>` : ''}
      </div>
      <div class="detail-meta-row">${renderSwatches(item.dominantColors, 'lg')}</div>
      ${item.notes ? `<p style="color:var(--text-dim);font-size:14px;">${escapeHtml(item.notes)}</p>` : ''}
      <div class="btn-row" style="margin-top:20px;">
        <button class="btn btn-primary btn-block" id="detail-find-matches">Find matches</button>
      </div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-block" id="detail-ask-ai">Ask AI about this</button>
      </div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-danger btn-block" id="detail-delete">Delete</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

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

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
