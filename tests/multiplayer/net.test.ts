// Çok oyunculu taşıma katmanı: sunucu üyeliği (sahte tetris-room), Realtime (bellekte Presence + Broadcast) ve
// gerçek WebCrypto imzaları. Saldırgan iletileri kanala doğrudan enjekte edilir. Gerçek projeye bağlanılmaz.
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HEARTBEAT_MS, NET_TEXT, RATE, createNet, type Incoming } from '../../src/multiplayer/net';
import {
  MAX_ENVELOPE_CHARS,
  NO_ROUND,
  PROTOCOL_VERSION,
  signedText,
  type Unsigned,
} from '../../src/multiplayer/protocol';
import type { ApiResult, Joined, Member, RoomApi } from '../../src/multiplayer/roomApi';
import { generateIdentity, sign, type PublicKeyParts } from '../../supabase/functions/_shared/sign.ts';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('zaman aşımı');
    await wait(5);
  }
}

/* ---------- sahte Realtime ---------- */
type Cb = (p: Record<string, unknown>) => void;
interface Chan {
  topic: string;
  key: string;
  tracked: boolean;
  handlers: { type: string; event: string; cb: Cb }[];
  status: ((s: string) => void) | null;
  removed: boolean;
}
function hub() {
  const chans: Chan[] = [];
  /** Kanala yayınlanan bütün zarflar (tur kimliğini okumak için). */
  const sent: Record<string, unknown>[] = [];
  const peers = (topic: string) => chans.filter((c) => c.topic === topic && !c.removed);
  const emit = (c: Chan, type: string, event: string, p: Record<string, unknown> = {}) =>
    setTimeout(() => {
      if (!c.removed) for (const h of c.handlers) if (h.type === type && h.event === event) h.cb(p);
    }, 1);
  const sync = (topic: string) => peers(topic).forEach((c) => emit(c, 'presence', 'sync'));
  const drop = (c: Chan) => {
    if (!c.tracked) return;
    c.tracked = false;
    for (const o of peers(c.topic)) if (o !== c) emit(o, 'presence', 'leave', { key: c.key, currentPresences: [] });
    sync(c.topic);
  };
  const raw = {
    channel(topic: string, opts: { config: { presence: { key: string } } }) {
      const c: Chan = {
        topic: 'realtime:' + topic,
        key: opts.config.presence.key,
        tracked: false,
        handlers: [],
        status: null,
        removed: false,
      };
      chans.push(c);
      const api = {
        topic: c.topic,
        on(type: string, f: { event: string }, cb: Cb) {
          c.handlers.push({ type, event: f.event, cb });
          return api;
        },
        subscribe(cb: (s: string) => void) {
          c.status = cb;
          setTimeout(() => cb('SUBSCRIBED'), 1);
          return api;
        },
        presenceState: () =>
          Object.fromEntries(
            peers(c.topic)
              .filter((x) => x.tracked)
              .map((x) => [x.key, [{}]]),
          ),
        track() {
          c.tracked = true;
          sync(c.topic);
          return Promise.resolve('ok');
        },
        untrack() {
          drop(c);
          return Promise.resolve('ok');
        },
        send(m: { payload: Record<string, unknown> }) {
          sent.push(m.payload);
          for (const o of peers(c.topic)) if (o !== c) emit(o, 'broadcast', 'msg', { payload: m.payload });
          return Promise.resolve('ok');
        },
        _c: c,
      };
      return api;
    },
    getChannels: () => [],
    removeChannel: vi.fn((ch: { _c: Chan }) => {
      drop(ch._c);
      ch._c.removed = true;
      return Promise.resolve('ok');
    }),
  };
  /** Saldırgan / ham yayın: kanaldaki herkese doğrudan. */
  const inject = (topic: string, payload: unknown) =>
    peers('realtime:' + topic).forEach((o) => emit(o, 'broadcast', 'msg', { payload }));
  const live = (key: string) => chans.filter((c) => c.key === key && !c.removed);
  return {
    db: raw as unknown as SupabaseClient,
    raw,
    sent,
    inject,
    /** Bağlantı kopması (Presence kaydı düşer) ve kütüphanenin yeniden bağlanması. */
    disconnect: (key: string) => live(key).forEach(drop),
    reconnect: (key: string) => live(key).forEach((c) => c.status?.('SUBSCRIBED')),
    close: (key: string) => live(key).forEach((c) => c.status?.('CLOSED')),
  };
}

