/* =====================================================================
   Global skor istemcisi (Supabase, ortak proje; önek tetris). Yalnızca
   fetch; Supabase SDK'sı bu yolda yüklenmez (ilk yükleme küçük kalır).
   - Okuma: PostgREST RPC public.tetris_get_leaderboard (yalnızca kimlik, sıra,
     takma ad, skor, satır, seviye; en çok 10). Tablo doğrudan okunmaz.
   - Yazma: Edge Function tetris-submit-score. Tarayıcının tabloya yazma
     yetkisi yoktur; sunucu bütün alanları yeniden doğrular, aynı oyunu
     (gameId) ikinci kez kabul etmez, hız sınırı uygular ve sırayı döner.
   - Yalnızca publishable anahtar kullanılır. Gövde, anahtar ve yanıt
     ayrıntısı konsola yazılmaz.
   - Zaman aşımı (10 sn): Supabase yanıt vermezse beklenmez, arayüz yerel
     listeye düşer. Polling yoktur.
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
  /** Tablodaki satır kimliği (az önce gönderilen satır vurgulanır). */
  readonly id: number;
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
  | { readonly ok: true; readonly entry: GlobalEntry }
  | {
      readonly ok: false;
      readonly reason: 'disabled' | 'invalid' | 'duplicate' | 'rate_limited' | 'offline' | 'timeout' | 'error';
    };

/** Gönderim: oyun kimliği (tekrar engeli) ve süre dahil; sürüm ve kural seti istemci ekler. */
export type ScoreSubmission = Omit<ScorePayload, 'clientVersion' | 'ruleset'>;

export interface LeaderboardClient {
  readonly enabled: boolean;
  fetchTop(limit?: number): Promise<FetchResult>;
  submit(s: ScoreSubmission): Promise<SubmitResult>;
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
  const nick = validateNickname(r['name']);
  if (!nick.ok) return null;
  if (!isInt(r['id'], 1, Number.MAX_SAFE_INTEGER) || !isInt(r['rank'], 1, 1000)) return null;
  if (!isInt(r['score'], 0, SCORE_LIMITS.maxScore) || !isInt(r['lines'], 0, SCORE_LIMITS.maxLines)) return null;
  if (!isInt(r['level'], 1, GAME_RULES.maxLevel)) return null;
  return {
    id: r['id'],
    rank: r['rank'],
    nickname: nick.value,
    score: r['score'],
    lines: r['lines'],
    level: r['level'],
  };
}

/** Eski anon anahtarlar JWT'dir (Authorization ile de gönderilir); publishable anahtar yalnızca apikey. */
export function authHeaders(key: string): Record<string, string> {
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
  const timeoutMs = opts.timeoutMs ?? 10000;
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
  async function body(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return null;
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
      const b = await body(res);
      if (!Array.isArray(b)) return { ok: false, reason: 'error' };
      const entries = b
        .map(normalizeGlobalEntry)
        .filter((e): e is GlobalEntry => e !== null)
        .slice(0, n);
      return { ok: true, entries };
    },
    async submit(s) {
      const payload = { ...s, clientVersion: CLIENT_VERSION, ruleset: RULESET };
      const v = validateScorePayload(payload);
      if (!v.ok) return { ok: false, reason: 'invalid' };
      const res = await request(`${cfg.url}/functions/v1/${SUBMIT_FUNCTION}`, {
        method: 'POST',
        headers: { ...authHeaders(cfg.key), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res === 'timeout' || res === 'offline') return { ok: false, reason: res };
      if (res.status === 409) return { ok: false, reason: 'duplicate' };
      if (res.status === 422 || res.status === 400) return { ok: false, reason: 'invalid' };
      if (res.status === 429) return { ok: false, reason: 'rate_limited' };
      if (res.status !== 201 && res.status !== 200) return { ok: false, reason: 'error' };
      const b = (await body(res)) as { id?: unknown; rank?: unknown } | null;
      const id = b?.id;
      if (!isInt(id, 1, Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'error' };
      const rank = isInt(b?.rank, 1, Number.MAX_SAFE_INTEGER) ? b.rank : 0;
      const p = v.value;
      return {
        ok: true,
        entry: { id, rank, nickname: p.nickname, score: p.score, lines: p.lines, level: p.level },
      };
    },
  };
}
