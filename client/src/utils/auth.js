import { supabase } from '../store/supabase.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { rerouteCurrent } from './router.js';

// sessionStorage 플래그 키
const EXPLICIT_LOGOUT_KEY = 'explicit-logout';
const SESSION_EXPIRED_KEY = 'session-expired';
const PENDING_LOGIN_SYNC_KEY = 'pending-login-sync';

/**
 * 현재 로그인된 유저 반환 (없으면 null).
 * getSession은 OAuth 복귀 직후 PKCE 교환 중엔 resolve가 지연될 수 있어
 * 500ms timeout 둔다. 세션이 뒤늦게 올라오면 onAuthStateChange로 재렌더.
 */
export async function getCurrentUser() {
  try {
    return await Promise.race([
      supabase.auth.getSession().then(({ data }) => data.session?.user || null),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 500)),
    ]);
  } catch {
    return null;
  }
}

/** Google OAuth 로그인. 리다이렉트 복귀 후 자동 동기화되도록 플래그를 심어 둔다. */
export async function signInWithGoogle(redirectPath = '/market') {
  sessionStorage.setItem(PENDING_LOGIN_SYNC_KEY, '1');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/#' + redirectPath,
    },
  });
  if (error) {
    sessionStorage.removeItem(PENDING_LOGIN_SYNC_KEY);
    throw error;
  }
}

/**
 * 로그아웃. 명시적 호출 표시로 플래그를 세워 두면 onAuthStateChange에서
 * 클라우드 캐시 삭제로 분기한다. 세션 만료로 인한 SIGNED_OUT은 플래그 없음 → 캐시 유지.
 */
export async function signOut() {
  sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, '1');
  const { error } = await supabase.auth.signOut();
  if (error) {
    sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
    throw error;
  }
}

/** auth 상태 변경 리스너 (페이지 레벨 커스텀 구독용) */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
}

/** 세션 만료(암묵 로그아웃) 배너 상태 */
export function wasSessionExpired() {
  return sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1';
}

export function clearSessionExpired() {
  sessionStorage.removeItem(SESSION_EXPIRED_KEY);
}

/**
 * 전역 auth 핸들러. main.js에서 한 번만 호출.
 * - SIGNED_IN + pending 플래그 → downloadAllOnLogin + 충돌 모달
 * - SIGNED_OUT: explicit 플래그 있으면 클라우드 캐시 삭제, 없으면 세션 만료 배너 플래그
 */
let authHandlerInitialized = false;
export function initAuthHandler() {
  if (authHandlerInitialized) return;
  authHandlerInitialized = true;

  supabase.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_IN') {
      // 세션이 뒤늦게 복원된 경우를 대비해 현재 라우트 재렌더.
      rerouteCurrent();
      if (sessionStorage.getItem(PENDING_LOGIN_SYNC_KEY) === '1') {
        sessionStorage.removeItem(PENDING_LOGIN_SYNC_KEY);
        clearSessionExpired();
        await handlePostLoginSync();
      }
    } else if (event === 'SIGNED_OUT') {
      if (sessionStorage.getItem(EXPLICIT_LOGOUT_KEY) === '1') {
        sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
        try {
          await clearCloudCache();
        } catch (err) {
          console.warn('clearCloudCache failed:', err);
        }
      } else {
        sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
      }
    }
  });

  // OAuth 복귀 직후에는 SIGNED_IN 이벤트가 getSession 전에 이미 지나갔을 수 있다.
  // pending 플래그가 남아있다면 세션 확인 후 동기화를 한 번 더 시도.
  if (sessionStorage.getItem(PENDING_LOGIN_SYNC_KEY) === '1') {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && sessionStorage.getItem(PENDING_LOGIN_SYNC_KEY) === '1') {
        sessionStorage.removeItem(PENDING_LOGIN_SYNC_KEY);
        clearSessionExpired();
        handlePostLoginSync();
      }
    });
  }
}

async function handlePostLoginSync() {
  try {
    const { downloadAllOnLogin } = await import('./cloudSync.js');
    const result = await downloadAllOnLogin();

    const restored = result.downloaded + result.merged;
    if (restored > 0) {
      showToast(t('cloudRestoreToast', { count: restored }), 4000);
    }

    for (const c of result.conflicts) {
      try {
        await resolveConflictInteractive(c);
      } catch (err) {
        console.error('Conflict resolution failed:', err);
      }
    }

    // 현재 렌더된 페이지가 변경을 반영하도록 이벤트 발행
    document.dispatchEvent(new CustomEvent('app:cloud-notes-updated'));
  } catch (err) {
    console.error('handlePostLoginSync failed:', err);
  }
}

async function resolveConflictInteractive({ noteId, serverNote }) {
  const [{ db }, { NoteStore }, { showConflictModal }, cloudSync] = await Promise.all([
    import('../store/db.js'),
    import('../store/NoteStore.js'),
    import('../components/ConflictModal.js'),
    import('./cloudSync.js'),
  ]);

  const localNote = await db.notes.get(noteId);
  if (!localNote) return;

  const jsonStr = await NoteStore.exportJSON(noteId);
  const localNoteJson = JSON.parse(jsonStr);

  const action = await showConflictModal({
    serverNote,
    localNoteJson,
    localEditedAt: localNote.editedAt,
  });

  if (action === 'overwrite') {
    await cloudSync.resolveOverwriteServer(noteId);
    await db.notes.update(noteId, { location: 'cloud' });
  } else if (action === 'use-server') {
    await cloudSync.resolveUseServer(noteId, serverNote);
    await db.notes.update(noteId, { location: 'cloud' });
  } else if (action === 'keep-both') {
    await cloudSync.resolveKeepBoth(noteId, serverNote);
    await db.notes.update(noteId, { location: 'cloud' });
  }
  // cancel → 아무 것도 안 함 (위치도 승격하지 않음)
}

async function clearCloudCache() {
  const [{ db }, { NoteStore }] = await Promise.all([
    import('../store/db.js'),
    import('../store/NoteStore.js'),
  ]);
  const all = await db.notes.toArray();
  for (const n of all) {
    if (n.location === 'cloud') {
      await NoteStore.permanentlyDeleteNote(n.id);
    }
  }
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
