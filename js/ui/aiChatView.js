import { getAllItems, updateItem, deleteItem, addItem } from '../storage.js';
import { sendMessageWithFallback, getAiConfig, setAiConfig, hasPrimaryKey, PROVIDERS, DEFAULT_PROVIDER } from '../ai/aiRouter.js';
import { escapeHtml, revokeBlobImagesOnLoad, showUndoToast } from '../domUtil.js';
import { CATEGORIES, PATTERNS, MAX_SUBCATEGORY_LENGTH, MAX_NOTES_LENGTH } from '../constants.js';
import { formatRelativeDate } from '../dateUtil.js';

/** Dispatched whenever the AI tab starts/stops waiting on a provider reply,
 * so main.js can badge the nav tab if the user has navigated away. */
function setAiThinking(thinking) {
  document.dispatchEvent(new CustomEvent('fitted:ai-thinking', { detail: { thinking } }));
}

/**
 * Dispatched whenever a thread's messages or the cleanup scan's results
 * change in the background - main.js re-renders the AI tab if it's still
 * the active one. Without this, returning to the AI tab *while* a reply or
 * scan is still in flight would show a stale render with no pending
 * indicator (the "Thinking…" bubble only existed in the original render's
 * closure), and the eventual result would land in a DOM node that render
 * had already replaced - invisible until leaving and coming back once more.
 */
function notifyAiContentUpdated() {
  document.dispatchEvent(new CustomEvent('fitted:ai-content-updated'));
}

const FIXABLE_FIELDS = ['category', 'subCategory', 'pattern', 'notes'];

// Quick actions: canned prompts a tap sends straight into general chat, so
// getting a useful answer doesn't depend on knowing what to type. Shown
// only in the empty general-chat state (not per-item chat, and not once a
// conversation is already underway).
const QUICK_ACTION_PROMPTS = {
  missing: 'Looking at my whole wardrobe, what key pieces or categories seem to be missing that would round it out? Keep it to at most 3-4 concise, specific suggestions.',
  unworn: "Based on the wardrobe list above (including last-worn info), which items haven't been worn in a while and could use more rotation? Keep it brief - call out a handful of specific items, not a generic answer.",
};

const generalThread = { messages: [], pending: false };
const itemThreads = new Map(); // itemId -> { item, messages: [], imageSent: bool, pending: bool }

let focusedItemId = null;
let cleanupMode = false;
let cleanupPending = false;
let lastCleanupSuggestions = null; // cached so revisiting the tab doesn't re-call the API
let lastCleanupItems = null;
let lastCleanupError = null;

export function openItemChat(item) {
  if (!itemThreads.has(item.id)) {
    itemThreads.set(item.id, { item, messages: [], imageSent: false, pending: false });
  }
  focusedItemId = item.id;
  cleanupMode = false;
  document.dispatchEvent(new CustomEvent('fitted:switch-tab', { detail: { tab: 'ai' } }));
}

export async function render(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;
  const config = await getAiConfig();

  if (!hasPrimaryKey(config)) {
    renderSettings(container, config);
    return;
  }

  if (cleanupMode) {
    renderCleanup(container, config);
    return;
  }

  renderChat(container, config);
}

