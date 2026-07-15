import { pickImage } from '../camera.js';
import { processImageFile } from '../imageProcess.js';
import { addItem, uuid } from '../storage.js';
import { openMatchResults } from './matchView.js';
import { formalityFieldHtml, wireFormalityField } from './formalityField.js';
import { seasonFieldHtml } from './seasonField.js';
import { revokeBlobImagesOnLoad, showToast } from '../domUtil.js';
import { CATEGORIES, MAX_SUBCATEGORY_LENGTH, MAX_NOTES_LENGTH } from '../constants.js';
import { colorFamily } from '../colorMatch.js';

/**
 * Opens the capture overlay: picks an image, analyzes it, then lets the
 * user either save it to the wardrobe or use it once against existing items.
 */
export async function openCapture() {
  const file = await pickImage();
  if (!file) return;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="overlay-header">
      <button class="icon-btn" id="capture-close" aria-label="Close">✕</button>
      <h2>New Item</h2>
      <span style="width:34px"></span>
    </div>
    <div class="overlay-body">
      <div class="loading-row"><span class="spinner"></span> Analyzing photo…</div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#capture-close').addEventListener('click', () => overlay.remove());

  let analysis;
  try {
    analysis = await processImageFile(file);
  } catch (err) {
    overlay.querySelector('.overlay-body').innerHTML = `
      <div class="empty-state"><span class="empty-emoji" aria-hidden="true">⚠️</span>Couldn't read that photo. Try another one.</div>
    `;
    return;
  }

  renderForm(overlay, file, analysis);
}

function renderForm(overlay, file, analysis) {
  const thumbUrl = URL.createObjectURL(analysis.thumbnail);
  const body = overlay.querySelector('.overlay-body');

  body.innerHTML = `
    <div class="capture-preview"><img src="${thumbUrl}" alt="Captured item" /></div>
    <div class="detail-meta-row">
      <span class="pill">${analysis.pattern}</span>
      ${analysis.dominantColors
        .map(
          (c) =>
            `<span class="swatch" style="background:${c.hex}" title="${c.hex}" role="img" aria-label="${colorFamily(c.hex)} swatch, ${c.hex}"></span>`
        )
        .join('')}
    </div>

    <div class="field">
      <label for="cap-category">Category *</label>
      <select id="cap-category">
        <option value="" disabled selected>Choose a category…</option>
        ${CATEGORIES.map((c) => `<option value="${c}">${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label for="cap-subcategory">Sub-category (optional)</label>
      <input type="text" id="cap-subcategory" placeholder="e.g. t-shirt, sneakers" maxlength="${MAX_SUBCATEGORY_LENGTH}" />
    </div>

    ${formalityFieldHtml('cap', null)}
    ${seasonFieldHtml('cap', null)}

    <div class="field">
      <label for="cap-notes">Notes (optional)</label>
      <textarea id="cap-notes" placeholder="Anything worth remembering about this piece" maxlength="${MAX_NOTES_LENGTH}"></textarea>
    </div>

    <div id="cap-error" style="color:var(--danger);font-size:13px;margin-bottom:10px;display:none;">
      Pick a category first.
    </div>

    <div class="btn-row">
      <button class="btn btn-primary btn-block" id="cap-save">Save to wardrobe</button>
    </div>
    <div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-block" id="cap-use-once">Use once — find matches</button>
    </div>
  `;

  revokeBlobImagesOnLoad(body);

  const getCategory = () => body.querySelector('#cap-category').value;
  const showError = () => {
    body.querySelector('#cap-error').style.display = 'block';
  };

  wireFormalityField(body, 'cap', () => analysis.thumbnail, () => {});

  function buildItem() {
    return {
      category: getCategory(),
      subCategory: body.querySelector('#cap-subcategory').value.trim().slice(0, MAX_SUBCATEGORY_LENGTH),
      thumbnail: analysis.thumbnail,
      dominantColors: analysis.dominantColors,
      pattern: analysis.pattern,
      formality: body.querySelector('#cap-formality').value || null,
      season: body.querySelector('#cap-season').value || null,
      notes: body.querySelector('#cap-notes').value.trim().slice(0, MAX_NOTES_LENGTH),
    };
  }

  body.querySelector('#cap-save').addEventListener('click', async () => {
    if (!getCategory()) return showError();
    const item = {
      id: uuid(),
      createdAt: Date.now(),
      favorite: false,
      savedPermanently: true,
      ...buildItem(),
    };
    await addItem(item);
    document.dispatchEvent(new CustomEvent('fitted:wardrobe-changed'));
    overlay.remove();
    showToast('Saved to wardrobe');
  });

  body.querySelector('#cap-use-once').addEventListener('click', () => {
    if (!getCategory()) return showError();
    const transientItem = buildItem();
    overlay.remove();
    openMatchResults(transientItem);
  });
}