/* ---------- sahte oda sunucusu (tetris-room kuralları: en çok 3, benzersiz renk) ---------- */
function server() {
  const rooms = new Map<string, { id: string; members: Member[] }>();
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const leaves: string[] = [];
  const byId = (id: string) => [...rooms.values()].find((x) => x.id === id);
  const add = (r: { id: string; members: Member[] }, name: string, pub: PublicKeyParts, code: string) => {
    const used = new Set(r.members.map((m) => m.color));
    const color = [0, 1, 2].find((c) => !used.has(c)) ?? 0;
    const id = uuid();
    r.members.push({ id, name, color, x: pub.x, y: pub.y, joinedAt: n });
    const res: ApiResult<Joined> = {
      ok: true,
      value: { code, roomId: r.id, playerId: id, color, roster: [...r.members] },
    };
    return res;
  };
  const api: RoomApi = {
    create: (name, pub) => {
      const code = `K${rooms.size}AA`.slice(0, 4);
      const r = { id: uuid(), members: [] };
      rooms.set(code, r);
      return Promise.resolve(add(r, name, pub, code));
    },
    join: (code, name, pub) => {
      const r = rooms.get(code);
      if (!r || !r.members.length) return Promise.resolve({ ok: false, reason: 'not_found' });
      if (r.members.length >= 3) return Promise.resolve({ ok: false, reason: 'full' });
      return Promise.resolve(add(r, name, pub, code));
    },
    roster: (roomId) => Promise.resolve({ ok: true, value: [...(byId(roomId)?.members ?? [])] }),
    leave: (roomId, playerId) => {
      leaves.push(playerId);
      const r = byId(roomId);
      if (r) r.members = r.members.filter((m) => m.id !== playerId);
      return Promise.resolve();
    },
  };
  return { api, rooms, leaves };
}

function world() {
  const h = hub(),
    s = server();
  const keys = new Map<string, CryptoKey>(); // açık anahtar x → özel anahtar (test, üyenin adına imzalayabilsin)
  const identity = async () => {
    const id = await generateIdentity();
    keys.set(id.pub.x, id.privateKey);
    return id;
  };
  const win = { addEventListener: vi.fn() };
  function client() {
    const net = createNet({ load: () => Promise.resolve(h.db), api: s.api, identity, win });
    const got: Incoming[] = [];
    net.on((m) => got.push(m));
    const last = <T extends Incoming['t']>(t: T) =>
      [...got].reverse().find((m) => m.t === t) as Extract<Incoming, { t: T }> | undefined;
    const all = <T extends Incoming['t']>(t: T) => got.filter((m) => m.t === t) as Extract<Incoming, { t: T }>[];
    return { net, got, last, all };
  }
  const keyOf = (playerId: string): CryptoKey => {
    for (const r of s.rooms.values()) {
      const m = r.members.find((x) => x.id === playerId);
      const k = m && keys.get(m.x);
      if (k) return k;
    }
    throw new Error('anahtar yok');
  };
  /** Kanalda en son başlatılan turun kimliği (ev sahibinin start zarfı). */
  const roundId = () => {
    const r = [...h.sent].reverse().find((e) => e['type'] === 'start')?.['round'];
    return typeof r === 'string' ? r : '';
  };
  return { h, s, client, keyOf, roundId, win };
}
type World = ReturnType<typeof world>;
type Client = ReturnType<World['client']>;

