// Edge Function işleyicileri (Node'da, sahte veritabanıyla; Supabase'e bağlanılmaz): tetris-submit-score ve tetris-room.
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_BODY_BYTES,
  RATE,
  handleSubmit,
  type InsertResult,
  type ScoreRow,
  type SubmitDeps,
} from '../../supabase/functions/tetris-submit-score/handler.ts';
import {
  CLOCK_SKEW_MS,
  handleRoom,
  type JoinResult,
  type Member,
  type RoomDeps,
} from '../../supabase/functions/tetris-room/handler.ts';
import { memoryRateLimiter, originAllowed, sha256Hex } from '../../supabase/functions/_shared/http.ts';
import { generateIdentity, roomRequestText, sign, type PublicKeyParts } from '../../supabase/functions/_shared/sign.ts';

const body = (over: Record<string, unknown> = {}) => ({
  gameId: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
  nickname: '  Ferah   Nefes ',
  score: 4321,
  lines: 23,
  level: 3,
  durationSeconds: 245,
  clientVersion: 'web-tetris-1',
  ruleset: 'cyclamen-flow-v3',
  ...over,
});
const SECRET = 'service-role-SECRET-should-never-leak';
function submitDeps(over: Partial<SubmitDeps> = {}, env: Record<string, string> = {}) {
  const rows: (ScoreRow & { id: number })[] = [];
  const insert = vi.fn((r: ScoreRow): Promise<InsertResult> => {
    if (rows.some((x) => x.game_hash === r.game_hash)) return Promise.resolve({ status: 'duplicate' });
    rows.push({ ...r, id: rows.length + 1 });
    return Promise.resolve({ status: 'ok', id: rows.length });
  });
  const rank = vi.fn((_rs: string, score: number, id: number) =>
    Promise.resolve(rows.filter((x) => x.score > score || (x.score === score && x.id < id)).length + 1),
  );
  const all: Record<string, string> = { SCORE_HASH_PEPPER: 'pepper-1', SUPABASE_SERVICE_ROLE_KEY: SECRET, ...env };
  const d: SubmitDeps = { env: (k) => all[k], insert, rank, limiter: memoryRateLimiter(), ...over };
  return { d, rows, insert };
}
const post = (b: unknown, headers: Record<string, string> = {}, url = 'https://x/functions/v1/fn') =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof b === 'string' ? b : JSON.stringify(b),
  });
const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> });

