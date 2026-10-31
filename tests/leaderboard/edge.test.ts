// NS4-18: submit-score Edge Function işleyicisi (Node'da, sahte veritabanı yazıcısıyla; Supabase'e bağlanılmaz).
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_BODY_BYTES,
  handleSubmit,
  memoryRateLimiter,
  originAllowed,
  sha256Hex,
  type HandlerDeps,
  type ScoreRow,
} from '../../supabase/functions/submit-score/handler.ts';

const body = () => ({
  gameId: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
  nickname: '  Ferah   Nefes ',
  score: 4321,
  lines: 23,
  level: 3,
  durationSeconds: 245,
  clientVersion: 'web-ns4-18',
  ruleset: 'cyclamen-flow-v1',
});
const SECRET = 'service-role-SECRET-should-never-leak';
function deps(over: Partial<HandlerDeps> = {}, env: Record<string, string> = {}) {
  const rows: ScoreRow[] = [];
  const insert = vi.fn((r: ScoreRow) => {
    if (rows.some((x) => x.game_hash === r.game_hash)) return Promise.resolve('duplicate' as const);
    rows.push(r);
    return Promise.resolve('ok' as const);
  });
  const all = { SCORE_HASH_PEPPER: 'pepper-1', SUPABASE_SERVICE_ROLE_KEY: SECRET, ...env };
  const d: HandlerDeps = { env: (k) => all[k as keyof typeof all], insert, limiter: memoryRateLimiter(100), ...over };
  return { d, rows, insert };
}
const post = (b: unknown, headers: Record<string, string> = {}) =>
  new Request('https://x.functions.supabase.co/submit-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof b === 'string' ? b : JSON.stringify(b),
  });
const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> });

describe('submit-score: yöntem, içerik türü, boyut, JSON', () => {
  it('geçerli gönderim → 201; satır normalize edilmiş takma ad ve tuzlu oyun özetiyle yazılır', async () => {
    const { d, rows } = deps();
    expect(await read(await handleSubmit(post(body()), d))).toEqual({ status: 201, body: { ok: true } });
    expect(rows).toEqual([
      {
        nickname: 'Ferah Nefes',
        score: 4321,
        lines: 23,
        level: 3,
        duration_seconds: 245,
        game_hash: await sha256Hex('game:pepper-1:3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'),
        client_version: 'web-ns4-18',
        ruleset: 'cyclamen-flow-v1',
      },
    ]);
    // ham oyun kimliği, IP veya user-agent saklanmaz
    expect(JSON.stringify(rows)).not.toMatch(/3f2b8c1e|ip|agent/i);
  });
  it('OPTIONS ön kontrol 204 + CORS başlıkları', async () => {
    const { d } = deps();
    const r = await handleSubmit(new Request('https://x/submit-score', { method: 'OPTIONS' }), d);
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
  });
  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('%s → 405', async (method) => {
    const { d, insert } = deps();
    const r = await handleSubmit(new Request('https://x/submit-score', { method }), d);
    expect(await read(r)).toEqual({ status: 405, body: { ok: false, error: 'method' } });
    expect(insert).not.toHaveBeenCalled();
  });
  it.each(['text/plain', 'application/x-www-form-urlencoded', ''])('Content-Type %j → 415', async (ct) => {
    const { d } = deps();
    const r = await handleSubmit(post(body(), { 'Content-Type': ct }), d);
    expect(r.status).toBe(415);
  });
  it('application/json; charset=utf-8 kabul edilir', async () => {
    const { d } = deps();
    expect((await handleSubmit(post(body(), { 'Content-Type': 'application/json; charset=utf-8' }), d)).status).toBe(
      201,
    );
  });
  it('büyük gövde → 413 (beyan edilen ve gerçek boyut)', async () => {
    const { d, insert } = deps();
    const big = JSON.stringify({ ...body(), pad: 'x'.repeat(MAX_BODY_BYTES) });
    expect((await handleSubmit(post(big), d)).status).toBe(413);
    expect((await handleSubmit(post(big, { 'Content-Length': '10' }), d)).status).toBe(413);
    expect(insert).not.toHaveBeenCalled();
  });
  it('bozuk JSON → 400', async () => {
    const { d } = deps();
    expect(await read(await handleSubmit(post('{"score":'), d))).toEqual({
      status: 400,
      body: { ok: false, error: 'json' },
    });
  });
});

