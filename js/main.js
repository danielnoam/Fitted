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

let currentTab = 'wardrobe';

async function renderTab(tab) {
  currentTab = tab;
  topbarTitle.textContent = TABS[tab].title;
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  await TABS[tab].view.render(viewRoot);
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
