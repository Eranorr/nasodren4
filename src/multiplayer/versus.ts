/* =====================================================================
   ÇOK OYUNCULU (ÇEVRİM İÇİ): oda kodu ile 2–3 oyuncu, her biri kendi cihazından.
   Herkes aynı tohumla aynı anda başlar: parça sırası, sıklamen çekirdekleri ve
   sinüs odalarının dizilimi herkeste aynıdır. Rakiplerin küçük tahtası ve skoru
   canlı görünür. Tıkanan oyuncu turun dışında kalır, diğerlerini izler. Herkes
   bitirince (ya da ara verince) en yüksek skor turu kazanır.
   Puan: 1. 3, 2. 2, 3. 1; bitirmeden ara veren 0. Saldırı/çöp satırı yoktur.
   Her cihaz kendi oyununu oynatır; ağdan yalnızca diğerlerinin tahtası ve skoru
   gelir (multiplayer/net.ts). Kişisel veri yok: takma ad yalnızca odadakilere
   görünür, hiçbir şey veritabanına yazılmaz.
   ===================================================================== */
import { COLS, HIDDEN, VIS } from '../config/gameConfig';
import { SHAPES } from '../game/pieces';
import type { Game } from '../game/Game';
import type { Lifecycle } from '../app/lifecycle';
import type { Rect } from '../types/layout';
import { COLORS } from '../rendering/textures';
import { $, place } from '../ui/dom';
import { fmt } from '../ui/hud';
import { show } from '../ui/screens';
import { toast } from '../ui/notifications';
import { track } from '../analytics/analytics';
import { validateNickname } from '../../supabase/functions/_shared/scoreRules.ts';
import type { Incoming, Net, Player } from './net';
type FinMsg = Extract<Incoming, { t: 'fin' }>;
type StateMsg = Extract<Incoming, { t: 'st' }>;
import { MAX_PLAYERS } from './net';

export const MP_TEXT = {
  connecting: 'Bağlanıyor…',
  needName: 'Önce bir takma ad yaz (3–16 karakter).',
  codeLen: 'Oda kodu 4 karakter.',
  host: 'ev sahibi',
  you: 'sen',
  waitFriends: 'Arkadaşlarını bekliyorsun…',
  needOne: 'Turu başlatmak için en az bir arkadaşın katılmalı.',
  waitHost: 'Ev sahibinin turu başlatması bekleniyor.',
  alone: 'Odada tek kaldın; yeni bir oyuncu katılınca devam edebilirsin.',
  waitNext: 'Ev sahibinin yeni turu başlatması bekleniyor.',
  /** {n}: tur numarası. */
  round: '{n}. tur',
  win: 'Turu kazandın!',
  /** {name}: kazanan. */
  won: '{name} kazandı',
  waitOthers: 'Diğer oyuncular bekleniyor…',
  done: 'Bitti',
  away: 'Ara verdi',
  paused: '{name} oyuna ara verdi',
  back: '{name} oyuna döndü',
  closed: 'Bağlantı koptu. Yeniden oda kurabilir ya da katılabilirsin.',
  closedLobby: 'Bağlantı koptu.',
} as const;

/** Oyuncu renkleri (oda içinde 0..2). */
export const MP_COLORS = ['#d6337f', '#7a4fd0', '#0f9e93'] as const;
/** Tur puanı sırası (bitiren oyuncular, skor sırasıyla). */
export const ROUND_POINTS = [3, 2, 1] as const;
/** Canlı durum en sık bu aralıkla gönderilir (ms; saniyede 10). */
export const SEND_MS = 100;

const tpl = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k]));

/** Görünür tahta + düşen parça: VIS×COLS hücre, her biri '0'..'8'. */
export function encodeBoard(g: Game): string {
  const cells = new Array<number>(VIS * COLS);
  for (let y = 0; y < VIS; y++) for (let x = 0; x < COLS; x++) cells[y * COLS + x] = g.board[(y + HIDDEN) * COLS + x];
  if (g.type && g.state === 'play')
    for (const [dx, dy] of SHAPES[g.type][g.rot]) {
      const x = g.x + dx,
        y = g.y + dy - HIDDEN;
      if (x >= 0 && x < COLS && y >= 0 && y < VIS) cells[y * COLS + x] = g.type;
    }
  return cells.join('');
}
const BOARD_RE = new RegExp(`^[0-8]{${VIS * COLS}}$`);

