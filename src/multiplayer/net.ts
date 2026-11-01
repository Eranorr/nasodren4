/* =====================================================================
   Çok oyunculu taşıma katmanı: sunucu tarafı oda üyeliği (Edge Function
   tetris-room) + Supabase Realtime (Presence + Broadcast) + imzalı iletiler.

   Güven modeli (docs/MULTIPLAYER.md, "Tehdit modeli"):
   - Üyelik sunucuda verilir: en çok 3 etkin üye, renk benzersiz, katılım hız
     sınırlı. Kod tek başına kanala erişim vermez; kanal adı tahmin edilemez
     oda kimliğinden türer (tetris:room:<uuid>) ve yalnız üyelere verilir.
   - Her ileti gönderenin oda anahtarıyla imzalıdır; doğrulayan, açık anahtarı
     sunucudaki üye listesinden alır. Üye olmayanın, imzasız ya da başka bir
     oyuncunun kimliğini taşıyan iletisi yok sayılır.
   - Sıra numarası (seq) gönderen başına artar: tekrarlanan / eski ileti yok sayılır.
     Her turun kimliği yenidir: eski turun iletileri yeni turda işlenmez.
   - Turu yalnızca ev sahibi (etkin ve bağlı üyelerden en erken katılan) başlatır.
   - Gönderen başına hız sınırı; zarf boyutu sınırlı; fazla / bilinmeyen alan reddedilir.
   - İstemci otoritesi: her oyuncu kendi tahtasını ve skorunu bildirir. Bu bir
     eğlence modudur, güvenilir rekabet değildir: tur sonuçları hiçbir kalıcı
     kayda (yerel liste, rekor, global tablo) yazılmaz.

   Presence yalnızca "bağlı mı" bilgisidir (anahtar = üye kimliği); ad, renk ve
   anahtar sunucudaki üye listesinden gelir. Görünen oyuncular = üye listesi ∩ bağlı.
   ===================================================================== */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { ROOM_TOPIC } from '../leaderboard/config';
import {
  generateIdentity,
  importPublicKey,
  sign,
  verify,
  type PublicKeyParts,
} from '../../supabase/functions/_shared/sign.ts';
import {
  NO_ROUND,
  PROTOCOL_VERSION,
  UUID_RE,
  parseEnvelope,
  signedText,
  type Envelope,
  type EventType,
  type Payloads,
  type Unsigned,
} from './protocol';
import type { ApiFail, Member, RoomApi } from './roomApi';

export const MAX_PLAYERS = 3;
/** Kanala bu sürede girilemezse vazgeç (ms); arada gelen hatalarda kütüphane kendisi yeniden dener. */
export const JOIN_TIMEOUT = 10000;
/** Tur başı geri sayımı (ms). */
export const START_IN = 4000;
/** Üye listesi yenileme ve sunucuya nabız (ms; sunucu 75 sn nabızsız üyeyi etkin saymaz). */
export const HEARTBEAT_MS = 20000;
/** Bilinmeyen bağlı kimlik görülünce üye listesi en sık bu aralıkla yenilenir (ms). */
export const ROSTER_MIN_MS = 2000;
/** Gönderen başına hız sınırı: kova (ileti) ve dolum (ileti/sn); ara verme ayrı ve daha sıkı. */
export const RATE = { burst: 30, perSecond: 15, awayBurst: 4, awayPerSecond: 0.5 } as const;

export const NET_TEXT = {
  unavailable: 'Çok oyunculu şu an kullanılamıyor.',
  connect: 'Sunucuya bağlanılamadı. İnternet bağlantını kontrol edip yeniden dene.',
  notFound: 'Bu kodla bir oda bulunamadı.',
  full: 'Oda dolu (en fazla 3 oyuncu).',
  enter: 'Odaya girilemedi. Yeniden dene.',
  rateLimited: 'Çok fazla deneme. Biraz sonra yeniden dene.',
} as const;

export interface Player {
  readonly id: string;
  readonly name: string;
  /** 0..2: oyuncu rengi (sunucuda benzersiz verilir). */
  readonly color: number;
  readonly away: boolean;
}

export type Outgoing =
  | { readonly t: 'create'; readonly name: string }
  | { readonly t: 'join'; readonly code: string; readonly name: string }
  | { readonly t: 'leave' }
  | { readonly t: 'start' }
  | ({ readonly t: 'st' } & Payloads['st'])
  | { readonly t: 'fin'; readonly score: number; readonly lines: number; readonly level: number }
  | { readonly t: 'away'; readonly on: boolean };