function providerOptionsHtml(selected, excludeId) {
  return Object.values(PROVIDERS)
    .filter((p) => p.id !== excludeId)
    .map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.label}</option>`)
    .join('');
}

function renderSettings(container, config) {
  const primary = config?.primary ?? { provider: DEFAULT_PROVIDER, apiKey: '' };
  const fallback = config?.fallback ?? null;

  container.innerHTML = `
    <div class="ai-setup">
      <p class="section-title">AI provider</p>
      <p>
        Optional. Add your own API key to unlock open-ended styling advice and
        wardrobe chat. The rest of Fitted works fully offline without this —
        keys never leave your browser (stored in IndexedDB only).
      </p>
      <div class="field">
        <label for="ai-provider-primary">Primary provider</label>
        <select id="ai-provider-primary">${providerOptionsHtml(primary.provider)}</select>
      </div>
      <div class="field">
        <label for="ai-key-primary">Primary API key</label>
        <input type="password" id="ai-key-primary" placeholder="Paste your API key" autocomplete="off" value="${escapeHtml(primary.apiKey || '')}" />
      </div>
      <div class="field">
        <label for="ai-provider-fallback">Fallback provider (optional)</label>
        <select id="ai-provider-fallback">
          <option value="">None</option>
          ${providerOptionsHtml(fallback?.provider ?? '', primary.provider)}
        </select>
      </div>
      <div class="field" id="ai-fallback-key-field" style="${fallback ? '' : 'display:none;'}">
        <label for="ai-key-fallback">Fallback API key</label>
        <input type="password" id="ai-key-fallback" placeholder="Paste your API key" autocomplete="off" value="${escapeHtml(fallback?.apiKey || '')}" />
      </div>
      <p style="font-size:12px;color:var(--text-dim);margin:-4px 0 14px;">
        If the primary provider errors out or returns nothing, Fitted automatically retries with the fallback.
      </p>
      <button class="btn btn-primary btn-block" id="ai-save">Save & continue</button>
      ${hasPrimaryKey(config) ? '<button class="btn btn-block" id="ai-cancel" style="margin-top:10px;">Cancel</button>' : ''}
    </div>
  `;

  const primarySelect = container.querySelector('#ai-provider-primary');
  const fallbackSelect = container.querySelector('#ai-provider-fallback');
  const fallbackKeyField = container.querySelector('#ai-fallback-key-field');

  primarySelect.addEventListener('change', () => {
    const keep = fallbackSelect.value !== primarySelect.value ? fallbackSelect.value : '';
    fallbackSelect.innerHTML = `<option value="">None</option>${providerOptionsHtml(keep, primarySelect.value)}`;
    fallbackKeyField.style.display = fallbackSelect.value ? '' : 'none';
  });

  fallbackSelect.addEventListener('change', () => {
    fallbackKeyField.style.display = fallbackSelect.value ? '' : 'none';
  });

  container.querySelector('#ai-save').addEventListener('click', async () => {
    const primaryProvider = primarySelect.value;
    const primaryKey = container.querySelector('#ai-key-primary').value.trim();
    if (!primaryKey) return;

    const fallbackProvider = fallbackSelect.value;
    const fallbackKey = container.querySelector('#ai-key-fallback').value.trim();

    await setAiConfig({
      primary: { provider: primaryProvider, apiKey: primaryKey },
      fallback: fallbackProvider && fallbackKey ? { provider: fallbackProvider, apiKey: fallbackKey } : null,
    });
    render(container);
  });

  container.querySelector('#ai-cancel')?.addEventListener('click', () => render(container));
}

function renderChat(container, config) {
  const focused = focusedItemId ? itemThreads.get(focusedItemId) : null;
  const threadObj = focused || generalThread;
  const thread = threadObj.messages;
  const pending = threadObj.pending;

  container.innerHTML = `
    <div class="chat-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <button class="btn" id="ai-settings">${PROVIDERS[config.primary.provider]?.label ?? config.primary.provider}</button>
      <div style="display:flex;gap:8px;">
        ${focused ? '<button class="btn" id="ai-back">← General chat</button>' : '<button class="btn" id="ai-cleanup">🧹 Find data mistakes</button>'}
      </div>
    </div>
    ${focused ? itemContextHtml(focused.item) : ''}
    <div class="chat-thread" id="chat-thread">
      ${thread.length || pending ? thread.map(chatBubbleHtml).join('') + (pending ? pendingBubbleHtml() : '') : emptyThreadHtml(focused)}
    </div>
    <div class="chat-input-bar">
      <textarea id="chat-input" rows="1" placeholder="${focused ? 'Ask about this item…' : 'Ask about your wardrobe…'}" ${pending ? 'disabled' : ''}></textarea>
      <button class="btn btn-primary" id="chat-send" ${pending ? 'disabled' : ''}>Send</button>
    </div>
  `;

  const threadEl = container.querySelector('#chat-thread');
  threadEl.scrollTop = threadEl.scrollHeight;
  revokeBlobImagesOnLoad(container);

  container.querySelector('#ai-settings')?.addEventListener('click', () => {
    renderSettings(container, config);
  });

  container.querySelector('#ai-back')?.addEventListener('click', () => {
    focusedItemId = null;
    render(container);
  });

  container.querySelector('#ai-cleanup')?.addEventListener('click', () => {
    cleanupMode = true;
    render(container);
  });

  const input = container.querySelector('#chat-input');
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;
    container.querySelector('#chat-send').disabled = true;

    thread.push({ role: 'user', content: text });
    threadObj.pending = true;
    renderThreadOnly(container, thread, focused, true);
    notifyAiContentUpdated();

    setAiThinking(true);
    try {
      const systemPrompt = await buildSystemPrompt(focused?.item);
      let image;
      if (focused && !focused.imageSent) {
        image = focused.item.thumbnail;
        focused.imageSent = true;
      }
      const reply = await sendMessageWithFallback({ config, systemPrompt, messages: thread, image });
      thread.push({ role: 'assistant', content: reply });
    } catch (err) {
      thread.push({ role: 'assistant', content: err.message || 'Something went wrong.', isError: true });
    }
    setAiThinking(false);
    threadObj.pending = false;
    notifyAiContentUpdated();

    // The user may have navigated away (and possibly back to a different
    // thread, which re-renders fresh from threadObj/pending above) while
    // the reply was in flight, detaching this render's DOM - only touch it
    // if it's still the live one.
    if (document.body.contains(input)) {
      renderThreadOnly(container, thread, focused);
      input.disabled = false;
      container.querySelector('#chat-send').disabled = false;
      input.focus();
    }
  };

  container.querySelector('#chat-send').addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  container.querySelectorAll('#ai-quick-actions .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = QUICK_ACTION_PROMPTS[chip.dataset.quick] || '';
      send();
    });
  });
}

function renderThreadOnly(container, thread, focused, pending = false) {
  const threadEl = container.querySelector('#chat-thread');
  if (!threadEl) return;
  const bubbles = thread.map(chatBubbleHtml).join('');
  threadEl.innerHTML = thread.length || pending ? bubbles + (pending ? pendingBubbleHtml() : '') : emptyThreadHtml(focused);
  threadEl.scrollTop = threadEl.scrollHeight;
}

function pendingBubbleHtml() {
  return `<div class="chat-bubble assistant pending"><span class="spinner"></span> Thinking…</div>`;
}

function itemContextHtml(item) {
  const thumbUrl = URL.createObjectURL(item.thumbnail);
  return `
    <div class="chat-item-context">
      <img src="${thumbUrl}" alt="${item.category}" />
      <span>Asking about your ${escapeHtml(item.subCategory || item.category)}</span>
    </div>
  `;
}

function emptyThreadHtml(focused) {
  if (focused) {
    return `<div class="empty-state" style="padding:30px 10px;">
      <span class="empty-emoji" aria-hidden="true">💬</span>
      Ask anything about this piece — styling ideas, care tips, what to pair it with.
    </div>`;
  }
  return `<div class="empty-state" style="padding:30px 10px;">
    <span class="empty-emoji" aria-hidden="true">💬</span>
    Ask what to wear, what you're missing, or how to organize your wardrobe.
    <div class="chip-row" id="ai-quick-actions" style="justify-content:center;margin-top:14px;">
      <button type="button" class="chip" data-quick="missing">🕳️ What am I missing?</button>
      <button type="button" class="chip" data-quick="unworn">🧺 What haven't I worn?</button>
    </div>
  </div>`;
}

function chatBubbleHtml(msg) {
  const cls = msg.isError ? 'error' : msg.role;
  return `<div class="chat-bubble ${cls}">${renderInlineMarkdown(msg.content)}</div>`;
}

// Minimal inline markdown -> HTML for chat replies: bold, italic, inline
// code. Escapes first so nothing in the source text can inject markup.
function renderInlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  return html;
}

async function buildSystemPrompt(focusedItem) {
  const items = await getAllItems();
  const summary = items
    .map((i) => {
      const colors = (i.dominantColors || []).map((c) => c.hex).join(',');
      const bits = [i.category, i.subCategory, colors, i.pattern].filter(Boolean).join(' | ');
      const lastWorn = i.lastWorn ? `last worn: ${formatRelativeDate(i.lastWorn)}` : 'never logged as worn';
      return `- ${bits} | ${lastWorn}${i.notes ? ` | notes: ${i.notes}` : ''}`;
    })
    .join('\n');

  const base = `You are a helpful wardrobe styling assistant inside a personal app called Fitted. The user's wardrobe (${items.length} items):\n${summary || '(empty)'}\n\nGive concise, practical styling advice. Reference specific items from the list when relevant.`;

  if (focusedItem) {
    return `${base}\n\nThe user is asking specifically about this item: ${focusedItem.category}${focusedItem.subCategory ? ' (' + focusedItem.subCategory + ')' : ''}, colors ${focusedItem.dominantColors.map((c) => c.hex).join(',')}, ${focusedItem.pattern}. An image of it is attached to their first message.`;
  }
  return base;
}

