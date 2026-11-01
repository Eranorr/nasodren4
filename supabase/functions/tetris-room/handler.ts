/* =====================================================================
   tetris-room Edge Function çekirdeği: çok oyunculu oda üyeliği sunucuda.
   index.ts bunu Deno.serve ile çalıştırır; testler Node'da sahte veritabanıyla.

   - create: yeni oda (4 karakterlik davet kodu + tahmin edilemez oda kimliği).
   - join: kodla katılım. Üyelik veritabanında satır kilidiyle verilir: en çok
     3 etkin üye, renk benzersiz. Dördüncü oyuncu reddedilir (izleyici yok).
   - roster: etkin üyeler (ad, renk, açık anahtar, katılış). Aynı zamanda nabız:
     nabzı 75 sn gelmeyen üye etkin sayılmaz (sekmesi kapanan oyuncunun yeri boşalır).
   - leave: üyelik biter.
   roster ve leave üyenin kayıtlı anahtarıyla imzalı olmalıdır (±60 sn).

   Realtime kanal adı oda kimliğinden türer (tetris:room:<uuid>); kimliği yalnız
   üyeler alır. Kod tek başına kanala erişim vermez: katılım bu işlevden geçer,
   hız sınırlıdır ve oda dolunca reddedilir.
   ===================================================================== */
import { validateNickname } from '../_shared/scoreRules.ts';
import { clientAddress, readJsonRequest, sha256Hex, type RateLimiter } from '../_shared/http.ts';
import { importPublicKey, roomRequestText, validPublicKey, verify, type PublicKeyParts } from '../_shared/sign.ts';

export const MAX_BODY_BYTES = 1024;
export const CODE_ABC = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
export const CODE_RE = /^[ABCDEFGHJKLMNPRSTUVYZ2-9]{4}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** İmzalı isteklerde kabul edilen saat farkı (ms). */
export const CLOCK_SKEW_MS = 60_000;
/** Hız sınırları: adres başına (istek, pencere sn). */
export const ROOM_RATE = {
  create: [10, 600],
  join: [30, 600],
  roster: [120, 60],
  leave: [30, 60],
} as const satisfies Record<string, readonly [number, number]>;

export interface Member {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  readonly x: string;
  readonly y: string;
  /** Katılış (ms; ev sahibi en erken katılan etkin üyedir). */
  readonly joinedAt: number;
}
export type JoinResult =
  | { readonly status: 'ok'; readonly roomId: string; readonly playerId: string; readonly color: number }
  | { readonly status: 'not_found' | 'full' | 'taken' };

export interface RoomDeps {
  readonly env: (name: string) => string | undefined;
  readonly limiter: RateLimiter;
  readonly now?: () => number;
  readonly random?: () => number;
  /** Kod boşsa oda + ilk üye; kod etkin bir odada kullanılıyorsa 'taken'. */
  createRoom(code: string, name: string, pub: PublicKeyParts): Promise<JoinResult>;
  joinRoom(code: string, name: string, pub: PublicKeyParts): Promise<JoinResult>;
  /** Etkin üyenin açık anahtarı (değilse null). */
  memberKey(roomId: string, playerId: string): Promise<PublicKeyParts | null>;
  /** Etkin üyeler; çağıranın nabzını da günceller. */
  roster(roomId: string, playerId: string): Promise<Member[]>;
  leave(roomId: string, playerId: string): Promise<void>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const keysAre = (o: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(o).length === keys.length && keys.every((k) => k in o);

export async function handleRoom(req: Request, deps: RoomDeps): Promise<Response> {
  const r = await readJsonRequest(req, deps.env('ALLOWED_ORIGINS'), MAX_BODY_BYTES);
  if (r instanceof Response) return r;
  const { body, reply } = r;
  if (!isObj(body) || typeof body['action'] !== 'string' || !(body['action'] in ROOM_RATE))
    return reply.fail('invalid');
  const action = body['action'] as keyof typeof ROOM_RATE;
  const now = (deps.now ?? Date.now)();

  // biçim denetimi (fazla alan reddedilir)
  let name = '',
    code = '',
    roomId = '',
    playerId = '';
  let pub: PublicKeyParts | null = null;
  if (action === 'create' || action === 'join') {
    if (!keysAre(body, action === 'create' ? ['action', 'name', 'pub'] : ['action', 'name', 'pub', 'code']))
      return reply.fail('invalid');
    const nick = validateNickname(body['name']);
    if (!nick.ok || !validPublicKey(body['pub'])) return reply.fail('invalid');
    name = nick.value;
    pub = { x: body['pub'].x, y: body['pub'].y };
    if (action === 'join') {
      if (typeof body['code'] !== 'string' || !CODE_RE.test(body['code'])) return reply.fail('invalid');
      code = body['code'];
    }
  } else {
    if (!keysAre(body, ['action', 'roomId', 'playerId', 'ts', 'sig'])) return reply.fail('invalid');
    const ts = body['ts'];
    if (typeof body['roomId'] !== 'string' || !UUID_RE.test(body['roomId'])) return reply.fail('invalid');
    if (typeof body['playerId'] !== 'string' || !UUID_RE.test(body['playerId'])) return reply.fail('invalid');
    if (typeof ts !== 'number' || !Number.isInteger(ts) || Math.abs(ts - now) > CLOCK_SKEW_MS)
      return reply.fail('invalid');
    roomId = body['roomId'];
    playerId = body['playerId'];
  }

  const ip = await sha256Hex(`rate:${deps.env('SCORE_HASH_PEPPER') ?? ''}:${clientAddress(req)}`);
  const [max, win] = ROOM_RATE[action];
  try {
    if (!(await deps.limiter.allow(ip, `room-${action}`, max, win))) return reply.fail('rate_limited');
    if (action === 'create' || action === 'join') {
      let res: JoinResult = { status: 'taken' };
      if (action === 'join') res = await deps.joinRoom(code, name, pub as PublicKeyParts);
      else
        for (let i = 0; i < 8 && res.status === 'taken'; i++) {
          const rand = deps.random ?? Math.random;
          code = Array.from({ length: 4 }, () => CODE_ABC[(rand() * CODE_ABC.length) | 0]).join('');
          res = await deps.createRoom(code, name, pub as PublicKeyParts);
        }
      if (res.status === 'not_found') return reply.fail('not_found');
      if (res.status === 'full') return reply.fail('full');
      if (res.status !== 'ok') return reply.fail('server');
      const roster = await deps.roster(res.roomId, res.playerId);
      return reply.ok(200, { ok: true, code, roomId: res.roomId, playerId: res.playerId, color: res.color, roster });
    }
    // imzalı istek: üyenin kayıtlı anahtarıyla
    const key = await deps.memberKey(roomId, playerId);
    const ck = key && (await importPublicKey(key));
    if (!ck || !(await verify(ck, roomRequestText(action, roomId, playerId, body['ts'] as number), body['sig'])))
      return reply.fail('forbidden');
    if (action === 'leave') {
      await deps.leave(roomId, playerId);
      return reply.ok(200, { ok: true });
    }
    return reply.ok(200, { ok: true, roster: await deps.roster(roomId, playerId) });
  } catch {
    return reply.fail('server');
  }
}