export type Incoming =
  | {
      readonly t: 'room';
      readonly code: string;
      readonly you: string;
      readonly host: string;
      readonly players: Player[];
      readonly round: number;
    }
  | { readonly t: 'players'; readonly host: string; readonly players: Player[]; readonly left?: string }
  | { readonly t: 'start'; readonly round: number; readonly seed: number; readonly in: number; readonly ids: string[] }
  | ({ readonly t: 'st'; readonly from: string } & Payloads['st'])
  | {
      readonly t: 'fin';
      readonly from: string;
      readonly score: number;
      readonly lines: number;
      readonly level: number;
    }
  | { readonly t: 'away'; readonly from: string; readonly on: boolean }
  | { readonly t: 'error'; readonly msg: string }
  | { readonly t: 'closed' };

export interface Net {
  readonly enabled: boolean;
  readonly open: boolean;
  on(fn: (m: Incoming) => void): void;
  send(m: Outgoing): void;
  close(): void;
}

export interface NetDeps {
  /** Supabase istemcisi (dinamik yüklenir; yüklenemezse null). */
  readonly load: () => Promise<SupabaseClient | null>;
  /** Oda üyeliği (Edge Function); yapılandırma yoksa null. */
  readonly api: RoomApi | null;
  readonly win?: Pick<Window, 'addEventListener'> | null;
  readonly identity?: () => Promise<{ readonly privateKey: CryptoKey; readonly pub: PublicKeyParts }>;
  readonly now?: () => number;
}

const FAIL_TEXT: Readonly<Record<ApiFail, string>> = {
  not_found: NET_TEXT.notFound,
  full: NET_TEXT.full,
  rate_limited: NET_TEXT.rateLimited,
  invalid: NET_TEXT.enter,
  forbidden: NET_TEXT.enter,
  offline: NET_TEXT.connect,
  timeout: NET_TEXT.connect,
  error: NET_TEXT.enter,
};

interface Me {
  readonly id: string;
  readonly roomId: string;
  readonly code: string;
  readonly key: CryptoKey;
}
interface Round {
  readonly id: string;
  readonly ids: Set<string>;
  readonly fin: Set<string>;
}