async function room(w: World, n: number) {
  const cs: Client[] = [];
  const a = w.client();
  a.net.send({ t: 'create', name: 'Oyuncu A' });
  await until(() => !!a.last('room'));
  cs.push(a);
  const code = a.last('room')?.code ?? '';
  for (let i = 1; i < n; i++) {
    const c = w.client();
    c.net.send({ t: 'join', code, name: `Oyuncu ${'ABC'[i] ?? ''}` });
    await until(() => !!c.last('room'));
    cs.push(c);
  }
  const count = (c: Client) => (c.last('players') ?? c.last('room'))?.players.length;
  await until(() => cs.every((c) => count(c) === n));
  const ids = cs.map((c) => c.last('room')?.you ?? '');
  const roomId = [...w.s.rooms.values()][0]?.id ?? '';
  return { cs, ids, code, roomId, topic: `tetris:room:${roomId}` };
}
async function started(n = 2) {
  const w = world();
  const r = await room(w, n);
  r.cs[0]?.net.send({ t: 'start' });
  await until(() => r.cs.every((c) => !!c.last('start')));
  return { w, ...r };
}
/** İmzalı zarf; `override` imzadan sonra alanları değiştirir (sahte ileti). */
async function envelope(key: CryptoKey, e: Unsigned, override: Record<string, unknown> = {}) {
  return { ...e, sig: await sign(key, signedText(e)), ...override };
}
const st = (s = 100) => ({ b: '0'.repeat(200), s, l: 0, lv: 1, r: 0 });

describe('oda: kurma, katılma, üyelik sunucuda', () => {
  it('2 ve 3 oyuncu: herkes aynı ev sahibini ve aynı listeyi görür; renkler benzersiz (sunucu)', async () => {
    const w = world();
    const { cs } = await room(w, 3);
    for (const c of cs) {
      const l = c.last('players') ?? c.last('room');
      expect(l?.host).toBe(cs[0]?.last('room')?.you);
      expect(l?.players.map((p) => p.name)).toEqual(['Oyuncu A', 'Oyuncu B', 'Oyuncu C']);
      expect(new Set(l?.players.map((p) => p.color)).size).toBe(3);
    }
  });
  it('dördüncü oyuncu, yanlış kod, hız sınırı: sunucunun reddi oyuncuya iletilir', async () => {
    const w = world();
    const { code } = await room(w, 3);
    const d = w.client();
    d.net.send({ t: 'join', code, name: 'Oyuncu D' });
    await until(() => !!d.last('error'));
    expect(d.last('error')?.msg).toBe(NET_TEXT.full);
    const e = w.client();
    e.net.send({ t: 'join', code: 'ZZZZ', name: 'Oyuncu E' });
    await until(() => !!e.last('error'));
    expect(e.last('error')?.msg).toBe(NET_TEXT.notFound);
    const limited = createNet({
      load: () => Promise.resolve(w.h.db),
      api: { ...w.s.api, join: () => Promise.resolve({ ok: false, reason: 'rate_limited' }) },
    });
    const got: Incoming[] = [];
    limited.on((m) => got.push(m));
    limited.send({ t: 'join', code, name: 'Oyuncu F' });
    await until(() => got.length > 0);
    expect(got[0]).toEqual({ t: 'error', msg: NET_TEXT.rateLimited });
  });
  it('Supabase SDK yüklenemezse: hata; üyelik sunucuda bırakılır (yer tutmaz)', async () => {
    const w = world();
    const net = createNet({ load: () => Promise.resolve(null), api: w.s.api });
    const got: Incoming[] = [];
    net.on((m) => got.push(m));
    net.send({ t: 'create', name: 'Oyuncu A' });
    await until(() => got.length > 0);
    expect(got[0]).toEqual({ t: 'error', msg: NET_TEXT.unavailable });
    expect(w.s.leaves).toHaveLength(1);
  });
  it('yapılandırma yoksa kapalı', async () => {
    const net = createNet({ load: () => Promise.resolve(null), api: null });
    const got: Incoming[] = [];
    net.on((m) => got.push(m));
    expect(net.enabled).toBe(false);
    net.send({ t: 'create', name: 'Oyuncu A' });
    await until(() => got.length > 0);
    expect(got[0]).toEqual({ t: 'error', msg: NET_TEXT.unavailable });
  });
});

