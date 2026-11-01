// NS4-18: global skor istemcisi. Ağ katmanı taklit edilir (gerçek Supabase'e bağlanılmaz).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaderboardConfigFrom } from '../../src/leaderboard/config';
import { createLeaderboardClient } from '../../src/leaderboard/globalClient';

const CFG = { url: 'https://abcd.supabase.co', key: 'sb_publishable_testkey' };
const payload = {
  gameId: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
  nickname: 'Ferah',
  score: 4321,
  lines: 23,
  level: 3,
  durationSeconds: 245,
};
const jwt = (role: string) => `x.${btoa(JSON.stringify({ role }))}.y`;
const res = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
afterEach(() => vi.useRealTimers());

describe('ortam değişkenleri', () => {
  it('eksik URL veya anahtar → devre dışı (null)', () => {
    expect(leaderboardConfigFrom({})).toBeNull();
    expect(leaderboardConfigFrom({ VITE_SUPABASE_URL: 'https://abcd.supabase.co' })).toBeNull();
    expect(leaderboardConfigFrom({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' })).toBeNull();
    expect(leaderboardConfigFrom({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_PUBLISHABLE_KEY: '  ' })).toBeNull();
  });
  it('geçersiz URL veya http (yerel dışı) → devre dışı', () => {
    expect(leaderboardConfigFrom({ VITE_SUPABASE_URL: 'abcd', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull();
    expect(
      leaderboardConfigFrom({ VITE_SUPABASE_URL: 'http://abcd.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' }),
    ).toBeNull();
    expect(
      leaderboardConfigFrom({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' }),
    ).toEqual({
      url: 'http://127.0.0.1:54321',
      key: 'k',
    });
  });
  it('yanlışlıkla verilen service role / secret anahtar reddedilir', () => {
    const u = 'https://abcd.supabase.co/';
    expect(leaderboardConfigFrom({ VITE_SUPABASE_URL: u, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toBeNull();
    expect(
      leaderboardConfigFrom({ VITE_SUPABASE_URL: u, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') }),
    ).toBeNull();
    expect(leaderboardConfigFrom({ VITE_SUPABASE_URL: u, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') })).toEqual({
      url: 'https://abcd.supabase.co',
      key: jwt('anon'),
    });
  });
  it('bu depoda env tanımlı değil: uygulama yapılandırması devre dışı', async () => {
    const { leaderboardConfig } = await import('../../src/leaderboard/config');
    expect(leaderboardConfig).toBeNull();
    const c = createLeaderboardClient(leaderboardConfig);
    expect(c.enabled).toBe(false);
    expect(await c.fetchTop()).toEqual({ ok: false, reason: 'disabled' });
    expect(await c.submit(payload)).toEqual({ ok: false, reason: 'disabled' });
  });
});

describe('global okuma', () => {
  it('başarı: RPC GET, yalnızca apikey (publishable), en çok 10, satırlar doğrulanır', async () => {
    const f = vi.fn((_u: string, _i?: RequestInit) =>
      Promise.resolve(
        res(200, [
          { rank: 1, nickname: 'Ferah', score: 9000, lines: 40, level: 5 },
          { rank: 2, nickname: '<b>x</b>', score: 8000, lines: 30, level: 4 }, // geçersiz ad: gösterilmez
          { rank: 3, nickname: 'Nefes', score: 7000, lines: 30, level: 4, extra: 'yok sayılır' },
        ]),
      ),
    );
    const c = createLeaderboardClient(CFG, { fetch: f as unknown as typeof fetch, online: () => true });
    const r = await c.fetchTop(25);
    expect(r).toEqual({
      ok: true,
      entries: [
        { rank: 1, nickname: 'Ferah', score: 9000, lines: 40, level: 5 },
        { rank: 3, nickname: 'Nefes', score: 7000, lines: 30, level: 4 },
      ],
    });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(
      'https://abcd.supabase.co/rest/v1/rpc/get_leaderboard?limit_count=10&ruleset_name=cyclamen-flow-v2',
    );
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({ apikey: 'sb_publishable_testkey', Accept: 'application/json' });
    expect(init?.credentials).toBe('omit');
  });
  it('eski anon (JWT) anahtar Authorization ile de gönderilir', async () => {
    const f = vi.fn((_u: string, _i?: RequestInit) => Promise.resolve(res(200, [])));
    const key = jwt('anon');
    await createLeaderboardClient(
      { ...CFG, key },
      { fetch: f as unknown as typeof fetch, online: () => true },
    ).fetchTop();
    expect(f.mock.calls[0][1]?.headers).toMatchObject({ apikey: key, Authorization: `Bearer ${key}` });
  });
  it('boş liste', async () => {
    const f = () => Promise.resolve(res(200, []));
    expect(await createLeaderboardClient(CFG, { fetch: f, online: () => true }).fetchTop()).toEqual({
      ok: true,
      entries: [],
    });
  });
  it.each([
    ['HTTP 500', () => Promise.resolve(res(500, { message: 'internal' })), 'error'],
    ['bozuk JSON', () => Promise.resolve(new Response('{x', { status: 200 })), 'error'],
    ['dizi değil', () => Promise.resolve(res(200, { rows: [] })), 'error'],
    ['ağ hatası', () => Promise.reject(new TypeError('Failed to fetch')), 'offline'],
  ])('hata: %s → %s', async (_n, f, reason) => {
    expect(await createLeaderboardClient(CFG, { fetch: f, online: () => true }).fetchTop()).toEqual({
      ok: false,
      reason,
    });
  });
  it('çevrimdışı (navigator.onLine false): istek atılmaz', async () => {
    const f = vi.fn();
    const r = await createLeaderboardClient(CFG, { fetch: f, online: () => false }).fetchTop();
    expect(r).toEqual({ ok: false, reason: 'offline' });
    expect(f).not.toHaveBeenCalled();
  });
  it('zaman aşımı: istek iptal edilir', async () => {
    vi.useFakeTimers();
    const f = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_r, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError'))),
      );
    const p = createLeaderboardClient(CFG, {
      fetch: f as typeof fetch,
      online: () => true,
      timeoutMs: 3000,
    }).fetchTop();
    await vi.advanceTimersByTimeAsync(3001);
    expect(await p).toEqual({ ok: false, reason: 'timeout' });
  });
});

describe('global gönderim', () => {
  it('başarı: Edge Function POST, gövde tam beklenen alanlar (tabloya doğrudan yazma yok)', async () => {
    const f = vi.fn((_u: string, _i?: RequestInit) => Promise.resolve(res(201, { ok: true })));
    const r = await createLeaderboardClient(CFG, { fetch: f as unknown as typeof fetch, online: () => true }).submit(
      payload,
    );
    expect(r).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://abcd.supabase.co/functions/v1/submit-score');
    expect(url).not.toMatch(/rest\/v1\/leaderboard_scores/);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ apikey: 'sb_publishable_testkey', 'Content-Type': 'application/json' });
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({
      ...payload,
      clientVersion: 'web-ns4-18',
      ruleset: 'cyclamen-flow-v2',
    });
  });
  it.each([
    [409, 'duplicate'],
    [422, 'invalid'],
    [400, 'invalid'],
    [429, 'rate_limited'],
    [500, 'error'],
    [403, 'error'],
  ])('HTTP %i → %s', async (status, reason) => {
    const f = () => Promise.resolve(res(status, { ok: false, error: 'x' }));
    expect(await createLeaderboardClient(CFG, { fetch: f, online: () => true }).submit(payload)).toEqual({
      ok: false,
      reason,
    });
  });
  it('geçersiz gövde istemcide durdurulur (ağa gitmez)', async () => {
    const f = vi.fn();
    const c = createLeaderboardClient(CFG, { fetch: f, online: () => true });
    expect(await c.submit({ ...payload, nickname: '<x>' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await c.submit({ ...payload, level: 9 })).toEqual({ ok: false, reason: 'invalid' });
    expect(f).not.toHaveBeenCalled();
  });
  it('zaman aşımı ve ağ hatası', async () => {
    vi.useFakeTimers();
    const hang = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort'))));
    const p = createLeaderboardClient(CFG, { fetch: hang as typeof fetch, online: () => true, timeoutMs: 1000 }).submit(
      payload,
    );
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toEqual({ ok: false, reason: 'timeout' });
    vi.useRealTimers();
    const fail = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await createLeaderboardClient(CFG, { fetch: fail, online: () => true }).submit(payload)).toEqual({
      ok: false,
      reason: 'offline',
    });
  });
  it('konsola anahtar veya gövde yazılmaz', async () => {
    const spies = (['log', 'info', 'debug', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const f = () => Promise.resolve(res(500));
    const c = createLeaderboardClient(CFG, { fetch: f, online: () => true });
    await c.submit(payload);
    await c.fetchTop();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