export function createNet({ load, api, win = null, identity = generateIdentity, now = Date.now }: NetDeps): Net {
  let handler: (m: Incoming) => void = () => {};
  let db: SupabaseClient | null = null;
  let channel: RealtimeChannel | null = null;
  let me: Me | null = null;
  let stage: 'idle' | 'joining' | 'tracked' | 'joined' = 'idle';
  /** Sunucudaki etkin üyeler ve doğrulama anahtarları. */
  let members = new Map<string, { readonly m: Member; readonly key: CryptoKey }>();
  /** Kanala bağlı üye kimlikleri (Presence anahtarları). */
  let present = new Set<string>();
  let round: Round | null = null;
  let seenRounds = new Set<string>();
  let away: Record<string, boolean> = {};
  let lastSeq = new Map<string, number>();
  let mySeq = 0;
  let lastRound = 0;
  let shown = 0;
  let buckets = new Map<string, { t: number; n: number; a: number }>();
  let queues = new Map<string, Promise<void>>();
  let sendChain: Promise<void> = Promise.resolve();
  let timers: ReturnType<typeof setTimeout>[] = [];
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let rosterAt = 0;
  let removing: Promise<unknown> = Promise.resolve();
  let attempt = 0;
  // kendi iletimiz de (start, fin) sunucudan gelmiş gibi, sırayla
  const deliver = (m: Incoming) => timers.push(setTimeout(() => handler(m), 0));

  /** Görünen oyuncular: üye listesi ∩ bağlı, katılış sırasıyla. */
  const visible = (): Member[] =>
    [...members.values()]
      .map((x) => x.m)
      .filter((m) => present.has(m.id))
      .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
  // tur, oyuncularından biri hâlâ bağlı, ara vermemiş ve bitirmemişken sürer
  function live(): boolean {
    if (!round) return false;
    const r = round,
      list = visible();
    if ([...r.ids].some((id) => list.some((q) => q.id === id) && !away[id] && !r.fin.has(id))) return true;
    round = null;
    return false;
  }
  // oyunun gördüğü oda: turu oynayan için tur sürerken yalnızca turun oyuncuları. Herkes aynı durumdan aynı ev sahibini bulur
  function roster(): { host: string; players: Player[] } {
    const all = visible(),
      r = round;
    const list = live() && me && r && r.ids.has(me.id) ? all.filter((p) => r.ids.has(p.id)) : all;
    return {
      host: all[0]?.id ?? '',
      players: list.map((p) => ({ id: p.id, name: p.name, color: p.color, away: !!away[p.id] })),
    };
  }
  function players(extra?: { left: string }) {
    const r = roster();
    shown = r.players.length;
    handler({ t: 'players', ...r, ...extra });
  }
  const recheck = () => {
    if (stage === 'joined' && roster().players.length !== shown) players();
  };

  async function setMembers(list: readonly Member[]) {
    const next = new Map<string, { m: Member; key: CryptoKey }>();
    for (const m of list) {
      const old = members.get(m.id);
      if (old && old.m.x === m.x && old.m.y === m.y) next.set(m.id, { m, key: old.key });
      else {
        const key = await importPublicKey({ x: m.x, y: m.y });
        if (key) next.set(m.id, { m, key });
      }
    }
    members = next;
  }
  async function refreshRoster() {
    const m = me;
    if (!m || !api) return;
    rosterAt = now();
    const r = await api.roster(m.roomId, m.id, m.key);
    if (me !== m) return;
    if (r.ok) {
      await setMembers(r.value);
      if (me === m && stage === 'joined') players();
    } else if (r.reason === 'forbidden') {
      // sunucu bizi artık üye saymıyor (ör. uzun uyku sonrası): oda bitti
      teardown();
      handler({ t: 'closed' });
    }
  }

  let rosterTimer: ReturnType<typeof setTimeout> | undefined;
  function rosterSoon() {
    if (rosterTimer !== undefined) return;
    const wait = Math.max(0, rosterAt + ROSTER_MIN_MS - now());
    rosterTimer = setTimeout(() => {
      rosterTimer = undefined;
      void refreshRoster();
    }, wait);
    timers.push(rosterTimer);
  }

  function teardown() {
    rosterTimer = undefined;
    const ch = channel;
    channel = null;
    me = null;
    stage = 'idle';
    members = new Map();
    present = new Set();
    round = null;
    seenRounds = new Set();
    away = {};
    lastSeq = new Map();
    lastRound = 0;
    buckets = new Map();
    queues = new Map();
    for (const t of timers) clearTimeout(t);
    timers = [];
    clearInterval(heartbeat);
    heartbeat = undefined;
    attempt++;
    if (ch && db) removing = db.removeChannel(ch).catch(() => {});
  }
  function leave() {
    const m = me,
      ch = channel;
    if (m && api) void api.leave(m.roomId, m.id, m.key).catch(() => {});
    if (ch) void ch.untrack().catch(() => {});
    teardown();
  }

  /** Gönderen başına kova: aşan ileti doğrulanmadan atılır (hızlı gönderim, ara verme spam'i). */
  function take(player: string, type: EventType): boolean {
    const t = now();
    const b = buckets.get(player) ?? { t, n: RATE.burst, a: RATE.awayBurst };
    const dt = (t - b.t) / 1000;
    b.t = t;
    b.n = Math.min(RATE.burst, b.n + dt * RATE.perSecond);
    b.a = Math.min(RATE.awayBurst, b.a + dt * RATE.awayPerSecond);
    buckets.set(player, b);
    if (b.n < 1 || (type === 'away' && b.a < 1)) return false;
    b.n -= 1;
    if (type === 'away') b.a -= 1;
    return true;
  }

  function apply(e: Envelope) {
    const p = e.player,
      m = me;
    if (!m) return;
    switch (e.type) {
      case 'start': {
        const host = visible()[0]?.id;
        if (p !== host || seenRounds.has(e.round) || e.round === NO_ROUND || live()) return;
        const ids = e.payload.ids;
        if (!ids.includes(p) || !ids.every((id) => members.has(id))) return;
        round = { id: e.round, ids: new Set(ids), fin: new Set() };
        seenRounds.add(e.round);
        lastRound = Math.max(lastRound, e.payload.n);
        if (!round.ids.has(m.id)) return; // tur bizi görmeden başladı: bitince sıradakine katılırız
        handler({ t: 'start', round: e.payload.n, seed: e.payload.seed, in: e.payload.in, ids: [...ids] });
        return;
      }
      case 'st':
        if (!round || e.round !== round.id || !round.ids.has(p) || !round.ids.has(m.id)) return;
        handler({ t: 'st', from: p, ...e.payload });
        return;
      case 'fin':
        if (!round || e.round !== round.id || !round.ids.has(p) || round.fin.has(p)) return;
        round.fin.add(p);
        if (round.ids.has(m.id))
          handler({ t: 'fin', from: p, score: e.payload.s, lines: e.payload.l, level: e.payload.lv });
        recheck();
        return;
      case 'away':
        // tur dışı ya da bilinen bir tur (biten turun kimliğiyle gelen "döndü" kaybolmasın); bilinmeyen tur yok sayılır
        if (e.round !== NO_ROUND && !seenRounds.has(e.round)) return;
        if (!!away[p] === e.payload.on) return; // değişmeyen durum (tekrar) bildirilmez
        away[p] = e.payload.on;
        if (!(round && !round.ids.has(m.id) && live())) handler({ t: 'away', from: p, on: e.payload.on });
        recheck();
        return;
    }
  }

  function receive(raw: unknown) {
    const m = me;
    if (stage !== 'joined' || !m) return;
    const e = parseEnvelope(raw);
    if (!e || e.room !== m.roomId || e.player === m.id) return;
    const mem = members.get(e.player);
    if (!mem || !take(e.player, e.type)) return;
    // gönderen başına sırayla doğrula: sırası bozulmuş / tekrarlanan ileti seq ile atılır
    const q = (queues.get(e.player) ?? Promise.resolve()).then(async () => {
      if (!(await verify(mem.key, signedText(e), e.sig)) || me !== m) return;
      if (e.seq <= (lastSeq.get(e.player) ?? 0)) return;
      lastSeq.set(e.player, e.seq);
      apply(e);
    });
    queues.set(
      e.player,
      q.catch(() => {}),
    );
  }

  function emit<T extends EventType>(type: T, payload: Payloads[T], roundId: string) {
    const m = me,
      ch = channel;
    if (!m || !ch) return;
    // tür ve yük, genel T üzerinden eşleşir (TypeScript ayrık birleşime daraltamaz)
    const fields: unknown = {
      v: PROTOCOL_VERSION,
      room: m.roomId,
      round: roundId,
      player: m.id,
      seq: ++mySeq,
      type,
      payload,
    };
    const env = fields as Unsigned;
    // imzalar sırayla: seq sırası korunur
    sendChain = sendChain
      .then(async () => {
        const sig = await sign(m.key, signedText(env));
        if (channel === ch) await ch.send({ type: 'broadcast', event: 'msg', payload: { ...env, sig } });
      })
      .catch(() => {});
  }

  async function enter(create: boolean, code: string, name: string) {
    if (!api) return deliver({ t: 'error', msg: NET_TEXT.unavailable });
    teardown();
    const mine = attempt;
    stage = 'joining';
    const fail = (msg: string) => {
      if (mine !== attempt) return;
      leave();
      handler({ t: 'error', msg });
    };
    let id: Awaited<ReturnType<typeof identity>>;
    try {
      id = await identity();
    } catch {
      return fail(NET_TEXT.unavailable);
    }
    const r = create ? await api.create(name, id.pub) : await api.join(code, name, id.pub);
    if (mine !== attempt) {
      if (r.ok) void api.leave(r.value.roomId, r.value.playerId, id.privateKey).catch(() => {});
      return;
    }
    if (!r.ok) return fail(FAIL_TEXT[r.reason]);
    const j = r.value;
    me = { id: j.playerId, roomId: j.roomId, code: j.code, key: id.privateKey };
    await setMembers(j.roster);
    db = await load();
    if (mine !== attempt) return;
    if (!db) return fail(NET_TEXT.unavailable);
    // db.channel() aynı adlı kanal hâlâ kayıtlıysa onu geri verir: önce kapanışı bekle
    await removing;
    const topic = ROOM_TOPIC + j.roomId;
    const stale = db.getChannels().find((c) => c.topic === 'realtime:' + topic);
    if (stale) await db.removeChannel(stale).catch(() => {});
    if (mine !== attempt || !me) return;
    const self = me,
      ch = db.channel(topic, { config: { presence: { key: self.id }, broadcast: { self: false } } });
    channel = ch;
    timers.push(
      setTimeout(() => {
        if (channel === ch && stage !== 'joined') fail(NET_TEXT.connect);
      }, JOIN_TIMEOUT),
    );
    ch.on('broadcast', { event: 'msg' }, ({ payload }: { payload?: unknown }) => {
      if (channel === ch) receive(payload);
    });
    ch.on(
      'presence',
      { event: 'leave' },
      ({ key, currentPresences }: { key?: string; currentPresences?: unknown[] }) => {
        // kaydını yenileyen oyuncu için de eski kaydın "leave"i gelir: yalnızca hiç kaydı kalmayan ayrılmıştır
        if (channel !== ch || stage !== 'joined' || !key || (currentPresences && currentPresences.length)) return;
        present.delete(key);
        if (key !== self.id) players({ left: key });
      },
    );
    ch.on('presence', { event: 'sync' }, () => {
      if (channel !== ch) return;
      present = new Set(Object.keys(ch.presenceState()).filter((k) => UUID_RE.test(k)));
      if (stage === 'tracked') {
        if (!present.has(self.id)) return; // kendi kaydımız henüz yayılmadı
        stage = 'joined';
        heartbeat = setInterval(() => void refreshRoster(), HEARTBEAT_MS);
        const ro = roster();
        shown = ro.players.length;
        handler({ t: 'room', code: self.code, you: self.id, ...ro, round: 0 });
        return;
      }
      if (stage !== 'joined') return;
      // üye listesinde olmayan bağlı kimlik: yeni katılan olabilir, listeyi yenile (sık değil; erken gelirse ertelenir)
      if ([...present].some((k) => !members.has(k))) rosterSoon();
      players();
    });
    ch.subscribe((status: string) => {
      if (channel !== ch) return;
      if (status === 'SUBSCRIBED') {
        // giriş ve yeniden bağlanma: kayıt yalnızca bu anlarda yazılır (sık track kanalı kapatır)
        if (stage === 'joining') stage = 'tracked';
        void ch.track({ id: self.id }).catch(() => {
          if (stage === 'tracked') fail(NET_TEXT.enter);
        });
      } else if (status === 'CLOSED') {
        if (stage === 'joined') {
          leave();
          handler({ t: 'closed' });
        }
      }
    });
  }

  // sayfa kapanırken odadan hemen çık: diğerleri nabız zaman aşımını beklemesin
  win?.addEventListener('pagehide', () => {
    if (me) leave();
  });

  return {
    enabled: !!api,
    get open() {
      return !!channel && stage === 'joined';
    },
    on(fn) {
      handler = fn;
    },
    send(m) {
      if (m.t === 'create') return void enter(true, '', m.name);
      if (m.t === 'join')
        return void enter(
          false,
          String(m.code || '')
            .toUpperCase()
            .trim()
            .slice(0, 4),
          m.name,
        );
      const self = me;
      if (!channel || stage !== 'joined' || !self) return;
      switch (m.t) {
        case 'leave':
          leave();
          break;
        case 'start': {
          // yalnızca ev sahibi; herkes aynı parça sırasını aynı tohumla, aynı anda başlatır
          const ro = roster();
          if (ro.host !== self.id || ro.players.length < 2 || live()) return;
          const ids = ro.players.slice(0, MAX_PLAYERS).map((p) => p.id);
          const roundId = crypto.randomUUID();
          const payload = { n: ++lastRound, seed: (Math.random() * 2 ** 31) | 0, in: START_IN, ids };
          round = { id: roundId, ids: new Set(ids), fin: new Set() };
          seenRounds.add(roundId);
          emit('start', payload, roundId);
          deliver({ t: 'start', round: payload.n, seed: payload.seed, in: payload.in, ids });
          break;
        }
        case 'st': // anlık durum: yalnızca diğerlerine
          if (round && round.ids.has(self.id)) emit('st', { b: m.b, s: m.s, l: m.l, lv: m.lv, r: m.r }, round.id);
          break;
        case 'fin': {
          // tur bitti: herkese, kendimize de
          if (!round || !round.ids.has(self.id) || round.fin.has(self.id)) return;
          const p = { s: m.score, l: m.lines, lv: m.level };
          round.fin.add(self.id);
          emit('fin', p, round.id);
          deliver({ t: 'fin', from: self.id, score: p.s, lines: p.l, level: p.lv });
          timers.push(setTimeout(recheck, 0));
          break;
        }
        case 'away':
          if (!!away[self.id] === m.on) return;
          away[self.id] = m.on;
          emit('away', { on: m.on }, round?.id ?? NO_ROUND);
          timers.push(setTimeout(recheck, 0));
          break;
      }
    },
    close() {
      leave();
    },
  };
}