describe('imzalı iletiler: kimlik, sıra, tur', () => {
  it('yalnızca ev sahibi başlatır; herkes aynı tohumu ve oyuncuları alır', async () => {
    const w = world();
    const { cs, ids } = await room(w, 2);
    cs[1]?.net.send({ t: 'start' }); // ev sahibi değil
    await wait(60);
    expect(cs[0]?.last('start')).toBeUndefined();
    cs[0]?.net.send({ t: 'start' });
    await until(() => cs.every((c) => !!c.last('start')));
    expect(cs[1]?.last('start')).toEqual(cs[0]?.last('start'));
    expect(cs[0]?.last('start')?.ids).toEqual(ids);
  });
  it('ev sahibi olmayan üyenin imzalı sahte "start" iletisi yok sayılır', async () => {
    const w = world();
    const { cs, ids, roomId, topic } = await room(w, 2);
    const b = ids[1] ?? '';
    const e: Unsigned = {
      v: PROTOCOL_VERSION,
      room: roomId,
      round: crypto.randomUUID(),
      player: b,
      seq: 99,
      type: 'start',
      payload: { n: 1, seed: 5, in: 0, ids },
    };
    w.h.inject(topic, await envelope(w.keyOf(b), e));
    await wait(100);
    expect(cs[0]?.last('start')).toBeUndefined();
  });
  it('kimliğe bürünme: B, A adına imzalarsa / geçersiz imza / üye olmayan anahtar → yok sayılır', async () => {
    const { w, cs, ids, roomId, topic } = await started();
    const [a = '', b = ''] = ids;
    const round = w.roundId();
    const base = (player: string, seq: number): Unsigned => ({
      v: PROTOCOL_VERSION,
      room: roomId,
      round,
      player,
      seq,
      type: 'st',
      payload: st(777),
    });
    const stranger = await generateIdentity();
    w.h.inject(topic, await envelope(w.keyOf(b), base(a, 50))); // B'nin anahtarı, A'nın kimliği
    w.h.inject(topic, { ...base(b, 51), sig: 'A'.repeat(86) }); // geçersiz imza
    w.h.inject(topic, await envelope(stranger.privateKey, base(b, 52))); // üye olmayan anahtar
    await wait(120);
    for (const c of cs) expect(c.all('st').filter((m) => m.s === 777)).toEqual([]);
    w.h.inject(topic, await envelope(w.keyOf(b), base(b, 53))); // gerçek imza: kabul
    await until(() => !!cs[0]?.all('st').some((m) => m.s === 777 && m.from === b));
  });
  it('tekrarlanan ve sırası eski ileti yok sayılır; yanlış tur kimliği yok sayılır', async () => {
    const { w, cs, ids, roomId, topic } = await started();
    const b = ids[1] ?? '';
    const round = w.roundId();
    const mk = (seq: number, s: number, r = round): Unsigned => ({
      v: PROTOCOL_VERSION,
      room: roomId,
      round: r,
      player: b,
      seq,
      type: 'st',
      payload: st(s),
    });
    const e1 = await envelope(w.keyOf(b), mk(1000, 501));
    w.h.inject(topic, e1);
    await until(() => !!cs[0]?.all('st').some((m) => m.s === 501));
    w.h.inject(topic, e1); // tekrar
    w.h.inject(topic, await envelope(w.keyOf(b), mk(999, 502))); // eski sıra
    w.h.inject(topic, await envelope(w.keyOf(b), mk(1001, 503, crypto.randomUUID()))); // başka tur
    w.h.inject(topic, await envelope(w.keyOf(b), mk(1002, 504, NO_ROUND))); // tur dışı canlı durum
    await wait(120);
    expect(
      cs[0]
        ?.all('st')
        .filter((m) => m.s >= 501)
        .map((m) => m.s),
    ).toEqual([501]);
  });
  it('bilinmeyen tür, fazla alan, büyük yük, başka sürüm ya da başka oda reddedilir', async () => {
    const { w, cs, ids, roomId, topic } = await started();
    const b = ids[1] ?? '';
    const e: Unsigned = {
      v: PROTOCOL_VERSION,
      room: roomId,
      round: w.roundId(),
      player: b,
      seq: 2000,
      type: 'st',
      payload: st(601),
    };
    const good = await envelope(w.keyOf(b), e);
    w.h.inject(topic, { ...good, type: 'kick' });
    w.h.inject(topic, { ...good, extra: 1 });
    w.h.inject(topic, { ...good, payload: { ...good.payload, x: 'y'.repeat(MAX_ENVELOPE_CHARS) } });
    w.h.inject(topic, { ...good, v: 2 });
    w.h.inject(topic, await envelope(w.keyOf(b), { ...e, room: crypto.randomUUID(), seq: 2001 }));
    await wait(120);
    expect(cs[0]?.all('st').some((m) => m.s === 601)).toBe(false);
  });
  it('hız sınırı: art arda 100 ileti → en çok kova kadarı işlenir', async () => {
    const { w, cs, ids, roomId, topic } = await started();
    const b = ids[1] ?? '';
    const round = w.roundId();
    const key = w.keyOf(b);
    const msgs = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        envelope(key, {
          v: PROTOCOL_VERSION,
          room: roomId,
          round,
          player: b,
          seq: 5000 + i,
          type: 'st',
          payload: st(10_000 + i),
        }),
      ),
    );
    for (const m of msgs) w.h.inject(topic, m);
    await wait(600);
    const n = cs[0]?.all('st').filter((m) => m.s >= 10_000).length ?? 0;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(RATE.burst + 2);
  });
  it('bitti: herkese bir kez (ikinci "fin" yok sayılır); ara verme yalnızca durum değişince', async () => {
    const { cs, ids } = await started();
    cs[1]?.net.send({ t: 'fin', score: 300, lines: 2, level: 1 });
    cs[1]?.net.send({ t: 'fin', score: 9999, lines: 2, level: 1 });
    await until(() => cs.every((c) => c.all('fin').length === 1));
    await wait(60);
    expect(cs.map((c) => c.all('fin').length)).toEqual([1, 1]);
    expect(cs[0]?.last('fin')).toEqual({ t: 'fin', from: ids[1], score: 300, lines: 2, level: 1 });
    cs[0]?.net.send({ t: 'away', on: true });
    cs[0]?.net.send({ t: 'away', on: true });
    cs[0]?.net.send({ t: 'away', on: false });
    await until(() => cs[1]?.all('away').length === 2);
    await wait(60);
    expect(cs[1]?.all('away').map((m) => m.on)).toEqual([true, false]);
  });
});