interface Card {
  readonly box: HTMLElement;
  readonly cv: HTMLCanvasElement;
  readonly name: HTMLElement;
  readonly score: HTMLElement;
  readonly state: HTMLElement;
  drawn: string;
}

export interface VersusDeps {
  readonly net: Net;
  readonly game: Game;
  /** Geç bağlanır (lifecycle, versus geri çağrılarıyla oluşturulur). */
  readonly lifecycle: () => Lifecycle;
  /** Yerleşimi yeniden hesaplat (rakip kartları alanı açılır/kapanır). */
  readonly relayout: () => void;
  readonly loadNickname: () => string;
  readonly saveNickname: (n: string) => void;
}

export interface Versus {
  /** Tur görünümü açık (rakip kartları ve dar yerleşim). */
  readonly active: () => boolean;
  /** Bir odadayız. */
  readonly inRoom: () => boolean;
  open(): void;
  leave(): void;
  /** Her karede (oynarken): canlı durumu gönderir. */
  tick(now: number): void;
  layout(opps: Rect): void;
  onOver(r: { score: number; lines: number; level: number }): void;
  onPause(paused: boolean): void;
}

interface MpState {
  code: string;
  you: string;
  host: string;
  players: Player[];
  round: number;
  /** Oyuncu kimliğine göre toplam tur puanı, bitiş iletisi, ara verdi, son canlı durum. */
  totals: Record<string, number>;
  fins: Record<string, FinMsg>;
  away: Record<string, boolean>;
  last: Record<string, StateMsg>;
  /** Tur sonuçlandı (bir kez). */
  over: boolean;
  /** Tur görünümü açık. */
  inRound: boolean;
  /** Son gönderilen canlı durum ve zamanı. */
  sent: string;
  sentAt: number;
  timers: ReturnType<typeof setTimeout>[];
}

