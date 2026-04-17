import { t } from '../utils/i18n.js';
import { showToast } from '../utils/toast.js';
import { renderFormationThumbnail } from '../utils/thumbnail.js';
import { PlaybackEngine } from '../engine/PlaybackEngine.js';
import { requireAuth } from '../utils/auth.js';
import { incrementDownload } from '../utils/market.js';
import { addToBasket, removeFromBasket } from '../utils/basket.js';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 마켓 preset 상세 모달 (애니메이션 미리보기 + 액션 버튼).
 * @param {Object} opts
 * @param {Object} opts.preset - market_presets row
 * @param {'bottom'|'top'} opts.viewAudience - 관객 방향
 * @param {'market'|'basket'} opts.mode - market: 바구니 추가 / basket: 바구니 제거
 * @param {() => void} [opts.onAction] - 액션 성공 후 콜백 (예: 바구니 재렌더)
 * @param {string} [opts.authRedirect='/market'] - 로그인 필요 시 리다이렉트 경로
 */
export function openPresetDetailModal({ preset, viewAudience = 'bottom', mode = 'market', onAction, authRedirect = '/market' }) {
  const pd = preset.preset_data;
  const overlay = document.createElement('div');
  overlay.className = 'market-modal';

  const tags = pd.tags || [];
  const srcAudience = pd.note.audienceDirection || 'bottom';
  const flip = viewAudience !== srcAudience;
  const stageWidth = pd.note.stageWidth || 600;
  const stageHeight = pd.note.stageHeight || 400;
  const dancerShape = pd.note.dancerShape || 'pentagon';
  const dancerScale = pd.note.dancerScale || 1.0;
  const showWings = false;

  const engineDancers = pd.dancers.map((d, i) => ({ id: i, name: d.name, color: d.color }));
  const engineFormations = pd.formations.map(f => ({
    startTime: f.startTime,
    duration: f.duration,
    positions: f.positions.map(p => ({
      dancerId: p.dancerIndex,
      x: flip ? -p.x : p.x,
      y: flip ? -p.y : p.y,
      angle: flip ? (p.angle || 0) + 180 : (p.angle || 0),
      waypoints: p.waypoints?.map(w => ({
        ...w,
        x: flip ? -w.x : w.x,
        y: flip ? -w.y : w.y,
      })),
    })),
  }));

  const isSingle = engineFormations.length <= 1;
  const previewDuration = engineFormations.length * 1000;
  const lastF = engineFormations[engineFormations.length - 1];
  const rawTotalMs = lastF ? lastF.startTime + lastF.duration : 0;
  if (!isSingle && rawTotalMs > 0) {
    const scale = previewDuration / rawTotalMs;
    for (const f of engineFormations) {
      f.startTime = f.startTime * scale;
      f.duration = f.duration * scale;
    }
  }
  const totalMs = isSingle ? 0 : previewDuration;

  const actionLabel = mode === 'basket' ? t('basketRemoveAction') : t('marketAddToBasket');
  const actionClass = mode === 'basket' ? 'btn--danger' : 'btn--primary';

  overlay.innerHTML = `
    <div class="market-modal__box market-modal__box--detail">
      <div class="market-modal__top">
        <div class="market-modal__header">
          <h2>${escapeHtml(preset.title)}</h2>
          <button class="market-modal__close">✕</button>
        </div>
        ${tags.length > 0 ? `<div class="market-card__tags" style="margin-bottom:8px">${tags.map(tag => `<span class="market-card__tag">${t('marketTag_' + tag)}</span>`).join('')}</div>` : ''}
        <div class="market-modal__meta">
          ${t('marketDancerCount', { count: preset.dancer_count })} · ${t('marketFormationCount', { count: preset.formation_count })} · ${t('marketDownloadCount', { count: preset.download_count || 0 })}
        </div>
      </div>
      <div class="market-modal__body">
        <div class="market-modal__player">
          <div class="market-modal__canvas-wrap">
            <canvas class="market-modal__canvas" data-player-canvas width="480" height="320"></canvas>
          </div>
          ${isSingle ? '' : `
          <div class="market-modal__timeline" data-timeline>
            <div class="market-modal__timeline-track"></div>
            ${engineFormations.map((f, i) => {
              const startPct = (f.startTime / totalMs) * 100;
              const widthPct = (f.duration / totalMs) * 100;
              return `<div class="market-modal__timeline-box" data-fidx="${i}" style="left:${startPct}%;width:${widthPct}%"></div>`;
            }).join('')}
            <div class="market-modal__playhead" data-playhead style="left:0%"></div>
          </div>
          <div class="market-modal__player-controls">
            <button class="market-modal__play-btn" data-play-btn title="${t('marketPlay')}" aria-label="${t('marketPlay')}">▶</button>
            <div class="market-modal__formation-chips">
              ${engineFormations.map((_, i) => `<button class="market-modal__chip" data-chip="${i}">${i + 1}</button>`).join('')}
            </div>
          </div>
          `}
        </div>
      </div>
      <div class="market-modal__bottom">
        <div class="market-modal__actions">
          <button class="btn ${actionClass}" id="modal-action-btn">${actionLabel}</button>
          <button class="btn btn--ghost" id="modal-cancel-btn">${t('cancel')}</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const canvas = overlay.querySelector('[data-player-canvas]');
  const engine = new PlaybackEngine();
  engine.duration = totalMs || 1;
  engine.setFormations(engineFormations, engineDancers);

  function drawFrame(positionsRaw) {
    const positions = positionsRaw.map((p, i) => ({ dancerId: i, x: p.x, y: p.y, angle: p.angle || 0 }));
    renderFormationThumbnail(canvas, {
      dancers: engineDancers, positions,
      stageWidth, stageHeight, dancerShape, dancerScale, showWings,
      hideOffstage: true,
      showAudience: viewAudience,
    });
  }

  engine.onPositionsUpdate = (positions) => drawFrame(positions);
  drawFrame(engine.calcPositionsAt(0));

  if (!isSingle) {
    const playBtn = overlay.querySelector('[data-play-btn]');
    const playhead = overlay.querySelector('[data-playhead]');
    const timeline = overlay.querySelector('[data-timeline]');
    const chips = overlay.querySelectorAll('.market-modal__chip');

    function setPlayIcon(playing, ended) {
      playBtn.textContent = playing ? '❚❚' : (ended ? '↻' : '▶');
      playBtn.title = playing ? t('marketPause') : (ended ? t('marketReplay') : t('marketPlay'));
      playBtn.setAttribute('aria-label', playBtn.title);
    }

    function updateChipsActive(ms) {
      let activeIdx = -1;
      for (let i = 0; i < engineFormations.length; i++) {
        const f = engineFormations[i];
        if (ms >= f.startTime && ms < f.startTime + f.duration) { activeIdx = i; break; }
      }
      chips.forEach((c, i) => c.classList.toggle('market-modal__chip--active', i === activeIdx));
    }

    engine.onTimeUpdate = (ms) => {
      const pct = Math.min(100, (ms / totalMs) * 100);
      playhead.style.left = `${pct}%`;
      updateChipsActive(ms);
    };
    engine.onPlaybackEnd = () => setPlayIcon(false, true);

    updateChipsActive(0);

    playBtn.addEventListener('click', () => {
      if (engine.isPlaying) {
        engine.pause();
        setPlayIcon(false, false);
      } else {
        if (engine.currentTime >= totalMs) engine.seek(0);
        engine.play();
        setPlayIcon(true, false);
      }
    });

    function seekFromEvent(e) {
      const rect = timeline.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      engine.seek(pct * totalMs);
      setPlayIcon(engine.isPlaying, false);
    }
    timeline.addEventListener('mousedown', (e) => {
      if (e.target.closest('[data-chip]')) return;
      seekFromEvent(e);
      const onMove = (ev) => seekFromEvent(ev);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const i = Number(chip.dataset.chip);
        engine.seek(engineFormations[i].startTime);
        setPlayIcon(engine.isPlaying, false);
      });
    });
  }

  const close = () => {
    engine.destroy();
    overlay.remove();
  };

  overlay.querySelector('.market-modal__close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#modal-action-btn').addEventListener('click', async () => {
    if (mode === 'basket') {
      try {
        await removeFromBasket(preset.id);
        close();
        showToast(t('basketRemoved'));
        if (onAction) onAction();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const user = await requireAuth(authRedirect);
    if (!user) return;
    try {
      const result = await addToBasket(preset.id);
      if (!result.duplicated) incrementDownload(preset.id);
      close();
      showToast(result.duplicated ? t('marketBasketDuplicated') : t('marketBasketAdded'));
      if (onAction) onAction();
    } catch (err) {
      showToast(err.message);
    }
  });
}
