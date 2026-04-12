const STORAGE_KEY = 'choreonote-theme';

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light') {
    document.documentElement.classList.add('light');
  }
}

export function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem(STORAGE_KEY, isLight ? 'light' : 'dark');
  return isLight;
}

export function isLightMode() {
  return document.documentElement.classList.contains('light');
}