describe('submit-score: alan doğrulama ve makullük (istemciye körü körüne güvenilmez)', () => {
  it.each([
    ['takma ad HTML', { nickname: '<img src=x>' }, 'nickname'],
    ['takma ad görünmez karakter', { nickname: 'ab​cd' }, 'nickname'],
    ['negatif skor', { score: -10 }, 'score'],
    ['metin skor', { score: '9999' }, 'score'],
    ['Infinity (JSON null olur)', { score: Number.POSITIVE_INFINITY }, 'score'],
    ['NaN (JSON null olur)', { lines: Number.NaN }, 'lines'],
    ['1e309 (Infinity)', '1e309', 'score'],
    ['seviye satırla tutarsız', { level: 20 }, 'implausible'],
    ['imkânsız skor', { score: 9_000_000, lines: 1, level: 1, durationSeconds: 1 }, 'implausible'],
    ['fazla alan', { userAgent: 'x' }, 'fields'],
  ])('%s → 422', async (_n, patch, field) => {
    const { d, insert } = deps();
    const b =
      patch === '1e309'
        ? JSON.stringify(body()).replace('"score":4321', '"score":1e309')
        : { ...body(), ...(patch as Record<string, unknown>) };
    expect(await read(await handleSubmit(post(b), d))).toEqual({
      status: 422,
      body: { ok: false, error: 'invalid', field },
    });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('submit-score: tekrar, hız sınırı, origin, hata gizliliği', () => {
  it('aynı oyun ikinci kez → 409 (tuzlu özet benzersiz)', async () => {
    const { d, rows } = deps();
    expect((await handleSubmit(post(body()), d)).status).toBe(201);
    expect(await read(await handleSubmit(post({ ...body(), nickname: 'Baska Ad' }), d))).toEqual({
      status: 409,
      body: { ok: false, error: 'duplicate' },
    });
    expect(rows).toHaveLength(1);
  });
  it('hız sınırı: aynı istemciden pencere içinde fazla istek → 429; farklı istemci etkilenmez', async () => {
    const { d } = deps({ limiter: memoryRateLimiter(2, 60_000) });
    const ip = { 'X-Forwarded-For': '203.0.113.7' };
    const id = (n: number) => `3f2b8c1e-9a4d-4e6f-8b2a-${String(n).padStart(12, '0')}`;
    expect((await handleSubmit(post({ ...body(), gameId: id(1) }, ip), d)).status).toBe(201);
    expect((await handleSubmit(post({ ...body(), gameId: id(2) }, ip), d)).status).toBe(201);
    expect(await read(await handleSubmit(post({ ...body(), gameId: id(3) }, ip), d))).toEqual({
      status: 429,
      body: { ok: false, error: 'rate_limited' },
    });
    expect(
      (await handleSubmit(post({ ...body(), gameId: id(4) }, { 'X-Forwarded-For': '198.51.100.2' }), d)).status,
    ).toBe(201);
  });
  it('kayan pencere zamanla açılır', () => {
    const l = memoryRateLimiter(1, 1000);
    expect(l.allow('k', 0)).toBe(true);
    expect(l.allow('k', 500)).toBe(false);
    expect(l.allow('k', 1500)).toBe(true);
  });
  it('ALLOWED_ORIGINS: yalnızca listedeki origin; diğerleri 403', async () => {
    expect(originAllowed('https://oyun.example', undefined)).toBe(true);
    expect(originAllowed(null, '')).toBe(true);
    expect(originAllowed('https://oyun.example', 'https://oyun.example, https://x.example')).toBe(true);
    expect(originAllowed('https://evil.example', 'https://oyun.example')).toBe(false);
    expect(originAllowed(null, 'https://oyun.example')).toBe(false);
    const { d } = deps({}, { ALLOWED_ORIGINS: 'https://oyun.example' });
    const ok = await handleSubmit(post(body(), { Origin: 'https://oyun.example' }), d);
    expect(ok.status).toBe(201);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://oyun.example');
    expect((await handleSubmit(post(body(), { Origin: 'https://evil.example' }), d)).status).toBe(403);
  });
  it('veritabanı hatası → 500 genel kod; secret, yığın veya iç ayrıntı dönmez', async () => {
    const { d } = deps({
      insert: () => Promise.reject(new Error(`connection failed for key ${SECRET} at db.internal:5432`)),
    });
    const r = await handleSubmit(post(body()), d);
    const text = await r.text();
    expect(r.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ ok: false, error: 'server' });
    expect(text).not.toMatch(/SECRET|db\.internal|connection|pepper/i);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
});
