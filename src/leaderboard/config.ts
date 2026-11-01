/* =====================================================================
   Supabase yapılandırması (Vite ortam değişkenleri). Sitedeki bütün oyunlar
   tek bir Supabase projesini paylaşır; bu oyunun öneki `tetris`
   (tablo: tetris_scores, oda kanalı: tetris:room:<KOD>).
   Tarayıcıya yalnızca public proje URL'si ve publishable/anon anahtar
   girer. Değerler eksik veya geçersizse global skor ve çok oyunculu
   kontrollü biçimde kapalıdır (oyun ve yerel tablo etkilenmez).
   ===================================================================== */

export interface LeaderboardConfig {
  /** https://<ref>.supabase.co (sonunda / yok). */
  readonly url: string;
  readonly key: string;
}

/** Oyunun ortak projedeki öneki. */
export const PREFIX = 'tetris';
/** Skor gönderimi (Edge Function; tarayıcı tabloya yazamaz). */
export const SUBMIT_FUNCTION = `${PREFIX}-submit-score`;
/** Oda üyeliği (Edge Function). */
export const ROOM_FUNCTION = `${PREFIX}-room`;
/** Okuma RPC'si (yalnızca gerekli sütunlar, en çok 10 satır). */
export const READ_RPC = `${PREFIX}_get_leaderboard`;
export const CLIENT_VERSION = 'web-tetris-1';
/** Çok oyunculu oda kanalı öneki (Supabase Realtime). */
export const ROOM_TOPIC = `${PREFIX}:room:`;

/** Service role / secret anahtar biçimleri: yanlışlıkla verilirse yapılandırma reddedilir. */
function looksSecret(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

/**
 * Ortamdan yapılandırma; eksik/geçersizse null (global skor ve çok oyunculu kapalı).
 * Anahtar adı VITE_SUPABASE_PUBLISHABLE_KEY. Geçici uyumluluk: yalnızca eski VITE_SUPABASE_ANON_KEY tanımlıysa o
 * okunur (ortak rehberi izleyen kurulumlar); yeni kurulumlar yalnızca PUBLISHABLE adını kullanır.
 */
export function leaderboardConfigFrom(env: {
  readonly VITE_SUPABASE_URL?: string | undefined;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
  readonly VITE_SUPABASE_ANON_KEY?: string | undefined;
}): LeaderboardConfig | null {
  const rawUrl = (env.VITE_SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!rawUrl || !key || looksSecret(key)) return null;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
  return { url: u.origin, key };
}

export const leaderboardConfig: LeaderboardConfig | null = leaderboardConfigFrom(import.meta.env);
