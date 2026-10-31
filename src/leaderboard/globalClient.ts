/* =====================================================================
   NS4-18: global skor istemcisi (Supabase, yalnızca fetch; SDK yok).
   - Okuma: PostgREST RPC public.get_leaderboard (yalnızca rank, takma ad,
     skor, drenaj, seviye). Tablo doğrudan okunmaz.
   - Yazma: Edge Function submit-score. Tabloya doğrudan insert yoktur.
   - Yalnızca publishable/anon anahtar kullanılır. Gövde, anahtar ve yanıt
     ayrıntısı konsola yazılmaz.
   - Zaman aşımı: AbortController. Polling veya realtime yoktur; okuma
     yalnızca ekran açılışında ve kullanıcı yenilediğinde yapılır.
   ===================================================================== */
import { CLIENT_VERSION, READ_RPC, SUBMIT_FUNCTION, type LeaderboardConfig } from './config';
import {
  GAME_RULES,
  RULESET,
  SCORE_LIMITS,
  validateNickname,
  validateScorePayload,
  type ScorePayload,
} from '../../supabase/functions/_shared/scoreRules.ts';

export interface GlobalEntry {
  readonly rank: number;
  readonly nickname: string;
  readonly score: number;
  readonly lines: number;
  readonly level: number;
}
export type FetchResult =
  | { readonly ok: true; readonly entries: GlobalEntry[] }
  | { readonly ok: false; readonly reason: 'disabled' | 'offline' | 'timeout' | 'error' };
export type SubmitResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'disabled' | 'invalid' | 'duplicate' | 'rate_limited' | 'offline' | 'timeout' | 'error';
    };

export interface LeaderboardClient {
  readonly enabled: boolean;
  fetchTop(limit?: number): Promise<FetchResult>;
  submit(payload: Omit<ScorePayload, 'clientVersion' | 'ruleset'>): Promise<SubmitResult>;
}

export interface ClientOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /** navigator.onLine okuyucu (test için). */
  readonly online?: () => boolean;
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Sunucu yanıtındaki satırı doğrular (beklenmeyen/bozuk satırlar gösterilmez). */
export function normalizeGlobalEntry(raw: unknown): GlobalEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const nick = validateNickname(r['nickname']);
  if (!nick.ok) return null;
  if (!isInt(r['rank'], 1, 1000)) return null;
  if (!isInt(r['score'], 0, SCORE_LIMITS.maxScore) || !isInt(r['lines'], 0, SCORE_LIMITS.maxLines)) return null;
  if (!isInt(r['level'], 1, GAME_RULES.maxLevel)) return null;
  return { rank: r['rank'], nickname: nick.value, score: r['score'], lines: r['lines'], level: r['level'] };
}

/** Eski anon anahtarlar JWT'dir (Authorization ile de gönderilir); publishable anahtar yalnızca apikey. */
function authHeaders(key: string): Record<string, string> {
  const h: Record<string, string> = { apikey: key };
  if (key.split('.').length === 3) h['Authorization'] = `Bearer ${key}`;
  return h;
}

const DISABLED: LeaderboardClient = {
  enabled: false,
  fetchTop: () => Promise.resolve({ ok: false, reason: 'disabled' }),
  submit: () => Promise.resolve({ ok: false, reason: 'disabled' }),
};

export function createLeaderboardClient(cfg: LeaderboardConfig | null, opts: ClientOptions = {}): LeaderboardClient {
  if (!cfg) return DISABLED;
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const timeoutMs = opts.timeoutMs ?? 8000;
  const online = opts.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);

  async function request(url: string, init: RequestInit): Promise<Response | 'timeout' | 'offline'> {
    if (!online()) return 'offline';
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await doFetch(url, { ...init, signal: ctl.signal, credentials: 'omit', cache: 'no-store' });
    } catch {
      return ctl.signal.aborted ? 'timeout' : 'offline';
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    enabled: true,
    async fetchTop(limit = 10) {
      const n = Math.max(1, Math.min(10, Math.floor(limit)));
      const res = await request(`${cfg.url}/rest/v1/rpc/${READ_RPC}?limit_count=${n}&ruleset_name=${RULESET}`, {
        method: 'GET',
        headers: { ...authHeaders(cfg.key), Accept: 'application/json' },
      });
      if (res === 'timeout' || res === 'offline') return { ok: false, reason: res };
      if (!res.ok) return { ok: false, reason: 'error' };
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { ok: false, reason: 'error' };
      }
      if (!Array.isArray(body)) return { ok: false, reason: 'error' };
      const entries = body
        .map(normalizeGlobalEntry)
        .filter((e): e is GlobalEntry => e !== null)
        .slice(0, n);
      return { ok: true, entries };
    },
    async submit(p) {
      const payload = { ...p, clientVersion: CLIENT_VERSION, ruleset: RULESET };
      if (!validateScorePayload(payload).ok) return { ok: false, reason: 'invalid' };
      const res = await request(`${cfg.url}/functions/v1/${SUBMIT_FUNCTION}`, {
        method: 'POST',
        headers: { ...authHeaders(cfg.key), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res === 'timeout' || res === 'offline') return { ok: false, reason: res };
      if (res.status === 201 || res.status === 200) return { ok: true };
      if (res.status === 409) return { ok: false, reason: 'duplicate' };
      if (res.status === 422 || res.status === 400) return { ok: false, reason: 'invalid' };
      if (res.status === 429) return { ok: false, reason: 'rate_limited' };
      return { ok: false, reason: 'error' };
    },
  };
}
