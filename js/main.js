import * as wardrobeView from './ui/wardrobeView.js';
import * as suggestView from './ui/suggestView.js';
import * as aiChatView from './ui/aiChatView.js';
import { openCapture } from './ui/captureView.js';
import { VERSION } from './version.js';

const TABS = {
  wardrobe: { title: 'Wardrobe', view: wardrobeView },
  suggest: { title: 'Suggest', view: suggestView },
  ai: { title: 'AI', view: aiChatView },
};

const viewRoot = document.getElementById('view-root');
const topbarTitle = document.getElementById('topbar-title');
const navButtons = document.querySelectorAll('.nav-btn');
const fabCapture = document.getElementById('fab-capture');
const aiThinkingBadge = document.getElementById('ai-thinking-badge');

let currentTab = 'wardrobe';
let aiThinking = false;

// Shows a badge on the AI nav tab while it's waiting on a provider reply and
// the user has navigated elsewhere - the in-chat "Thinking…" bubble already
// covers the case where they're looking right at it.
function updateAiThinkingBadge() {
  aiThinkingBadge.hidden = !(aiThinking && currentTab !== 'ai');
}

document.addEventListener('fitted:ai-thinking', (e) => {
  aiThinking = e.detail.thinking;
  updateAiThinkingBadge();
});

async function renderTab(tab) {
  currentTab = tab;
  topbarTitle.textContent = TABS[tab].title;
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  fabCapture.style.display = tab === 'wardrobe' ? '' : 'none';
  updateAiThinkingBadge();
  try {
    await TABS[tab].view.render(viewRoot);
  } catch (err) {
    console.error(`Failed to render the ${tab} tab:`, err);
    viewRoot.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji" aria-hidden="true">⚠️</span>
        Something went wrong loading this tab. Try switching tabs or reloading the app.
      </div>
    `;
  }
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => renderTab(btn.dataset.tab));
});

document.getElementById('fab-capture').addEventListener('click', () => openCapture());

document.addEventListener('fitted:wardrobe-changed', () => {
  if (currentTab === 'wardrobe') renderTab('wardrobe');
});

document.addEventListener('fitted:switch-tab', (e) => {
  renderTab(e.detail.tab);
});

document.getElementById('app-version').textContent = VERSION;

renderTab('wardrobe');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline install is a nice-to-have; app still works without it.
    });
  });
}
