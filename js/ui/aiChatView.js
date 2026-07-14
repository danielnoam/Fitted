import { getAllItems, getSetting, setSetting } from '../storage.js';
import { sendMessage, PROVIDERS, DEFAULT_PROVIDER } from '../ai/aiRouter.js';

const generalThread = { messages: [] };
const itemThreads = new Map(); // itemId -> { item, messages: [], imageSent: bool }

let focusedItemId = null;

export function openItemChat(item) {
  if (!itemThreads.has(item.id)) {
    itemThreads.set(item.id, { item, messages: [], imageSent: false });
  }
  focusedItemId = item.id;
  document.dispatchEvent(new CustomEvent('fitted:switch-tab', { detail: { tab: 'ai' } }));
}

export async function render(container) {
  const apiKey = await getSetting('aiApiKey');
  const provider = await getSetting('aiProvider', DEFAULT_PROVIDER);

  if (!apiKey) {
    renderSetup(container, provider);
    return;
  }

  renderChat(container, provider, apiKey);
}

function renderSetup(container, currentProvider) {
  container.innerHTML = `
    <div class="ai-setup">
      <p class="section-title">Connect an AI provider</p>
      <p>
        Optional. Add your own API key to unlock open-ended styling advice and
        wardrobe chat. The rest of Fitted works fully offline without this —
        your key never leaves your browser (stored in IndexedDB only).
      </p>
      <div class="field">
        <label for="ai-provider">Provider</label>
        <select id="ai-provider">
          ${Object.values(PROVIDERS)
            .map(
              (p) =>
                `<option value="${p.id}" ${p.id === currentProvider ? 'selected' : ''}>${p.label}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="field">
        <label for="ai-key">API key</label>
        <input type="password" id="ai-key" placeholder="Paste your API key" autocomplete="off" />
      </div>
      <button class="btn btn-primary btn-block" id="ai-save">Save & continue</button>
    </div>
  `;

  container.querySelector('#ai-save').addEventListener('click', async () => {
    const provider = container.querySelector('#ai-provider').value;
    const key = container.querySelector('#ai-key').value.trim();
    if (!key) return;
    await setSetting('aiProvider', provider);
    await setSetting('aiApiKey', key);
    render(container);
  });
}

function renderChat(container, provider, apiKey) {
  const focused = focusedItemId ? itemThreads.get(focusedItemId) : null;
  const thread = focused ? focused.messages : generalThread.messages;

  container.innerHTML = `
    <div class="chat-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <span class="pill">${PROVIDERS[provider]?.label ?? provider}</span>
      <div style="display:flex;gap:8px;">
        ${focused ? '<button class="btn" id="ai-back">← General chat</button>' : ''}
        <button class="btn" id="ai-change-key">Change key</button>
      </div>
    </div>
    ${focused ? itemContextHtml(focused.item) : ''}
    <div class="chat-thread" id="chat-thread">
      ${thread.length ? thread.map(chatBubbleHtml).join('') : emptyThreadHtml(focused)}
    </div>
    <div class="chat-input-bar">
      <textarea id="chat-input" rows="1" placeholder="${focused ? 'Ask about this item…' : 'Ask about your wardrobe…'}"></textarea>
      <button class="btn btn-primary" id="chat-send">Send</button>
    </div>
  `;

  const threadEl = container.querySelector('#chat-thread');
  threadEl.scrollTop = threadEl.scrollHeight;

  container.querySelector('#ai-change-key')?.addEventListener('click', async () => {
    renderSetup(container, provider);
  });

  container.querySelector('#ai-back')?.addEventListener('click', () => {
    focusedItemId = null;
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
    renderThreadOnly(container, thread, focused);

    try {
      const systemPrompt = await buildSystemPrompt(focused?.item);
      let image;
      if (focused && !focused.imageSent) {
        image = focused.item.thumbnail;
        focused.imageSent = true;
      }
      const reply = await sendMessage({ provider, apiKey, systemPrompt, messages: thread, image });
      thread.push({ role: 'assistant', content: reply });
    } catch (err) {
      thread.push({ role: 'assistant', content: err.message || 'Something went wrong.', isError: true });
    }

    renderThreadOnly(container, thread, focused);
    input.disabled = false;
    container.querySelector('#chat-send').disabled = false;
    input.focus();
  };

  container.querySelector('#chat-send').addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
}

function renderThreadOnly(container, thread, focused) {
  const threadEl = container.querySelector('#chat-thread');
  threadEl.innerHTML = thread.length ? thread.map(chatBubbleHtml).join('') : emptyThreadHtml(focused);
  threadEl.scrollTop = threadEl.scrollHeight;
}

function itemContextHtml(item) {
  const thumbUrl = URL.createObjectURL(item.thumbnail);
  return `
    <div class="chat-item-context">
      <img src="${thumbUrl}" alt="${item.category}" />
      <span>Asking about your ${item.subCategory || item.category}</span>
    </div>
  `;
}

function emptyThreadHtml(focused) {
  return `<div class="empty-state" style="padding:30px 10px;">
    ${focused ? 'Ask anything about this piece — styling ideas, care tips, what to pair it with.' : 'Ask what to wear, what you\'re missing, or how to organize your wardrobe.'}
  </div>`;
}

function chatBubbleHtml(msg) {
  const cls = msg.isError ? 'error' : msg.role;
  return `<div class="chat-bubble ${cls}">${escapeHtml(msg.content)}</div>`;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function buildSystemPrompt(focusedItem) {
  const items = await getAllItems();
  const summary = items
    .map((i) => {
      const colors = (i.dominantColors || []).map((c) => c.hex).join(',');
      const bits = [i.category, i.subCategory, colors, i.pattern].filter(Boolean).join(' | ');
      return `- ${bits}${i.notes ? ` | notes: ${i.notes}` : ''}`;
    })
    .join('\n');

  const base = `You are a helpful wardrobe styling assistant inside a personal app called Fitted. The user's wardrobe (${items.length} items):\n${summary || '(empty)'}\n\nGive concise, practical styling advice. Reference specific items from the list when relevant.`;

  if (focusedItem) {
    return `${base}\n\nThe user is asking specifically about this item: ${focusedItem.category}${focusedItem.subCategory ? ' (' + focusedItem.subCategory + ')' : ''}, colors ${focusedItem.dominantColors.map((c) => c.hex).join(',')}, ${focusedItem.pattern}. An image of it is attached to their first message.`;
  }
  return base;
}
