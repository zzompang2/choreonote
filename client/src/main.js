import './style.css';
import { route, startRouter } from './utils/router.js';
import { renderLanding } from './pages/Landing.js';
import { renderDashboard } from './pages/Dashboard.js';
import { renderEditor } from './pages/Editor.js';

const app = document.querySelector('#app');

route('/', () => renderLanding(app));
route('/dashboard', () => renderDashboard(app));
route('/edit', (noteId) => renderEditor(app, noteId));

startRouter();
