import { navigate } from '../utils/router.js';

export function renderLanding(container) {
  container.innerHTML = `
    <div class="landing">
      <nav class="landing__nav">
        <div class="landing__logo">ChoreoNote</div>
        <button class="btn btn--primary" id="landing-start-btn">시작하기</button>
      </nav>

      <section class="landing__hero">
        <h1 class="landing__title">
          당신의 멋진 무대를<br>미리 만나보세요
        </h1>
        <p class="landing__subtitle">
          음악에 맞춰 대형이 움직이는 걸 눈으로 확인하세요.<br>
          종이 위의 상상이 아닌, 실시간 애니메이션으로.
        </p>
        <button class="btn btn--primary landing__cta" id="landing-cta-btn">무료로 시작하기</button>
        <p class="landing__note">설치 없음 · 로그인 없음 · 브라우저에서 바로 시작</p>
      </section>

      <section class="landing__features">
        <div class="feature-card">
          <div class="feature-card__icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          <h3 class="feature-card__title">음악 동기화</h3>
          <p class="feature-card__desc">음악을 올리고 대형을 배치하면, 비트에 맞춰 댄서들이 움직입니다.</p>
        </div>
        <div class="feature-card">
          <div class="feature-card__icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
          </div>
          <h3 class="feature-card__title">영상 내보내기</h3>
          <p class="feature-card__desc">완성된 안무를 영상으로 저장해서 카카오톡으로 바로 공유하세요.</p>
        </div>
        <div class="feature-card">
          <div class="feature-card__icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
          </div>
          <h3 class="feature-card__title">내 브라우저에 저장</h3>
          <p class="feature-card__desc">서버에 데이터를 보내지 않습니다. 모든 작업은 내 브라우저에만 저장됩니다.</p>
        </div>
      </section>

      <section class="landing__how">
        <h2 class="landing__section-title">이렇게 사용하세요</h2>
        <div class="steps">
          <div class="step">
            <div class="step__number">1</div>
            <div class="step__text">
              <strong>대형을 만드세요</strong>
              <p>무대 위에 댄서를 배치하고, 타임라인에 대형을 추가하세요.</p>
            </div>
          </div>
          <div class="step">
            <div class="step__number">2</div>
            <div class="step__text">
              <strong>재생해서 확인하세요</strong>
              <p>음악에 맞춰 댄서들이 대형 사이를 이동하는 모습을 확인하세요.</p>
            </div>
          </div>
          <div class="step">
            <div class="step__number">3</div>
            <div class="step__text">
              <strong>영상으로 공유하세요</strong>
              <p>영상 버튼 하나로 MP4를 만들어 팀에 바로 전달하세요.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="landing__cta-section">
        <h2>지금 바로 시작하세요</h2>
        <p>가입도, 설치도 필요 없습니다.</p>
        <button class="btn btn--primary landing__cta" id="landing-bottom-btn">안무 노트 만들기</button>
      </section>

      <footer class="landing__footer">
        <p>ChoreoNote · 안무가를 위한 대형 편집기</p>
      </footer>
    </div>
  `;

  const goToDashboard = () => navigate('/dashboard');
  container.querySelector('#landing-start-btn').addEventListener('click', goToDashboard);
  container.querySelector('#landing-cta-btn').addEventListener('click', goToDashboard);
  container.querySelector('#landing-bottom-btn').addEventListener('click', goToDashboard);
}
