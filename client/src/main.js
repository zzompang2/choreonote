import './style.css';
import { route, startRouter } from './utils/router.js';
import { initTheme } from './utils/theme.js';
import { renderLanding } from './pages/Landing.js';
import { renderDashboard } from './pages/Dashboard.js';
import { renderEditor } from './pages/Editor.js';
import { renderViewer } from './pages/Viewer.js';
import { registerSW } from 'virtual:pwa-register';
import { initChatBot } from './components/ChatBot.js';

initTheme();

const app = document.querySelector('#app');

route('/', () => renderLanding(app));
route('/dashboard', () => renderDashboard(app));
route('/edit', (noteId) => renderEditor(app, noteId));
route('/share', (shareId) => renderViewer(app, shareId));

startRouter();
initChatBot();

// PWA: 새 버전 감지 시 업데이트 알림
const updateSW = registerSW({
  onNeedRefresh() {
    const banner = document.createElement('div');
    banner.className = 'pwa-update-banner';
    banner.innerHTML = `
      <span>새 버전이 있습니다</span>
      <button class="pwa-update-btn">업데이트</button>
      <button class="pwa-dismiss-btn">닫기</button>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('pwa-update-banner--visible'));

    banner.querySelector('.pwa-update-btn').addEventListener('click', () => {
      updateSW(true);
    });
    banner.querySelector('.pwa-dismiss-btn').addEventListener('click', () => {
      banner.classList.remove('pwa-update-banner--visible');
      setTimeout(() => banner.remove(), 300);
    });
  },
});
