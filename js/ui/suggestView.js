import { getAllItems } from '../storage.js';
import { pickSurpriseCombo, scoreMatch, buildOutfit } from '../matcher.js';
import { explainMatch } from '../explain.js';
import { itemCardHtml, openItemDetail } from './wardrobeView.js';
import { openMatchResults } from './matchView.js';
import { openCapture } from './captureView.js';
import { revokeBlobImagesOnLoad, showToast } from '../domUtil.js';
import { logWorn } from '../wearLog.js';

export async function render(container) {
  container.innerHTML = `
    <div class="suggest-modes">
      <div class="mode-card" id="mode-surprise">
        <span class="mode-emoji" aria-hidden="true">🎲</span>
        <h3>Surprise me</h3>
        <p>A pairing from your wardrobe</p>
      </div>
      <div class="mode-card" id="mode-outfit">
        <span class="mode-emoji" aria-hidden="true">🧥</span>
        <h3>Build an outfit</h3>
        <p>Top, bottom, shoes — and more</p>
      </div>
      <div class="mode-card" id="mode-photo">
        <span class="mode-emoji" aria-hidden="true">📷</span>
        <h3>From a photo</h3>
        <p>Check something new against what you own</p>
      </div>
    </div>
    <div id="suggest-result"></div>
  `;

  container.querySelector('#mode-surprise').addEventListener('click', () => runSurprise(container));
  container.querySelector('#mode-outfit').addEventListener('click', () => runOutfit(container));
  container.querySelector('#mode-photo').addEventListener('click', () => openCapture());
}

async function runSurprise(container) {
  const resultEl = container.querySelector('#suggest-result');
  resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Picking a pairing…</div>`;

  const items = await getAllItems();
  if (items.length < 2) {
    resultEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji" aria-hidden="true">🧺</span>
        Add at least two wardrobe items to get a surprise pairing.
      </div>
    `;
    return;
  }

  const combo = pickSurpriseCombo(items);
  if (!combo) {
    resultEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji" aria-hidden="true">🤷</span>
        No compatible pairing found yet — add more variety to your wardrobe.
      </div>
    `;
    return;
  }

  const { seed, match } = combo;
  const result = scoreMatch(seed, match.item) ?? match;

  resultEl.innerHTML = `
    <p class="section-title">Suggested pairing</p>
    <div class="combo-pair">${itemCardHtml(seed)}${itemCardHtml(match.item)}</div>
    <p class="match-why" style="font-size:13px;margin-bottom:16px;">${explainMatch(seed, result)}</p>
    <div class="btn-row">
      <button class="btn btn-block" id="suggest-shuffle">Shuffle</button>
      <button class="btn btn-primary btn-block" id="suggest-more">See more matches</button>
    </div>
    <div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-block" id="suggest-worn">👕 Mark as worn today</button>
    </div>
  `;
  revokeBlobImagesOnLoad(resultEl);

  resultEl.querySelectorAll('.item-card').forEach((card, idx) => {
    card.addEventListener('click', () => {
      openItemDetail(idx === 0 ? seed : match.item, {});
    });
  });

  resultEl.querySelector('#suggest-shuffle').addEventListener('click', () => runSurprise(container));
  resultEl.querySelector('#suggest-more').addEventListener('click', () => openMatchResults(seed));
  resultEl.querySelector('#suggest-worn').addEventListener('click', async () => {
    await logWorn([seed, match.item]);
    showToast('Logged as worn today');
  });
}

async function runOutfit(container) {
  const resultEl = container.querySelector('#suggest-result');
  resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Building an outfit…</div>`;

  const items = await getAllItems();
  const outfit = buildOutfit(items);
  if (!outfit) {
    resultEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji" aria-hidden="true">🧥</span>
        Add at least a top, a bottom, and shoes to build a full outfit.
      </div>
    `;
    return;
  }

  const pct = Math.round(outfit.score * 100);
  const pairsHtml = outfit.pairs
    .map(
      (pair) => `
      <p class="match-why" style="font-size:12px;margin:4px 0;">
        ${capitalize(pair.a.category)} + ${capitalize(pair.item.category)}: ${explainMatch(pair.a, pair)}
      </p>`
    )
    .join('');

  resultEl.innerHTML = `
    <p class="section-title">Suggested outfit <span style="color:var(--accent);">${pct}%</span></p>
    <div class="combo-pair">${outfit.items.map(itemCardHtml).join('')}</div>
    ${pairsHtml}
    <div class="btn-row" style="margin-top:12px;">
      <button class="btn btn-block" id="outfit-shuffle">Shuffle</button>
      <button class="btn btn-primary btn-block" id="outfit-worn">👕 Mark as worn today</button>
    </div>
  `;
  revokeBlobImagesOnLoad(resultEl);

  resultEl.querySelectorAll('.item-card').forEach((card) => {
    card.addEventListener('click', () => {
      const item = outfit.items.find((i) => i.id === card.dataset.id);
      if (item) openItemDetail(item, {});
    });
  });

  resultEl.querySelector('#outfit-shuffle').addEventListener('click', () => runOutfit(container));
  resultEl.querySelector('#outfit-worn').addEventListener('click', async () => {
    await logWorn(outfit.items);
    showToast('Logged as worn today');
  });
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
