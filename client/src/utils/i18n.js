import { ko } from '../locales/ko.js';
import { en } from '../locales/en.js';

const locales = { ko, en };
let currentLang = localStorage.getItem('choreonote-lang') || 'ko';
let strings = locales[currentLang] || locales.ko;

export function t(key, params) {
  let str = strings[key] ?? locales.ko[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, v);
    }
  }
  return str;
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (!locales[lang]) return;
  currentLang = lang;
  strings = locales[lang];
  localStorage.setItem('choreonote-lang', lang);
}

export function getAvailableLangs() {
  return Object.keys(locales);
}
