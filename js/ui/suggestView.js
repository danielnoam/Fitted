import { getAllItems } from '../storage.js';
import { pickSurpriseCombo, scoreMatch } from '../matcher.js';
import { explainMatch } from '../explain.js';
import { itemCardHtml, openItemDetail } from './wardrobeView.js';
import { openMatchResults } from './matchView.js';
import { openCapture } from './captureView.js';
import { revokeBlobImagesOnLoad } from '../domUtil.js';

export async function render(container) {
  container.innerHTML = `
    <div class="suggest-modes">
      <div class="mode-card" id="mode-surprise">
        <span class="mode-emoji">🎲</span>
        <h3>Surprise me</h3>
        <p>A pairing from your wardrobe</p>
      </div>
      <div class="mode-card" id="mode-photo">
        <span class="mode-emoji">📷</span>
        <h3>From a photo</h3>
        <p>Check something new against what you own</p>
      </div>
    </div>
    <div id="suggest-result"></div>
  `;

  container.querySelector('#mode-surprise').addEventListener('click', () => runSurprise(container));
  container.querySelector('#mode-photo').addEventListener('click', () => openCapture());
}

async function runSurprise(container) {
  const resultEl = container.querySelector('#suggest-result');
  resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Picking a pairing…</div>`;

  const items = await getAllItems();
  if (items.length < 2) {
    resultEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">🧺</span>
        Add at least two wardrobe items to get a surprise pairing.
      </div>
    `;
    return;
  }

  const combo = pickSurpriseCombo(items);
  if (!combo) {
    resultEl.innerHTML = `
      <div class="empty-state">No compatible pairing found yet — add more variety to your wardrobe.</div>
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
  `;
  revokeBlobImagesOnLoad(resultEl);

  resultEl.querySelectorAll('.item-card').forEach((card, idx) => {
    card.addEventListener('click', () => {
      openItemDetail(idx === 0 ? seed : match.item, {});
    });
  });

  resultEl.querySelector('#suggest-shuffle').addEventListener('click', () => runSurprise(container));
  resultEl.querySelector('#suggest-more').addEventListener('click', () => openMatchResults(seed));
}
