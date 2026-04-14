import { navigate } from '../utils/router.js';
import { t } from '../utils/i18n.js';

export function renderLanding(container) {
  container.innerHTML = `
    <div class="landing">
      <nav class="landing__nav">
        <div class="landing__logo">ChoreoNote</div>
        <button class="btn btn--primary" id="landing-start-btn">${t('landingStart')}</button>
      </nav>

      <section class="landing__hero">
        <h1 class="landing__title">
          ${t('landingHero')}
        </h1>
        <p class="landing__subtitle">
          ${t('landingDesc1')}<br>
          ${t('landingDesc2')}
        </p>
        <button class="btn btn--primary landing__cta" id="landing-cta-btn">${t('landingCta')}</button>
        <p class="landing__note">${t('landingSubCta')}</p>
      </section>

      <section class="landing__demo">
        <canvas id="demo-canvas" class="demo-canvas"></canvas>
      </section>

      <section class="landing__features">
        <div class="feature-row">
          <div class="feature-row__icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          <div class="feature-row__text">
            <strong>${t('featureSync')}</strong>
            <span>${t('featureSyncDesc')}</span>
          </div>
        </div>
        <div class="feature-row">
          <div class="feature-row__icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
          </div>
          <div class="feature-row__text">
            <strong>${t('featureExport')}</strong>
            <span>${t('featureExportDesc')}</span>
          </div>
        </div>
        <div class="feature-row">
          <div class="feature-row__icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
          </div>
          <div class="feature-row__text">
            <strong>${t('featureLocal')}</strong>
            <span>${t('featureLocalDesc')}</span>
          </div>
        </div>
      </section>

      <section class="landing__how">
        <h2 class="landing__section-title">${t('howToUse')}</h2>
        <div class="steps">
          <div class="step">
            <div class="step__number">1</div>
            <div class="step__text">
              <strong>${t('howStep1Title')}</strong>
              <p>${t('howStep1Desc')}</p>
            </div>
          </div>
          <div class="step">
            <div class="step__number">2</div>
            <div class="step__text">
              <strong>${t('howStep2Title')}</strong>
              <p>${t('howStep2Desc')}</p>
            </div>
          </div>
          <div class="step">
            <div class="step__number">3</div>
            <div class="step__text">
              <strong>${t('howStep3Title')}</strong>
              <p>${t('howStep3Desc')}</p>
            </div>
          </div>
        </div>
      </section>

      <section class="landing__cta-section">
        <h2>${t('landingFinalCta')}</h2>
        <p>${t('landingFinalDesc')}</p>
        <button class="btn btn--primary landing__cta" id="landing-bottom-btn">${t('landingFinalBtn')}</button>
      </section>

      <footer class="landing__footer">
        <p>${t('landingFooter')}</p>
      </footer>
    </div>
  `;

  const goToDashboard = () => navigate('/dashboard');
  container.querySelector('#landing-start-btn').addEventListener('click', goToDashboard);
  container.querySelector('#landing-cta-btn').addEventListener('click', goToDashboard);
  container.querySelector('#landing-bottom-btn').addEventListener('click', goToDashboard);

  // --- Demo canvas animation ---
  const canvas = container.querySelector('#demo-canvas');
  const dpr = window.devicePixelRatio || 1;
  const W = 480, H = 320, WING = 40;
  canvas.width = (W + WING * 2) * dpr;
  canvas.height = (H + WING * 2) * dpr;
  canvas.style.width = '100%';
  canvas.style.maxWidth = (W + WING * 2) + 'px';
  canvas.style.height = 'auto';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const CW = W + WING * 2, CH = H + WING * 2;

  const dancers = [
    { name: 'A', color: '#4ECDC4' },
    { name: 'B', color: '#FF6B6B' },
    { name: 'C', color: '#FFE66D' },
    { name: 'D', color: '#A8E6CF' },
    { name: 'E', color: '#DDA0DD' },
    { name: 'F', color: '#87CEEB' },
  ];

  // Two formations to alternate between
  const formationA = [
    { x: -70, y: 20 }, { x: 0, y: -30 }, { x: 70, y: 20 },
    { x: -100, y: 80 }, { x: 0, y: 60 }, { x: 100, y: 80 },
  ];
  const formationB = [
    { x: -120, y: -60 }, { x: 0, y: -80 }, { x: 120, y: -60 },
    { x: -60, y: 30 }, { x: 0, y: 10 }, { x: 60, y: 30 },
  ];

  function drawPentagon(ctx, cx, cy, r) {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.95, cy - r * 0.2);
    ctx.lineTo(cx + r * 0.95, cy + r * 0.8);
    ctx.lineTo(cx - r * 0.95, cy + r * 0.8);
    ctx.lineTo(cx - r * 0.95, cy - r * 0.2);
    ctx.closePath();
  }

  function isLight(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  }

  function drawFrame(t) {
    // Ease in-out
    const raw = (Math.sin(t * Math.PI * 2 / 6000) + 1) / 2;
    const ease = raw < 0.5 ? 2 * raw * raw : 1 - 2 * (1 - raw) * (1 - raw);

    ctx.clearRect(0, 0, CW, CH);

    // Wing areas
    ctx.fillStyle = '#0a0a15';
    ctx.fillRect(0, 0, CW, CH);

    // Stage background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(WING, WING, W, H);

    // Stage dashed border
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(WING, WING, W, H);
    ctx.setLineDash([]);

    // Grid
    const gap = 30;
    const hw = W / 2, hh = H / 2;
    for (let x = hw % gap; x < W; x += gap) {
      const major = Math.round(Math.abs(x - hw) / gap) % 4 === 0;
      ctx.strokeStyle = major ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)';
      ctx.lineWidth = major ? 0.8 : 0.4;
      ctx.beginPath();
      ctx.moveTo(WING + x, WING);
      ctx.lineTo(WING + x, WING + H);
      ctx.stroke();
    }
    for (let y = hh % gap; y < H; y += gap) {
      const major = Math.round(Math.abs(y - hh) / gap) % 4 === 0;
      ctx.strokeStyle = major ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)';
      ctx.lineWidth = major ? 0.8 : 0.4;
      ctx.beginPath();
      ctx.moveTo(WING, WING + y);
      ctx.lineTo(WING + W, WING + y);
      ctx.stroke();
    }

    // Center cross
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(WING + hw, WING);
    ctx.lineTo(WING + hw, WING + H);
    ctx.moveTo(WING, WING + hh);
    ctx.lineTo(WING + W, WING + hh);
    ctx.stroke();

    // Audience seats (top)
    const seatW = 20, seatH = 14, seatGap = 5;
    const cols = Math.floor((W - seatGap) / (seatW + seatGap));
    const totalSeatW = cols * seatW + (cols - 1) * seatGap;
    const startX = WING + (W - totalSeatW) / 2;
    for (let r = 0; r < 2; r++) {
      const rowY = WING - 20 - seatH - r * (seatH + 4);
      ctx.fillStyle = r === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)';
      for (let c = 0; c < cols; c++) {
        ctx.fillRect(startX + c * (seatW + seatGap), rowY, seatW, seatH);
      }
    }

    // Dancers
    const ox = WING + hw, oy = WING + hh;
    const R = 12;
    for (let i = 0; i < dancers.length; i++) {
      const a = formationA[i], b = formationB[i];
      const x = ox + a.x + (b.x - a.x) * ease;
      const y = oy + a.y + (b.y - a.y) * ease;

      // Shadow
      ctx.beginPath();
      drawPentagon(ctx, x, y + 2, R);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();

      // Shape
      ctx.beginPath();
      drawPentagon(ctx, x, y, R);
      ctx.fillStyle = dancers[i].color;
      ctx.fill();

      // Name
      ctx.fillStyle = isLight(dancers[i].color) ? '#1a1a2e' : '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dancers[i].name, x, y + 2);
    }

    requestAnimationFrame(() => drawFrame(performance.now()));
  }
  requestAnimationFrame(() => drawFrame(performance.now()));
}