// ---------- Wardrobe cleanup ----------

async function renderCleanup(container, config) {
  container.innerHTML = `
    <div class="chat-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <span class="pill">${PROVIDERS[config.primary.provider]?.label ?? config.primary.provider}</span>
      <button class="btn" id="cleanup-back">← Back to chat</button>
    </div>
    <p class="section-title">Find data mistakes</p>
    <p style="color:var(--text-dim);font-size:13px;margin-top:-6px;">
      Checks the category, colors, pattern, and notes you've recorded for each
      item against each other (it can't re-look at the photos) and flags likely
      typos or duplicate entries. Nothing changes until you tap Apply.
    </p>
    <div class="btn-row cleanup-btn-row">
      <button class="btn btn-primary btn-block" id="cleanup-scan" ${cleanupPending ? 'disabled' : ''}>${lastCleanupSuggestions ? 'Re-scan wardrobe' : 'Scan wardrobe'}</button>
    </div>
    <div id="cleanup-result"></div>
  `;

  container.querySelector('#cleanup-back').addEventListener('click', () => {
    cleanupMode = false;
    render(container);
  });

  container.querySelector('#cleanup-scan').addEventListener('click', () => runCleanupScan(container, config));

  const resultEl = container.querySelector('#cleanup-result');
  if (cleanupPending) {
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Reviewing your wardrobe…</div>`;
  } else if (lastCleanupError) {
    resultEl.innerHTML = `<div class="chat-bubble error">${escapeHtml(lastCleanupError)}</div>`;
  } else if (lastCleanupSuggestions) {
    renderSuggestions(resultEl, lastCleanupSuggestions, lastCleanupItems);
  }
}

async function runCleanupScan(container, config) {
  const resultEl = container.querySelector('#cleanup-result');
  resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Reviewing your wardrobe…</div>`;

  const items = await getAllItems();
  if (!items.length) {
    resultEl.innerHTML = `<div class="empty-state"><span class="empty-emoji" aria-hidden="true">🧺</span>Add a few items first — nothing to review yet.</div>`;
    return;
  }

  const prompt = buildCleanupPrompt(items);

  cleanupPending = true;
  lastCleanupError = null;
  setAiThinking(true);
  notifyAiContentUpdated();
  try {
    const reply = await sendMessageWithFallback({ config, messages: [{ role: 'user', content: prompt }] });
    lastCleanupSuggestions = parseSuggestions(reply);
    lastCleanupItems = items;
  } catch (err) {
    lastCleanupError = err.message || 'Something went wrong.';
  }
  setAiThinking(false);
  cleanupPending = false;
  notifyAiContentUpdated();

  // Best-effort immediate feedback if the user is still looking at this
  // exact render; if they navigated away and back, notifyAiContentUpdated()
  // above already triggered a fresh renderCleanup() that reads the same
  // module state this just set.
  if (document.body.contains(resultEl)) {
    if (lastCleanupError) {
      resultEl.innerHTML = `<div class="chat-bubble error">${escapeHtml(lastCleanupError)}</div>`;
    } else {
      renderSuggestions(resultEl, lastCleanupSuggestions, lastCleanupItems);
    }
  }
}

function buildCleanupPrompt(items) {
  const lines = items
    .map((item, i) => {
      const colors = (item.dominantColors || []).map((c) => c.hex).join(',') || '(none)';
      return `${i + 1}. category=${item.category} | subCategory=${item.subCategory || '(none)'} | colors=${colors} | pattern=${item.pattern} | notes=${item.notes || '(none)'}`;
    })
    .join('\n');

  return `You are auditing a wardrobe app's saved item data for data-entry mistakes. You cannot see the photos, only this text. Wardrobe items, numbered:
${lines}

Look only for things the text itself supports, such as:
- a subCategory that clearly belongs under a different category (e.g. subCategory "sneakers" filed under category "accessory")
- likely duplicate entries (same category and subCategory, near-identical colors)
- notes that contradict the recorded pattern (e.g. notes mention "striped" but pattern is "solid")
Do not guess at colors or patterns you have no textual evidence for.

Respond with ONLY a JSON array, no prose, no markdown code fences. Each element must be one of these two shapes:
{"type":"field-fix","item":<item number>,"field":"category"|"subCategory"|"pattern"|"notes","issue":"<short reason, under 15 words>","suggestedValue":"<new value>"}
{"type":"duplicate","itemA":<item number>,"itemB":<item number>,"issue":"<short reason, under 15 words>"}
If nothing looks wrong, respond with exactly [].`;
}

function parseSuggestions(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isValidFieldFix(s) {
  if (!FIXABLE_FIELDS.includes(s.field)) return false;
  if (typeof s.suggestedValue !== 'string' || !s.suggestedValue.trim()) return false;
  if (s.field === 'category' && !CATEGORIES.includes(s.suggestedValue)) return false;
  if (s.field === 'pattern' && !PATTERNS.includes(s.suggestedValue)) return false;
  if (s.field === 'subCategory' && s.suggestedValue.length > MAX_SUBCATEGORY_LENGTH) return false;
  if (s.field === 'notes' && s.suggestedValue.length > MAX_NOTES_LENGTH) return false;
  return true;
}

function renderSuggestions(el, suggestions, items) {
  if (!suggestions.length) {
    el.innerHTML = `<div class="empty-state"><span class="empty-emoji" aria-hidden="true">✨</span>Nothing stood out — your wardrobe data looks clean.</div>`;
    return;
  }

  el.innerHTML = `<div class="suggestion-list">${suggestions
    .map((s, i) => suggestionCardHtml(s, items, i))
    .join('')}</div>`;
  revokeBlobImagesOnLoad(el);

  suggestions.forEach((s, i) => {
    const card = el.querySelector(`[data-suggestion="${i}"]`);
    if (!card) return;

    card.querySelector('.suggestion-dismiss')?.addEventListener('click', () => {
      card.remove();
    });

    if (s.type === 'field-fix' && isValidFieldFix(s)) {
      card.querySelector('.suggestion-apply')?.addEventListener('click', async () => {
        const item = items[s.item - 1];
        if (!item) return;
        item[s.field] = s.suggestedValue;
        await updateItem(item);
        document.dispatchEvent(new CustomEvent('fitted:wardrobe-changed'));
        markApplied(card);
      });
    } else if (s.type === 'duplicate') {
      card.querySelectorAll('.suggestion-delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const item = items[Number(btn.dataset.itemIndex) - 1];
          if (!item) return;
          await deleteItem(item.id);
          document.dispatchEvent(new CustomEvent('fitted:wardrobe-changed'));
          markApplied(card);
          showUndoToast('Item deleted', async () => {
            await addItem(item);
            document.dispatchEvent(new CustomEvent('fitted:wardrobe-changed'));
          });
        });
      });
    }
  });
}

