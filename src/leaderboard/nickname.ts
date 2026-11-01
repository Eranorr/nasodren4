/* =====================================================================
   NS4-18: takma ad (cihazda hatırlanır, fn_nickname). Hesap, e-posta veya
   başka kişisel bilgi istenmez. Doğrulama kuralları istemcide ve veritabanı
   tabloda aynıdır (src/leaderboard/rules.ts).
   ===================================================================== */
import { store } from '../storage/store';
import { validateNickname } from '../../supabase/functions/_shared/scoreRules.ts';

export const NICKNAME_KEY = 'nickname';

/** Kayıtlı geçerli takma ad; yoksa veya geçersizse boş. */
export function loadNickname(): string {
  const v = validateNickname(store.get(NICKNAME_KEY, null));
  return v.ok ? v.value : '';
}
export function saveNickname(nickname: string): void {
  const v = validateNickname(nickname);
  if (v.ok) store.set(NICKNAME_KEY, v.value);
}

/** Oyun başına rastgele kimlik (UUID v4). crypto.randomUUID yoksa getRandomValues ile üretilir. */
export function newGameId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
