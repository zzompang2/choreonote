import './style.css';
import { route, startRouter } from './utils/router.js';
import { initTheme } from './utils/theme.js';
import { renderLanding } from './pages/Landing.js';
import { renderDashboard } from './pages/Dashboard.js';
import { renderEditor } from './pages/Editor.js';
import { renderViewer } from './pages/Viewer.js';
import { renderMarket } from './pages/Market.js';
import { renderTrash } from './pages/Trash.js';
import { registerSW } from 'virtual:pwa-register';
import { initChatBot } from './components/ChatBot.js';
import { supabase } from './store/supabase.js';
import { initAuthHandler } from './utils/auth.js';

initTheme();

// OAuth PKCE 리다이렉트 후 세션 복원 + 전역 auth 핸들러 등록
initAuthHandler();
supabase.auth.getSession();

const app = document.querySelector('#app');

route('/', () => renderLanding(app));
route('/dashboard', () => renderDashboard(app));
route('/edit', (noteId) => renderEditor(app, noteId));
route('/share', (shareId) => renderViewer(app, shareId));
route('/market', () => renderMarket(app));
route('/trash', () => renderTrash(app));

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