describe('ayrılma, yeniden bağlanma, temizlik', () => {
  it('ev sahibi ayrılınca sıradaki devralır; ayrılan sunucudan çıkar, kanalı kaldırılır, artık ileti almaz', async () => {
    const w = world();
    const { cs, ids } = await room(w, 3);
    cs[0]?.net.send({ t: 'leave' });
    await until(() =>
      cs.slice(1).every((c) => c.last('players')?.host === ids[1] && c.last('players')?.players.length === 2),
    );
    expect(w.s.leaves).toContain(ids[0]);
    expect(w.h.raw.removeChannel).toHaveBeenCalled();
    expect(cs[0]?.net.open).toBe(false);
    const before = cs[0]?.got.length;
    cs[1]?.net.send({ t: 'start' });
    await until(() => !!cs[2]?.last('start'));
    await wait(60);
    expect(cs[0]?.got.length).toBe(before);
  });
  it('bağlantı kopup geri gelince oyuncu yeniden görünür (hayalet kalmaz, çift sayılmaz)', async () => {
    const w = world();
    const { cs, ids } = await room(w, 2);
    w.h.disconnect(ids[1] ?? '');
    await until(() => cs[0]?.last('players')?.players.length === 1);
    w.h.reconnect(ids[1] ?? '');
    await until(() => cs[0]?.last('players')?.players.length === 2);
    expect(cs[0]?.last('players')?.players.map((p) => p.id)).toEqual(ids);
  });
  it('kanal kapanınca (CLOSED) "bağlantı koptu" ve sunucudan çıkılır; sayfa kapanınca (pagehide) da', async () => {
    const w = world();
    const { cs, ids } = await room(w, 2);
    w.h.close(ids[1] ?? '');
    await until(() => !!cs[1]?.last('closed'));
    expect(w.s.leaves).toContain(ids[1]);
    const hides = w.win.addEventListener.mock.calls.filter((c) => c[0] === 'pagehide').map((c) => c[1] as () => void);
    for (const f of hides) f();
    expect(w.s.leaves).toContain(ids[0]);
    expect(cs[0]?.net.open).toBe(false);
  });
  it('nabız aralığı sunucunun 75 sn eşiğinin en az üçte biri kadar sık', () => {
    expect(HEARTBEAT_MS * 3).toBeLessThan(75_000);
  });
});
