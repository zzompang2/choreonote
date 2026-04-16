import { supabase } from '../store/supabase.js';
import { t } from './i18n.js';

/** 현재 로그인된 유저 반환 (없으면 null) */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Google OAuth 로그인 */
export async function signInWithGoogle(redirectPath = '/market') {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/#' + redirectPath,
    },
  });
  if (error) throw error;
}

/** 로그아웃 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** auth 상태 변경 리스너 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
}

/**
 * 로그인 필요 시 모달을 띄우고 Promise를 반환.
 * 이미 로그인돼 있으면 즉시 resolve.
 * 취소하면 null 반환.
 */
export async function requireAuth(redirectPath = '/market') {
  const user = await getCurrentUser();
  if (user) return user;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'auth-modal';
    overlay.innerHTML = `
      <div class="auth-modal__box">
        <h3 class="auth-modal__title">${t('marketLoginRequired')}</h3>
        <button class="btn btn--google auth-modal__google">
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
          ${t('marketLoginGoogle')}
        </button>
        <button class="btn btn--ghost auth-modal__cancel">${t('cancel')}</button>
      </div>
    `;

    const cleanup = () => {
      overlay.remove();
    };

    overlay.querySelector('.auth-modal__google').addEventListener('click', () => {
      signInWithGoogle(redirectPath);
      cleanup();
      resolve(null); // 리다이렉트되므로 페이지가 새로고침됨
    });

    overlay.querySelector('.auth-modal__cancel').addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });

    document.body.appendChild(overlay);
  });
}
