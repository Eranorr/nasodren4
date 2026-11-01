// Global skor istemcisi: okuma RPC, yazma Edge Function (yalnızca fetch). Ağ taklit edilir; gerçek projeye bağlanılmaz.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT_VERSION,
  READ_RPC,
  ROOM_FUNCTION,
  ROOM_TOPIC,
  SUBMIT_FUNCTION,
  leaderboardConfigFrom,
} from '../../src/leaderboard/config';
import { createLeaderboardClient } from '../../src/leaderboard/globalClient';
import { RULESET } from '../../supabase/functions/_shared/scoreRules.ts';

const CFG = { url: 'https://abcd.supabase.co', key: 'sb_publishable_testkey' };
const sub = {
  gameId: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
  nickname: '  Ferah   Nefes ',
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

describe('ortam değişkenleri (ortak proje, önek tetris)', () => {
  it('adlar: tablo yerine RPC ve Edge Function; oda kanalı öneki', () => {
    expect([READ_RPC, SUBMIT_FUNCTION, ROOM_FUNCTION, ROOM_TOPIC]).toEqual([
      'tetris_get_leaderboard',
      'tetris-submit-score',
      'tetris-room',
      'tetris:room:',
    ]);
  });
  it('anahtar adı VITE_SUPABASE_PUBLISHABLE_KEY; eski ANON adı yalnızca geçici uyumluluk', () => {
    const u = 'https://abcd.supabase.co';
    expect(leaderboardConfigFrom({ VITE_SUPABASE_URL: u, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_a' })).toEqual({
      url: u,
      key: 'sb_publishable_a',
    });
    expect(leaderboardConfigFrom({ VITE_SUPABASE_URL: u, VITE_SUPABASE_ANON_KEY: 'sb_publishable_b' })?.key).toBe(
      'sb_publishable_b',
    );
    expect(
      leaderboardConfigFrom({
        VITE_SUPABASE_URL: u,
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_a',
        VITE_SUPABASE_ANON_KEY: 'sb_publishable_b',
      })?.key,
    ).toBe('sb_publishable_a');
  });
  it('eksik / geçersiz URL veya anahtar → kapalı', () => {
    expect(leaderboardConfigFrom({})).toBeNull();
    expect(leaderboardConfigFrom({ VITE_SUPABASE_URL: 'https://abcd.supabase.co' })).toBeNull();
    expect(leaderboardConfigFrom({ VITE_SUPABASE_URL: 'abcd', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull();
    expect(
      leaderboardConfigFrom({ VITE_SUPABASE_URL: 'http://abcd.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' }),
    ).toBeNull();
  });
  it('yanlışlıkla verilen service role / secret anahtar reddedilir', () => {
    const u = 'https://abcd.supabase.co/';
    expect(leaderboardConfigFrom({ VITE_SUPABASE_URL: u, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toBeNull();
    expect(
      leaderboardConfigFrom({ VITE_SUPABASE_URL: u, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') }),
    ).toBeNull();
  });
  it('testlerde env okunmaz: istemci devre dışı, SDK yüklenmez', async () => {
    const { leaderboardConfig } = await import('../../src/leaderboard/config');
    const { loadSupabase, SUPABASE_OK } = await import('../../src/supabase');
    expect([leaderboardConfig, SUPABASE_OK, await loadSupabase()]).toEqual([null, false, null]);
    const c = createLeaderboardClient(null);
    expect(c.enabled).toBe(false);
    expect(await c.fetchTop()).toEqual({ ok: false, reason: 'disabled' });
    expect(await c.submit(sub)).toEqual({ ok: false, reason: 'disabled' });
  });
});

describe('global okuma (RPC)', () => {
  it('güncel kural setinin ilk 10u; yalnızca apikey; bozuk satırlar atlanır', async () => {
    const f = vi.fn((_u: string | URL | Request, _i?: RequestInit) =>
      Promise.resolve(
        res(200, [
          { id: 7, rank: 1, name: 'Ferah', score: 9000, lines: 40, level: 5 },
          { id: 8, rank: 2, name: '<b>x</b>', score: 8000, lines: 30, level: 4 },
          { id: 9, rank: 3, name: 'Nefes', score: 7000, lines: 30, level: 4, extra: 'yok sayılır' },
        ]),
      ),
    );
    const r = await createLeaderboardClient(CFG, { fetch: f }).fetchTop(25);
    expect(r).toEqual({
      ok: true,
      entries: [
        { id: 7, rank: 1, nickname: 'Ferah', score: 9000, lines: 40, level: 5 },
        { id: 9, rank: 3, nickname: 'Nefes', score: 7000, lines: 30, level: 4 },
      ],
    });
    const [url, init] = f.mock.calls[0] ?? [];
    expect(url).toBe(
      `https://abcd.supabase.co/rest/v1/rpc/tetris_get_leaderboard?limit_count=10&ruleset_name=${RULESET}`,
    );
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({ apikey: 'sb_publishable_testkey', Accept: 'application/json' });
    expect(init?.credentials).toBe('omit');
  });
  it('hata, ağ hatası, çevrimdışı, 10 sn zaman aşımı', async () => {
    expect(await createLeaderboardClient(CFG, { fetch: () => Promise.resolve(res(500)) }).fetchTop()).toEqual({
      ok: false,
      reason: 'error',
    });
    expect(
      await createLeaderboardClient(CFG, { fetch: () => Promise.reject(new TypeError('Failed to fetch')) }).fetchTop(),
    ).toEqual({ ok: false, reason: 'offline' });
    const f = vi.fn();
    expect(await createLeaderboardClient(CFG, { fetch: f, online: () => false }).fetchTop()).toEqual({
      ok: false,
      reason: 'offline',
    });
    expect(f).not.toHaveBeenCalled();
    vi.useFakeTimers();
    const hang = (_u: string | URL | Request, i?: RequestInit) =>
      new Promise<Response>((_, no) => i?.signal?.addEventListener('abort', () => no(new Error('abort'))));
    const p = createLeaderboardClient(CFG, { fetch: hang }).fetchTop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(await p).toEqual({ ok: false, reason: 'timeout' });
  });
});

describe('global gönderim (Edge Function)', () => {
  it('POST tetris-submit-score: tam gövde (sürüm, kural seti), tabloya doğrudan yazma yok; sıra döner', async () => {
    const f = vi.fn((_u: string | URL | Request, _i?: RequestInit) =>
      Promise.resolve(res(201, { ok: true, id: 42, rank: 12 })),
    );
    const r = await createLeaderboardClient(CFG, { fetch: f }).submit(sub);
    expect(r).toEqual({
      ok: true,
      entry: { id: 42, rank: 12, nickname: 'Ferah Nefes', score: 4321, lines: 23, level: 3 },
    });
    const [url, init] = f.mock.calls[0] ?? [];
    expect(url).toBe('https://abcd.supabase.co/functions/v1/tetris-submit-score');
    expect(JSON.parse(init?.body as string)).toEqual({ ...sub, clientVersion: CLIENT_VERSION, ruleset: RULESET });
  });
  it.each([
    [409, 'duplicate'],
    [422, 'invalid'],
    [400, 'invalid'],
    [429, 'rate_limited'],
    [500, 'error'],
    [403, 'error'],
  ])('HTTP %i → %s', async (status, reason) => {
    const c = createLeaderboardClient(CFG, { fetch: () => Promise.resolve(res(status, { ok: false, error: 'x' })) });
    expect(await c.submit(sub)).toEqual({ ok: false, reason });
  });
  it('geçersiz gövde ağa gitmez (ad, aralık, seviye/satır, süre, oyun kimliği)', async () => {
    const f = vi.fn();
    const c = createLeaderboardClient(CFG, { fetch: f });
    for (const bad of [{ nickname: 'ab' }, { score: -1 }, { level: 9 }, { durationSeconds: 0 }, { gameId: 'x' }])
      expect(await c.submit({ ...sub, ...bad })).toEqual({ ok: false, reason: 'invalid' });
    expect(f).not.toHaveBeenCalled();
  });
});