export function createVersus({ net, game, lifecycle, relayout, loadNickname, saveNickname }: VersusDeps): Versus {
  const mp: MpState = {
    code: '',
    you: '',
    host: '',
    players: [],
    round: 0,
    totals: {},
    fins: {},
    away: {},
    last: {},
    over: false,
    inRound: false,
    sent: '',
    sentAt: 0,
    timers: [],
  };
  const cards = new Map<string, Card>();
  let oppRect: Rect | null = null;
  const others = () => mp.players.filter((p) => p.id !== mp.you);
  const nameOf = (id: string) => mp.players.find((p) => p.id === id)?.name ?? '?';
  const colorOf = (id: string) => MP_COLORS[mp.players.find((p) => p.id === id)?.color ?? 0] ?? MP_COLORS[0];
  const at = (ms: number, f: () => void) => mp.timers.push(setTimeout(f, ms));
  const err = (msg: string) => {
    $('mp-err').textContent = msg;
  };

  /* ---- rakip kartları ---- */
  function card(p: Player): Card {
    let c = cards.get(p.id);
    if (c) return c;
    const box = document.createElement('div');
    box.className = 'mp-card';
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    const meta = document.createElement('div');
    meta.className = 'mp-meta';
    const name = document.createElement('b'),
      score = document.createElement('span'),
      state = document.createElement('small');
    score.className = 'mp-score';
    meta.append(name, score, state);
    box.append(cv, meta);
    $('mp-opps').appendChild(box);
    c = { box, cv, name, score, state, drawn: '' };
    cards.set(p.id, c);
    return c;
  }
  function dropCards() {
    for (const c of cards.values()) c.box.remove();
    cards.clear();
  }
  function drawCard(p: Player) {
    const c = card(p);
    c.box.style.setProperty('--mp-color', colorOf(p.id));
    c.name.textContent = p.name;
    const f = mp.fins[p.id],
      st = mp.last[p.id];
    c.score.textContent = fmt(f ? f.score : (st?.s ?? 0));
    c.state.textContent = f ? MP_TEXT.done : mp.away[p.id] ? MP_TEXT.away : '';
    c.box.classList.toggle('fin', !!f);
    c.box.classList.toggle('away', !f && !!mp.away[p.id]);
    const b = st && BOARD_RE.test(st.b) ? st.b : '0'.repeat(VIS * COLS);
    const key = `${b}|${c.cv.width}|${!!f}`;
    if (c.drawn === key) return;
    c.drawn = key;
    const x = c.cv.getContext('2d');
    if (!x) return;
    const k = c.cv.width / COLS;
    x.fillStyle = '#0f3d47';
    x.fillRect(0, 0, c.cv.width, c.cv.height);
    const gap = k >= 6 ? 1 : 0;
    for (let i = 0; i < b.length; i++) {
      const v = b.charCodeAt(i) - 48;
      if (!v) continue;
      x.fillStyle = f ? COLORS[8] : (COLORS[v as keyof typeof COLORS] ?? COLORS[8]);
      x.fillRect((i % COLS) * k + gap, ((i / COLS) | 0) * k + gap, k - gap, k - gap);
    }
  }
  function layoutCards() {
    const r = oppRect,
      list = others();
    for (const id of [...cards.keys()])
      if (!list.some((p) => p.id === id)) {
        cards.get(id)?.box.remove();
        cards.delete(id);
      }
    if (!r || !mp.inRound) return;
    const box = $('mp-opps');
    place(box, r);
    const row = r.w > r.h;
    box.classList.toggle('row', row);
    const n = Math.max(1, MAX_PLAYERS - 1);
    // kart başına tahta hücresi: şeritte yükseklikten, sütunda genişlik ve kart yüksekliğinden
    const cell = row
      ? Math.max(2, Math.floor((r.h - 4) / VIS))
      : Math.max(3, Math.floor(Math.min((r.w - 12) / COLS, ((r.h - 12) / n - 52) / VIS)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const p of list) {
      const c = card(p);
      c.cv.style.width = cell * COLS + 'px';
      c.cv.style.height = cell * VIS + 'px';
      const w = Math.round(cell * COLS * dpr);
      if (c.cv.width !== w) {
        c.cv.width = w;
        c.cv.height = Math.round(cell * VIS * dpr);
      }
      drawCard(p);
    }
  }

  /* ---- lobi ---- */
  function renderLobby() {
    const inRoom = !!mp.code;
    $('mp-join').hidden = inRoom;
    $('mp-room').hidden = !inRoom;
    if (!inRoom) return;
    err('');
    $('mp-code-show').textContent = mp.code;
    const list = $('mp-list');
    list.replaceChildren();
    for (const p of mp.players) {
      const li = document.createElement('li');
      if (p.id === mp.you) li.className = 'me';
      const dot = document.createElement('i');
      dot.className = 'mp-dot';
      dot.style.background = MP_COLORS[p.color] ?? MP_COLORS[0];
      const b = document.createElement('b');
      b.textContent = p.name;
      const small = document.createElement('small');
      small.textContent = [p.id === mp.host ? MP_TEXT.host : '', p.id === mp.you ? MP_TEXT.you : '']
        .filter(Boolean)
        .join(' · ');
      li.append(dot, b, small);
      if (mp.round) {
        const sc = document.createElement('span');
        sc.className = 'mp-total';
        sc.textContent = String(mp.totals[p.id] ?? 0);
        li.append(sc);
      }
      list.appendChild(li);
    }
    if (mp.players.length < MAX_PLAYERS) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = MP_TEXT.waitFriends;
      list.appendChild(li);
    }
    const host = mp.host === mp.you,
      start = $('b-mp-start', HTMLButtonElement);
    start.hidden = !host;
    start.disabled = mp.players.length < 2;
    $('mp-lobby-wait').textContent = host ? (mp.players.length < 2 ? MP_TEXT.needOne : '') : MP_TEXT.waitHost;
  }
  function nameOk(): string | null {
    const input = $('mp-name', HTMLInputElement);
    const v = validateNickname(input.value);
    if (!v.ok) {
      err(MP_TEXT.needName);
      input.focus();
      return null;
    }
    input.value = v.value;
    saveNickname(v.value);
    return v.value;
  }

  /* ---- tur ---- */
  function clearTimers() {
    for (const t of mp.timers) clearTimeout(t);
    mp.timers = [];
  }
  function exitRoundView() {
    mp.inRound = false;
    document.body.classList.remove('versus');
    $('mp-opps').hidden = true;
    $('mp-wait').hidden = true;
    dropCards();
    relayout();
  }
  function startRound(m: Extract<Incoming, { t: 'start' }>) {
    clearTimers();
    mp.fins = {};
    mp.last = {};
    mp.over = false;
    mp.round = m.round;
    mp.sent = '';
    for (const p of mp.players) if (p.id !== mp.you) mp.away[p.id] = !!mp.away[p.id];
    mp.away[mp.you] = false;
    mp.inRound = true;
    document.body.classList.add('versus');
    $('mp-opps').hidden = false;
    $('mp-wait').hidden = true;
    relayout();
    track('mp_round_start', { players: mp.players.length, round: m.round });
    // geri sayım: herkes aynı anda başlar
    const wait = Math.max(0, m.in | 0);
    $('mpgo-kicker').textContent = tpl(MP_TEXT.round, { n: m.round });
    const count = $('mp-count');
    count.textContent = String(Math.ceil(wait / 1000));
    show('scr-mpgo');
    for (let k = Math.ceil(wait / 1000) - 1; k >= 1; k--) at(wait - k * 1000, () => (count.textContent = String(k)));
    at(wait, () => {
      if (!mp.inRound) return;
      lifecycle().start({ seed: m.seed });
      tick(performance.now(), true);
    });
  }
  /** Oyuncunun tur skoru: bitirdiyse kesin skor, değilse son bilinen. */
  const scoreOf = (id: string) => mp.fins[id]?.score ?? (id === mp.you ? game.score : (mp.last[id]?.s ?? 0));
  function roundOver(): void {
    const ids = mp.players.map((p) => p.id);
    if (!mp.inRound || mp.over || !ids.length || !ids.every((id) => mp.fins[id] || mp.away[id])) return;
    mp.over = true; // tur bir kez sonuçlanır (oyuncu çıkışı ya da geç gelen ileti puanı ikinci kez eklemesin)
    const order = ids
      .slice()
      .sort((a, b) => Number(!!mp.fins[b]) - Number(!!mp.fins[a]) || scoreOf(b) - scoreOf(a) || (a < b ? -1 : 1));
    const pts: Record<string, number> = {};
    order.forEach((id, i) => {
      pts[id] = mp.fins[id] ? (ROUND_POINTS[i] ?? 0) : 0;
      mp.totals[id] = (mp.totals[id] ?? 0) + pts[id];
    });
    const win = order.find((id) => mp.fins[id]);
    track('mp_round_end', { players: ids.length, round: mp.round, rank: order.indexOf(mp.you) + 1 });
    $('mpres-kicker').textContent = tpl(MP_TEXT.round, { n: mp.round });
    $('mpres-title').textContent =
      win === undefined ? MP_TEXT.done : win === mp.you ? MP_TEXT.win : tpl(MP_TEXT.won, { name: nameOf(win) });
    const list = $('mpres-list');
    list.replaceChildren();
    order.forEach((id, i) => {
      const li = document.createElement('li');
      if (id === mp.you) li.className = 'me';
      const rk = document.createElement('span');
      rk.className = 'rk';
      rk.textContent = String(i + 1);
      const dot = document.createElement('i');
      dot.className = 'mp-dot';
      dot.style.background = colorOf(id);
      const b = document.createElement('b');
      b.textContent = nameOf(id);
      const small = document.createElement('small');
      small.textContent = mp.fins[id] ? fmt(scoreOf(id)) : MP_TEXT.away;
      const sc = document.createElement('span');
      sc.className = 'mp-total';
      sc.textContent = `+${pts[id]}`;
      li.append(rk, dot, b, small, sc);
      list.appendChild(li);
    });
    const tot = $('mpres-total');
    tot.replaceChildren();
    for (const id of ids.slice().sort((a, b) => (mp.totals[b] ?? 0) - (mp.totals[a] ?? 0))) {
      const s = document.createElement('span'),
        dot = document.createElement('i'),
        b = document.createElement('b');
      dot.className = 'mp-dot';
      dot.style.background = colorOf(id);
      b.textContent = String(mp.totals[id] ?? 0);
      s.append(dot, nameOf(id) + ' ', b);
      tot.appendChild(s);
    }
    resultButtons();
    at(1200, () => {
      if (!mp.code) return;
      lifecycle().endVersus();
      exitRoundView();
      show('scr-mpres');
    });
  }
  function resultButtons() {
    const host = mp.host === mp.you,
      enough = mp.players.length >= 2,
      next = $('b-mp-next', HTMLButtonElement);
    next.hidden = !host;
    next.disabled = !enough;
    $('mpres-wait').textContent = !enough ? MP_TEXT.alone : host ? '' : MP_TEXT.waitNext;
  }

  function tick(now: number, force = false) {
    if (!mp.inRound || !net.open || lifecycle().getState() !== 'playing') return;
    if (!force && now - mp.sentAt < SEND_MS) return;
    const b = encodeBoard(game),
      key = `${b}|${game.score}|${game.lines}|${game.room}`;
    if (!force && key === mp.sent) return;
    mp.sentAt = now;
    mp.sent = key;
    net.send({ t: 'st', b, s: game.score, l: game.lines, lv: game.level, r: game.room });
  }

  function reset() {
    clearTimers();
    mp.code = '';
    mp.players = [];
    mp.round = 0;
    mp.totals = {};
    mp.fins = {};
    mp.away = {};
    mp.last = {};
  }
  function leave() {
    net.send({ t: 'leave' });
    net.close();
    reset();
    if (mp.inRound) exitRoundView();
    lifecycle().endVersus();
    lifecycle().toMenu();
  }

  net.on((m) => {
    switch (m.t) {
      case 'room':
        mp.code = m.code;
        mp.you = m.you;
        mp.host = m.host;
        mp.players = m.players;
        mp.round = m.round || 0;
        mp.totals = {};
        mp.away = {};
        for (const p of m.players) if (p.away) mp.away[p.id] = true;
        renderLobby();
        break;
      case 'players': {
        mp.host = m.host;
        mp.players = m.players;
        for (const p of m.players) if (p.id !== mp.you) mp.away[p.id] = p.away;
        if (m.left !== undefined) {
          delete mp.fins[m.left];
          delete mp.last[m.left];
        }
        if (mp.inRound) {
          layoutCards();
          roundOver();
        } else {
          renderLobby();
          resultButtons();
        }
        break;
      }
      case 'start':
        startRound(m);
        break;
      case 'st': {
        mp.last[m.from] = m;
        const p = mp.players.find((q) => q.id === m.from);
        if (p && mp.inRound) drawCard(p);
        break;
      }
      case 'fin': {
        mp.fins[m.from] = m;
        const p = mp.players.find((q) => q.id === m.from);
        if (p && p.id !== mp.you && mp.inRound) drawCard(p);
        roundOver();
        break;
      }
      case 'away': {
        mp.away[m.from] = m.on;
        const p = mp.players.find((q) => q.id === m.from);
        if (p && mp.inRound) {
          drawCard(p);
          if (!mp.fins[p.id] && !mp.over) toast(tpl(m.on ? MP_TEXT.paused : MP_TEXT.back, { name: p.name }));
          roundOver();
        }
        break;
      }
      case 'error':
        err(m.msg);
        break;
      case 'closed':
        if (mp.inRound || lifecycle().isVersus()) {
          reset();
          exitRoundView();
          lifecycle().endVersus();
          lifecycle().toMenu();
          open();
          err(MP_TEXT.closed);
        } else if (mp.code) {
          reset();
          open();
          err(MP_TEXT.closedLobby);
        } else err(MP_TEXT.closedLobby);
        break;
    }
  });

  function open() {
    const input = $('mp-name', HTMLInputElement);
    if (!input.value) input.value = loadNickname();
    renderLobby();
    err('');
    show('scr-mp');
  }

  $('b-mp-create').addEventListener('click', () => {
    const n = nameOk();
    if (!n) return;
    err(MP_TEXT.connecting);
    track('mp_room', { action: 'create' });
    net.send({ t: 'create', name: n });
  });
  $('b-mp-join').addEventListener('click', () => {
    const n = nameOk();
    if (!n) return;
    const code = $('mp-code', HTMLInputElement);
    const c = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 4) {
      err(MP_TEXT.codeLen);
      code.focus();
      return;
    }
    err(MP_TEXT.connecting);
    track('mp_room', { action: 'join' });
    net.send({ t: 'join', code: c, name: n });
  });
  const code = $('mp-code', HTMLInputElement);
  code.addEventListener('input', () => {
    code.value = code.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);
  });
  code.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') $('b-mp-join').click();
  });
  $('b-mp-start').addEventListener('click', () => net.send({ t: 'start' }));
  $('b-mp-next').addEventListener('click', () => net.send({ t: 'start' }));
  $('b-mp-back').addEventListener('click', () => {
    if (mp.code) leave();
    else lifecycle().toMenu();
  });
  $('b-mp-leave').addEventListener('click', leave);

  return {
    active: () => mp.inRound,
    inRoom: () => !!mp.code,
    open,
    leave,
    tick,
    layout(r) {
      oppRect = r;
      layoutCards();
    },
    onOver(r) {
      net.send({ t: 'fin', score: r.score, lines: r.lines, level: r.level });
      $('mp-wait').textContent = MP_TEXT.waitOthers;
      $('mp-wait').hidden = false;
      roundOver();
    },
    onPause(paused) {
      mp.away[mp.you] = paused;
      net.send({ t: 'away', on: paused });
      roundOver();
    },
  };
}
