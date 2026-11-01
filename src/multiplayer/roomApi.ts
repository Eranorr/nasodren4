/* =====================================================================
   Oda üyeliği istemcisi: Edge Function tetris-room (yalnızca fetch).
   Katılım sunucuda verilir (en çok 3 üye, renk benzersiz); üye listesi,
   nabız ve ayrılma oyuncunun oda anahtarıyla imzalıdır.
   ===================================================================== */
import { ROOM_FUNCTION, type LeaderboardConfig } from '../leaderboard/config';
import { authHeaders } from '../leaderboard/globalClient';
import { roomRequestText, sign, type PublicKeyParts } from '../../supabase/functions/_shared/sign.ts';
import { UUID_RE } from './protocol';

export interface Member {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  readonly x: string;
  readonly y: string;
  readonly joinedAt: number;
}
export interface Joined {
  readonly code: string;
  readonly roomId: string;
  readonly playerId: string;
  readonly color: number;
  readonly roster: Member[];
}
export type ApiFail = 'not_found' | 'full' | 'rate_limited' | 'invalid' | 'forbidden' | 'offline' | 'timeout' | 'error';
export type ApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: ApiFail };

export interface RoomApi {
  create(name: string, pub: PublicKeyParts): Promise<ApiResult<Joined>>;
  join(code: string, name: string, pub: PublicKeyParts): Promise<ApiResult<Joined>>;
  roster(roomId: string, playerId: string, key: CryptoKey): Promise<ApiResult<Member[]>>;
  /** Sayfa kapanırken de çalışsın diye keepalive. */
  leave(roomId: string, playerId: string, key: CryptoKey): Promise<void>;
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function member(raw: unknown): Member | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const { id, name, color, x, y, joinedAt } = r;
  if (typeof id !== 'string' || !UUID_RE.test(id) || typeof name !== 'string' || name.length > 16) return null;
  if (!isInt(color, 0, 2) || typeof x !== 'string' || typeof y !== 'string' || !isInt(joinedAt, 0, 2 ** 53))
    return null;
  return { id, name, color, x, y, joinedAt };
}
const roster = (raw: unknown): Member[] | null => {
  if (!Array.isArray(raw) || raw.length > 3) return null;
  const list = raw.map(member);
  return list.every((m): m is Member => m !== null) ? list : null;
};

export function createRoomApi(
  cfg: LeaderboardConfig,
  opts: { readonly fetch?: typeof fetch; readonly timeoutMs?: number; readonly now?: () => number } = {},
): RoomApi {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;
  async function call(body: Record<string, unknown>, keepalive = false): Promise<ApiResult<Record<string, unknown>>> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10000);
    let res: Response;
    try {
      res = await doFetch(`${cfg.url}/functions/v1/${ROOM_FUNCTION}`, {
        method: 'POST',
        headers: { ...authHeaders(cfg.key), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl.signal,
        credentials: 'omit',
        cache: 'no-store',
        keepalive,
      });
    } catch {
      return { ok: false, reason: ctl.signal.aborted ? 'timeout' : 'offline' };
    } finally {
      clearTimeout(timer);
    }
    let b: unknown = null;
    try {
      b = await res.json();
    } catch {
      /* gövde yok */
    }
    const r = (typeof b === 'object' && b !== null ? b : {}) as Record<string, unknown>;
    if (res.ok && r['ok'] === true) return { ok: true, value: r };
    const code = r['error'];
    const known: readonly ApiFail[] = ['not_found', 'full', 'rate_limited', 'invalid', 'forbidden'];
    return { ok: false, reason: known.includes(code as ApiFail) ? (code as ApiFail) : 'error' };
  }
  const joined = (r: ApiResult<Record<string, unknown>>): ApiResult<Joined> => {
    if (!r.ok) return r;
    const v = r.value,
      list = roster(v['roster']);
    if (
      typeof v['code'] !== 'string' ||
      typeof v['roomId'] !== 'string' ||
      !UUID_RE.test(v['roomId']) ||
      typeof v['playerId'] !== 'string' ||
      !UUID_RE.test(v['playerId']) ||
      !isInt(v['color'], 0, 2) ||
      !list
    )
      return { ok: false, reason: 'error' };
    return {
      ok: true,
      value: { code: v['code'], roomId: v['roomId'], playerId: v['playerId'], color: v['color'], roster: list },
    };
  };
  async function signed(action: 'roster' | 'leave', roomId: string, playerId: string, key: CryptoKey) {
    const ts = now();
    return { action, roomId, playerId, ts, sig: await sign(key, roomRequestText(action, roomId, playerId, ts)) };
  }
  return {
    create: async (name, pub) => joined(await call({ action: 'create', name, pub })),
    join: async (code, name, pub) => joined(await call({ action: 'join', name, pub, code })),
    async roster(roomId, playerId, key) {
      const r = await call(await signed('roster', roomId, playerId, key));
      if (!r.ok) return r;
      const list = roster(r.value['roster']);
      return list ? { ok: true, value: list } : { ok: false, reason: 'error' };
    },
    async leave(roomId, playerId, key) {
      await call(await signed('leave', roomId, playerId, key), true);
    },
  };
}