function markApplied(card) {
  card.classList.add('applied');
  card.querySelectorAll('button').forEach((b) => (b.disabled = true));
}

function miniItemHtml(item) {
  if (!item) return `<div class="suggestion-mini-item">(item not found)</div>`;
  const thumbUrl = URL.createObjectURL(item.thumbnail);
  return `
    <div class="suggestion-mini-item">
      <img src="${thumbUrl}" alt="${item.category}" />
      <span>${escapeHtml(item.category)}${item.subCategory ? ' · ' + escapeHtml(item.subCategory) : ''}</span>
    </div>
  `;
}

function suggestionCardHtml(s, items, i) {
  if (s.type === 'duplicate') {
    const itemA = items[s.itemA - 1];
    const itemB = items[s.itemB - 1];
    return `
      <div class="suggestion-card" data-suggestion="${i}">
        <div class="suggestion-item-row">${miniItemHtml(itemA)}${miniItemHtml(itemB)}</div>
        <p class="suggestion-issue">${escapeHtml(s.issue || 'These look like duplicates.')}</p>
        <div class="btn-row">
          ${itemA ? `<button class="btn suggestion-delete" data-item-index="${s.itemA}">Delete first</button>` : ''}
          ${itemB ? `<button class="btn suggestion-delete" data-item-index="${s.itemB}">Delete second</button>` : ''}
          <button class="btn suggestion-dismiss">Keep both</button>
        </div>
      </div>
    `;
  }

  const item = items[s.item - 1];
  const valid = isValidFieldFix(s);
  const currentValue = item ? item[s.field] || '(empty)' : '';

  return `
    <div class="suggestion-card" data-suggestion="${i}">
      <div class="suggestion-item-row">${miniItemHtml(item)}</div>
      <p class="suggestion-issue">${escapeHtml(s.issue || '')}</p>
      ${
        valid
          ? `<p class="suggestion-change">${escapeHtml(s.field)}: <strong>${escapeHtml(currentValue)}</strong> → <strong>${escapeHtml(s.suggestedValue)}</strong></p>
             <div class="btn-row">
               <button class="btn btn-primary suggestion-apply">Apply</button>
               <button class="btn suggestion-dismiss">Dismiss</button>
             </div>`
          : `<p class="suggestion-change">Flagged for your review — couldn't apply automatically.</p>
             <div class="btn-row"><button class="btn suggestion-dismiss">Dismiss</button></div>`
      }
    </div>
  `;
}