describe('tetris-submit-score: giriş denetimleri', () => {
  it('geçerli gönderim → 201 + kimlik ve sıra; satır normalize ad ve tuzlu oyun özetiyle yazılır', async () => {
    const { d, rows } = submitDeps();
    expect(await read(await handleSubmit(post(body()), d))).toEqual({
      status: 201,
      body: { ok: true, id: 1, rank: 1 },
    });
    expect(rows[0]).toEqual({
      id: 1,
      name: 'Ferah Nefes',
      score: 4321,
      lines: 23,
      level: 3,
      duration_seconds: 245,
      game_hash: await sha256Hex('game:pepper-1:3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'),
      client_version: 'web-tetris-1',
      ruleset: 'cyclamen-flow-v3',
    });
    expect(JSON.stringify(rows)).not.toMatch(/3f2b8c1e|ip|agent/i); // ham oyun kimliği / adres saklanmaz
  });
  it('OPTIONS 204 + CORS; yalnızca POST; yalnızca application/json; boyut sınırı; bozuk JSON', async () => {
    const { d, insert } = submitDeps();
    const opt = await handleSubmit(new Request('https://x/fn', { method: 'OPTIONS' }), d);
    expect([opt.status, opt.headers.get('access-control-allow-methods')]).toEqual([204, 'POST, OPTIONS']);
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH'])
      expect((await read(await handleSubmit(new Request('https://x/fn', { method }), d))).body).toEqual({
        ok: false,
        error: 'method',
      });
    expect((await handleSubmit(post(body(), { 'Content-Type': 'text/plain' }), d)).status).toBe(415);
    expect((await handleSubmit(post('x'.repeat(MAX_BODY_BYTES + 1)), d)).status).toBe(413);
    expect((await handleSubmit(post('{bozuk'), d)).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
  it('ALLOWED_ORIGINS: liste dışı origin 403; listedeki origin yansıtılır', async () => {
    const env = { ALLOWED_ORIGINS: 'https://oyun.example, http://localhost:5173' };
    const { d } = submitDeps({}, env);
    expect((await handleSubmit(post(body(), { Origin: 'https://kotu.example' }), d)).status).toBe(403);
    const ok = await handleSubmit(post(body(), { Origin: 'https://oyun.example' }), d);
    expect([ok.status, ok.headers.get('access-control-allow-origin')]).toEqual([201, 'https://oyun.example']);
    expect(originAllowed(null, 'https://oyun.example')).toBe(false);
  });
});

describe('tetris-submit-score: sunucuda yeniden doğrulama', () => {
  it.each<[string, Record<string, unknown>]>([
    ['kural seti değiştirme', { ruleset: 'cyclamen-flow-v1' }],
    ['bilinmeyen kural seti', { ruleset: 'hile' }],
    ['negatif skor', { score: -1 }],
    ['aşırı skor', { score: 10_000_001 }],
    ['ondalık skor', { score: 1.5 }],
    ['seviye satırla tutarsız', { level: 9 }],
    ['satır sınır dışı', { lines: 5001, level: 20 }],
    ['süreye göre imkânsız skor', { score: 9_000_000, durationSeconds: 5 }],
    ['satır için süre çok kısa', { lines: 400, level: 20, durationSeconds: 3 }],
    ['geçersiz takma ad', { nickname: '<b>x</b>' }],
    ['oyun kimliği UUID değil', { gameId: 'abc' }],
    ['fazla alan', { admin: true }],
  ])('%s → 422 (iç ayrıntı dönmez)', async (_n, over) => {
    const { d, insert } = submitDeps();
    const r = await read(await handleSubmit(post(body(over)), d));
    expect(r).toEqual({ status: 422, body: { ok: false, error: 'invalid' } });
    expect(insert).not.toHaveBeenCalled();
  });
  it('aynı oyun ikinci kez → 409; sıra eşit skorda önce kaydedilene göre', async () => {
    const { d } = submitDeps();
    await handleSubmit(post(body()), d);
    expect(await read(await handleSubmit(post(body()), d))).toEqual({
      status: 409,
      body: { ok: false, error: 'duplicate' },
    });
    const second = await read(await handleSubmit(post(body({ gameId: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0c' })), d));
    expect(second.body).toEqual({ ok: true, id: 2, rank: 2 });
  });
  it(`hız sınırı: dakikada ${RATE.minute} gönderimden sonra 429; sayaç hatası 500 (yazılmaz)`, async () => {
    const { d } = submitDeps();
    const codes: number[] = [];
    for (let i = 0; i < RATE.minute + 2; i++)
      codes.push(
        (await handleSubmit(post(body({ gameId: `3f2b8c1e-9a4d-4e6f-8b2a-${String(i).padStart(12, '0')}` })), d))
          .status,
      );
    expect(codes.slice(0, RATE.minute).every((c) => c === 201)).toBe(true);
    expect(codes.slice(RATE.minute)).toEqual([429, 429]);
    const broken = submitDeps({ limiter: { allow: () => Promise.reject(new Error('db')) } });
    expect((await handleSubmit(post(body()), broken.d)).status).toBe(500);
    expect(broken.insert).not.toHaveBeenCalled();
  });
  it('veritabanı hatası → 500 { error: server }: secret veya iç ayrıntı yanıtta yok', async () => {
    const { d } = submitDeps({ insert: () => Promise.reject(new Error(`connect ${SECRET} 10.0.0.1`)) });
    const r = await handleSubmit(post(body()), d);
    const text = await r.text();
    expect(r.status).toBe(500);
    expect(text).toBe('{"ok":false,"error":"server"}');
  });
});

/* ---------------- tetris-room ---------------- */

/** Bellekte oda veritabanı: en çok 3 etkin üye, benzersiz renk (gerçek RPC'lerin kuralları). */
function roomDb() {
  const rooms = new Map<string, { id: string; members: (Member & { left?: boolean })[] }>();
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const add = (room: { id: string; members: Member[] }, name: string, pub: PublicKeyParts): JoinResult => {
    const used = new Set(room.members.map((m) => m.color));
    const color = [0, 1, 2].find((c) => !used.has(c)) ?? 0;
    const id = uuid();
    room.members.push({ id, name, color, x: pub.x, y: pub.y, joinedAt: n });
    return { status: 'ok', roomId: room.id, playerId: id, color };
  };
  const byId = (id: string) => [...rooms.values()].find((r) => r.id === id);
  const deps = {
    createRoom: vi.fn((code: string, name: string, pub: PublicKeyParts) => {
      if (rooms.has(code)) return Promise.resolve<JoinResult>({ status: 'taken' });
      const room = { id: uuid(), members: [] };
      rooms.set(code, room);
      return Promise.resolve(add(room, name, pub));
    }),
    joinRoom: vi.fn((code: string, name: string, pub: PublicKeyParts) => {
      const room = rooms.get(code);
      if (!room || !room.members.length) return Promise.resolve<JoinResult>({ status: 'not_found' });
      if (room.members.length >= 3) return Promise.resolve<JoinResult>({ status: 'full' });
      return Promise.resolve(add(room, name, pub));
    }),
    memberKey: (roomId: string, playerId: string) => {
      const m = byId(roomId)?.members.find((x) => x.id === playerId);
      return Promise.resolve(m ? { x: m.x, y: m.y } : null);
    },
    roster: (roomId: string) => Promise.resolve([...(byId(roomId)?.members ?? [])]),
    leave: (roomId: string, playerId: string) => {
      const r = byId(roomId);
      if (r) r.members = r.members.filter((m) => m.id !== playerId);
      return Promise.resolve();
    },
  };
  return { rooms, deps };
}
function roomDeps(over: Partial<RoomDeps> = {}) {
  const db = roomDb();
  let t = 1_000_000;
  const d: RoomDeps = {
    env: () => undefined,
    limiter: memoryRateLimiter(() => t),
    now: () => t,
    random: () => 0,
    ...db.deps,
    ...over,
  };
  return { d, db, tick: (ms: number) => (t += ms), now: () => t };
}
const call = async (d: RoomDeps, b: unknown) => read(await handleRoom(post(b), d));

describe('tetris-room: sunucu tarafı üyelik', () => {
  it('kur → kod + tahmin edilemez oda kimliği; katılım en çok 3; dördüncü reddedilir; renkler benzersiz', async () => {
    const { d } = roomDeps();
    const ids = await Promise.all([1, 2, 3, 4].map(() => generateIdentity()));
    const a = await call(d, { action: 'create', name: 'Oyuncu A', pub: ids[0]?.pub });
    expect(a.status).toBe(200);
    expect(a.body['code']).toBe('AAAA');
    expect(a.body['roomId']).toMatch(/^[0-9a-f-]{36}$/);
    const code = String(a.body['code']);
    const b = await call(d, { action: 'join', name: 'Oyuncu B', pub: ids[1]?.pub, code });
    const c = await call(d, { action: 'join', name: 'Oyuncu C', pub: ids[2]?.pub, code });
    expect([a.body['color'], b.body['color'], c.body['color']]).toEqual([0, 1, 2]);
    expect(await call(d, { action: 'join', name: 'Oyuncu D', pub: ids[3]?.pub, code })).toEqual({
      status: 409,
      body: { ok: false, error: 'full' },
    });
    expect((await call(d, { action: 'join', name: 'Oyuncu D', pub: ids[3]?.pub, code: 'ZZZZ' })).body).toEqual({
      ok: false,
      error: 'not_found',
    });
  });
  it('biçim: geçersiz ad, anahtar, kod ya da fazla alan → 422; kod tahmini hız sınırlı (429)', async () => {
    const { d } = roomDeps();
    const id = await generateIdentity();
    for (const b of [
      { action: 'create', name: '<x>', pub: id.pub },
      { action: 'create', name: 'Ali Veli', pub: { x: 'kısa', y: id.pub.y } },
      { action: 'join', name: 'Ali Veli', pub: id.pub, code: 'aaaa' },
      { action: 'join', name: 'Ali Veli', pub: id.pub, code: 'AAAA', extra: 1 },
      { action: 'sil', name: 'Ali Veli' },
    ])
      expect((await call(d, b)).status).toBe(422);
    const codes: number[] = [];
    for (let i = 0; i < 32; i++)
      codes.push((await call(d, { action: 'join', name: 'Ali', pub: id.pub, code: 'BBBB' })).status);
    expect(codes.slice(0, 30).every((s) => s === 404)).toBe(true);
    expect(codes.slice(30)).toEqual([429, 429]);
  });
  it('üye listesi / ayrılma yalnızca üyenin imzasıyla; başka anahtar, eski zaman ya da başka oyuncu kimliği 403/422', async () => {
    const { d, now, tick } = roomDeps();
    const a = await generateIdentity(),
      x = await generateIdentity();
    const room = (await call(d, { action: 'create', name: 'Oyuncu A', pub: a.pub })).body;
    const roomId = String(room['roomId']),
      playerId = String(room['playerId']);
    const signed = async (action: string, key: CryptoKey, ts = now(), pid = playerId) => ({
      action,
      roomId,
      playerId: pid,
      ts,
      sig: await sign(key, roomRequestText(action, roomId, pid, ts)),
    });
    const ok = await call(d, await signed('roster', a.privateKey));
    expect(ok.status).toBe(200);
    expect((ok.body['roster'] as Member[]).map((m) => m.name)).toEqual(['Oyuncu A']);
    expect((await call(d, await signed('roster', x.privateKey))).status).toBe(403); // başka anahtar
    expect((await call(d, await signed('leave', a.privateKey, now() - CLOCK_SKEW_MS - 1))).status).toBe(422);
    const other = '00000000-0000-4000-8000-000000000999';
    expect((await call(d, await signed('leave', a.privateKey, now(), other))).status).toBe(403);
    tick(1000);
    expect((await call(d, await signed('leave', a.privateKey))).status).toBe(200);
    expect((await call(d, await signed('roster', a.privateKey))).status).toBe(403); // artık üye değil
  });
  it('veritabanı hatası → 500 (ayrıntı yok)', async () => {
    const { d } = roomDeps({ createRoom: () => Promise.reject(new Error(SECRET)) });
    const r = await handleRoom(post({ action: 'create', name: 'Oyuncu A', pub: (await generateIdentity()).pub }), d);
    expect([r.status, await r.text()]).toEqual([500, '{"ok":false,"error":"server"}']);
  });
});

describe('Edge Function veritabanı yardımcısı (service role RPC)', () => {
  it('gövdesiz 204 yanıtı (void fonksiyon, ör. tetris_room_leave) hata sayılmaz; hata kodu istisnadır', async () => {
    const { createDb } = await import('../../supabase/functions/_shared/db.ts');
    const f = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('tetris_room_leave')
          ? new Response(null, { status: 204 })
          : url.endsWith('tetris_rate_hit')
            ? new Response('true', { status: 200 })
            : new Response('{"message":"iç ayrıntı"}', { status: 400 }),
      ),
    );
    vi.stubGlobal('fetch', f);
    const db = createDb('https://db.test', 'srv');
    await expect(db.rpc('tetris_room_leave', {})).resolves.toBeNull();
    await expect(db.limiter.allow('k', 'b', 1, 60)).resolves.toBe(true);
    await expect(db.rpc('tetris_room_join', {})).rejects.toThrow('rpc 400');
    expect(f.mock.calls[0]?.[0]).toBe('https://db.test/rest/v1/rpc/tetris_room_leave');
  });
});
