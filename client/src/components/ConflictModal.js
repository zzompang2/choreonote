import { t } from '../utils/i18n.js';
import { summarizeNote } from '../utils/cloudSync.js';

/**
 * 충돌 해결 모달
 * @param {Object} options
 * @param {Object} options.serverNote - 서버 노트 (note_json, updated_at)
 * @param {Object} options.localNoteJson - 로컬 exportJSON 파싱 결과
 * @param {Date} options.localEditedAt - 로컬 수정 시각
 * @returns {Promise<'overwrite'|'use-server'|'keep-both'|'cancel'>}
 */
export function showConflictModal({ serverNote, localNoteJson, localEditedAt }) {
  return new Promise((resolve) => {
    const serverSummary = summarizeNote(serverNote.note_json);
    const localSummary = summarizeNote(localNoteJson);

    const serverTime = formatDateTime(new Date(serverNote.updated_at));
    const localTime = formatDateTime(localEditedAt);

    const overlay = document.createElement('div');
    overlay.className = 'conflict-modal';
    overlay.innerHTML = `
      <div class="conflict-modal__box">
        <h3 class="conflict-modal__title">${t('conflictTitle')}</h3>
        <div class="conflict-modal__compare">
          <div class="conflict-modal__version">
            <span class="conflict-modal__label">${t('conflictServer')}</span>
            <span class="conflict-modal__time">${serverTime}</span>
            <span class="conflict-modal__info">${t('marketDancerCount', { count: serverSummary.dancerCount })} · ${t('marketFormationCount', { count: serverSummary.formationCount })}</span>
          </div>
          <div class="conflict-modal__version">
            <span class="conflict-modal__label">${t('conflictLocal')}</span>
            <span class="conflict-modal__time">${localTime}</span>
            <span class="conflict-modal__info">${t('marketDancerCount', { count: localSummary.dancerCount })} · ${t('marketFormationCount', { count: localSummary.formationCount })}</span>
          </div>
        </div>
        <div class="conflict-modal__actions">
          <button class="conflict-modal__btn" data-action="overwrite">
            <strong>${t('conflictOverwrite')}</strong>
            <span>${t('conflictOverwriteDesc')}</span>
          </button>
          <button class="conflict-modal__btn" data-action="use-server">
            <strong>${t('conflictUseServer')}</strong>
            <span>${t('conflictUseServerDesc')}</span>
          </button>
          <button class="conflict-modal__btn" data-action="keep-both">
            <strong>${t('conflictKeepBoth')}</strong>
            <span>${t('conflictKeepBothDesc')}</span>
          </button>
        </div>
        <button class="btn btn--ghost conflict-modal__cancel">${t('cancel')}</button>
      </div>
    `;

    const cleanup = () => overlay.remove();

    overlay.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        cleanup();
        resolve(btn.dataset.action);
      });
    });

    overlay.querySelector('.conflict-modal__cancel').addEventListener('click', () => {
      cleanup();
      resolve('cancel');
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve('cancel');
      }
    });

    document.body.appendChild(overlay);
  });
}

function formatDateTime(date) {
  const d = new Date(date);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${h}:${min}`;
}
