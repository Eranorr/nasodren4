/* =====================================================================
   HUD: skor/seviye/drenaj, tıkanıklık metresi, güç butonları, sayaç rozetleri
   ve layout sonrası DOM yerleşimi. Oyun kuralı hesaplamaz; Game'den okur.
   NS4-03: main.ts'ten taşındı; eşikler değişmedi. NS4-07: güçlendirici durum metinleri ui/powerups.ts'te.
   NS4-24: sentetik açıcı / Rebound rozeti yerine hapşırık butonu ve şarj çubuğu.
   NS4-20: nefes halkası (tıkanıklığa göre derin → sığ nefes) ve kademeli basınç vinyeti.
   NS4-22: büyük açılma anında ekran ortadan serin bir ışıkla açılır; basınç ve tehlike vinyeti o an kalkar.
   NS4-38: skor sayarak artar ve büyük kazançta "+N" gösterir; tıkanıklık yüzdesi ve durumu ayrı bir kartta.
   NS4-42: oda açılınca (ve Tam Ferahlık'ta) tıkanıklık göstergesi animasyonla sıfırlanır: yüzde geri sayar,
   çubuk ve yan metre turkuaza dönerek boşalır, geçiş boyunca %0'da kalır, yeni odada yumuşakça dolar.
   ===================================================================== */
import { $, place } from './dom';
import { toast, clearNotifications } from './notifications';
import { track } from '../analytics/analytics';
import { HEALTH_TOASTS } from '../content/health';
import {
  CYC_NAME,
  CYC_SHORT,
  CYC_TEXT,
  SNEEZE_NAME,
  SNEEZE_SHORT,
  SNEEZE_TEXT,
  cycState,
  sneezePercent,
  sneezeState,
  type CycState,
  type SneezeState,
} from './powerups';
import type { Game } from '../game/Game';
import { CFG, ROOMS } from '../config/gameConfig';
import { openPercent, roomLabel, roomText } from '../content/rooms';
import { resetWalls, syncWalls } from './sinusWalls';
import type { Layout } from '../types/layout';

/** Son yazılan değerler: yalnızca değişen değerler DOM'a yazılır (-1 / null = henüz yazılmadı). */
interface HudCache {
  score: number;
  /** NS4-38: ekrandaki (sayarak artan) skor, sayımın başladığı değer ve zaman (performance.now, ms). */
  shown: number;
  from: number;
  t0: number;
  /** Son "+N" kazancının değeri ve zamanı (yakın kazançlar toplanır). */
  delta: number;
  deltaT: number;
  /** Tıkanıklık kartının durumu. */
  congState: BreathState | null;
  level: number;
  lines: number;
  cong: number;
  cyc: boolean | null;
  sneeze: boolean | null;
  mult: number;
  danger: boolean | null;
  breath: BreathState | null;
  pressure: number;
  /** NS4-27: oda indeksi; NS4-30: sinüsün açıklık yüzdesi (-1 = yazılmadı). */
  room: number;
  open: number;
  cycState: CycState | null;
  sneezeState: SneezeState | null;
  /** Hapşırık şarj yüzdesi (dolum çubuğu ve erişilebilir ad). */
  sneezePct: number;
  /** "Sıklamen özütü hazır" toast'u bu oyunda gösterildi mi. */
  cycAnnounced: boolean;
  /** NS4-24: hapşırık bu oyunda ilk kez kullanılabilir oldu mu (toast + analitik bir kez). */
  sneezeAnnounced: boolean;
}

function initialHud(): HudCache {
  return {
    score: -1,
    shown: -1,
    from: 0,
    t0: 0,
    delta: 0,
    deltaT: -Infinity,
    congState: null,
    level: -1,
    lines: -1,
    cong: -1,
    cyc: null,
    sneeze: null,
    mult: -1,
    danger: null,
    breath: null,
    pressure: -1,
    room: -1,
    open: -1,
    cycState: null,
    sneezeState: null,
    sneezePct: -1,
    cycAnnounced: false,
    sneezeAnnounced: false,
  };
}
const hud: HudCache = initialHud();

/** NS4-20: nefes halkasının ritmi. ferah: derin ve yavaş; orta; tikali: sığ ve hızlı. */
export type BreathState = 'ferah' | 'orta' | 'tikali';
/** Nefes halkası eşikleri (tıkanıklık oranı). `orta`, güçlerin açıldığı eşikle aynıdır. */
export const BREATH_MID = 0.35;
export const BREATH_TIGHT = 0.7;
export function breathState(congestion: number): BreathState {
  return congestion >= BREATH_TIGHT ? 'tikali' : congestion >= BREATH_MID ? 'orta' : 'ferah';
}
/** NS4-20: basınç vinyeti BREATH_MID'den başlar, tam tıkanıklıkta 1 olur; 0,05 adımlarla (gereksiz stil yazımı yok). */
export function pressureLevel(congestion: number): number {
  const k = (congestion - BREATH_MID) / (1 - BREATH_MID);
  return Math.round(Math.min(1, Math.max(0, k)) * 20) / 20;
}

export function fmt(n: number): string {
  return n.toLocaleString('tr-TR');
}

/** NS4-42: tıkanıklık göstergesinin boşalma süresi ve boşaldıktan sonra yeni değere dolma süresi (ms; CSS ile aynı). */
export const CONG_DRAIN_MS = 1200;
export const CONG_REFILL_MS = 900;
/** Boşalma anı: başlangıç zamanı (performance.now), başlangıç değeri, %0'da kalınacak son an. */
let drain: { t0: number; from: number; until: number; done: boolean } | null = null;
let refillTimer: ReturnType<typeof setTimeout> | undefined;

function easeInOut(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/**
 * NS4-42: tıkanıklık göstergesini animasyonla sıfırlar (oda açıldı / Tam Ferahlık). Gösterge oda geçişi boyunca
 * %0'da kalır (tahta yeni odada silinir), sonra gerçek değere döner. Sürerken yeniden çağrı yok sayılır.
 */
export function drainCongestion(g: Game): void {
  const now = performance.now();
  if (drain && now < drain.until) return;
  const from = hud.cong >= 0 ? hud.cong : g.congestion();
  drain = { t0: now, from, until: now + Math.max(CONG_DRAIN_MS, CFG.roomClearMs) + 100, done: false };
  clearTimeout(refillTimer);
  for (const id of ['cong', 'meter'] as const) {
    $(id).classList.remove('refill', 'done');
    $(id).classList.add('drain');
  }
}

/** NS4-42: HUD'da gösterilen tıkanıklık (boşalma anında animasyonlu değer). Müzik süzgeci ve fazı da bunu izler. */
export function shownCongestion(g: Game): number {
  if (!drain) return g.congestion();
  const now = performance.now();
  if (now >= drain.until) return g.congestion();
  const k = Math.min(1, (now - drain.t0) / CONG_DRAIN_MS);
  return drain.from * (1 - easeInOut(k));
}

/** Boşalma bitti: gerçek değere yumuşak dolma (CSS .refill). */
function endDrain(): void {
  drain = null;
  for (const id of ['cong', 'meter'] as const) {
    $(id).classList.remove('drain', 'done');
    $(id).classList.add('refill');
  }
  clearTimeout(refillTimer);
  refillTimer = setTimeout(() => {
    $('cong').classList.remove('refill');
    $('meter').classList.remove('refill');
  }, CONG_REFILL_MS);
}

/** NS4-38: skor bu süre (ms) içinde sayarak hedefe ulaşır. */
export const SCORE_COUNT_MS = 420;
/** Bu kadar ve üstü kazanç sayarak artar ve "+N" gösterir; küçükleri (yumuşak/sert düşüş puanı) hemen yazılır. */
export const SCORE_DELTA_MIN = 50;
/** "+N" görünürken (ms) gelen yeni kazanç aynı rozete eklenir. */
const DELTA_MERGE_MS = 700;
/** NS4-38: tıkanıklık kartındaki durum adı (eşikler nefes halkasıyla aynı). */
export const CONG_STATE_TEXT: Readonly<Record<BreathState, string>> = {
  ferah: 'Ferah',
  orta: 'Artıyor',
  tikali: 'Tıkalı!',
};

/** NS4-38: skoru yazar. Büyük kazanç sayarak artar ve "+N" rozetini tetikler; azalma (yeni oyun) hemen yazılır. */
function updateScore(score: number): void {
  const now = performance.now();
  if (score !== hud.score) {
    const gain = score - hud.score;
    if (hud.score < 0 || gain < SCORE_DELTA_MIN) {
      hud.shown = score;
      $('hud-score').textContent = fmt(score);
    } else {
      hud.from = hud.shown;
      hud.t0 = now;
      hud.delta = now - hud.deltaT < DELTA_MERGE_MS ? hud.delta + gain : gain;
      hud.deltaT = now;
      const d = $('score-delta');
      d.textContent = `+${fmt(hud.delta)}`;
      restartClass(d, 'on');
      restartClass($('hud-score'), 'bump');
    }
    hud.score = score;
  }
  if (hud.shown !== hud.score) {
    const k = Math.min(1, (now - hud.t0) / SCORE_COUNT_MS);
    const v = Math.round(hud.from + (hud.score - hud.from) * (1 - Math.pow(1 - k, 3)));
    if (v !== hud.shown) {
      hud.shown = v;
      $('hud-score').textContent = fmt(v);
    }
  }
}
function restartClass(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth; // animasyonu yeniden başlat
  el.classList.add(cls);
}

/** `playing`: uygulama durumu 'playing' mi (tehlike vinyeti yalnızca oynarken açılır). */
export function updateHud(g: Game, playing: boolean): void {
  updateScore(g.score);
  if (g.level !== hud.level) {
    hud.level = g.level;
    $('hud-level').textContent = String(g.level);
  }
  if (g.lines !== hud.lines) {
    hud.lines = g.lines;
    $('hud-lines').textContent = String(g.lines);
  }
  if (drain && performance.now() >= drain.until) endDrain();
  const cg = Math.round(shownCongestion(g) * 100) / 100;
  if (drain && !drain.done && cg === 0) {
    drain.done = true;
    $('cong').classList.add('done'); // "Ferah" ve %0 küçük bir sevinçle belirir
  }
  if (cg !== hud.cong) {
    hud.cong = cg;
    $('meter-cover').style.transform = `scaleY(${1 - cg})`;
    // NS4-38: tıkanıklık kartı: yüzde, çubuk ve durum
    const pct = Math.round(cg * 100);
    $('cong-n').textContent = `%${pct}`;
    $('cong-fill').style.transform = `scaleX(${cg})`;
    const cs = breathState(cg);
    $('cong').setAttribute('aria-label', `Tıkanıklık yüzde ${pct}, ${CONG_STATE_TEXT[cs].replace('!', '')}`);
    if (cs !== hud.congState) {
      hud.congState = cs;
      $('cong').dataset['state'] = cs;
      $('cong-state').textContent = CONG_STATE_TEXT[cs];
    }
  }
  // NS4-06: vinyet her karede değerlendirilir (önceden yalnızca tıkanıklık değişince). pause() önbelleği
  // sıfırladığı için resume sonrası ilk karede mevcut tıkanıklığa göre yeniden açılır (NS4-01 Not A).
  const d = cg >= 0.7 && playing;
  if (d !== hud.danger) {
    hud.danger = d;
    $('danger').classList.toggle('on', d);
  }
  const br = playing ? breathState(cg) : 'ferah';
  if (br !== hud.breath) {
    hud.breath = br;
    $('breath').dataset['state'] = br;
  }
  const pr = playing ? pressureLevel(cg) : 0;
  if (pr !== hud.pressure) {
    hud.pressure = pr;
    $('pressure').style.opacity = String(pr);
  }
  // NS4-27: oda etiketi, kalan bulutçuk ve odaya özgü tahta tonu (data-room)
  const room = g.rooms ? g.room : -2;
  if (room !== hud.room) {
    hud.room = room;
    const on = room >= 0;
    $('room-hud').style.display = on ? 'flex' : 'none';
    $('board-bg').dataset['room'] = on ? String(Math.min(room, ROOMS.length)) : '';
    if (on) {
      $('room-name').textContent = roomLabel(room);
      $('room-name').setAttribute('aria-label', `Oda: ${roomText(room).name}`);
      $('room-open').style.display = room < ROOMS.length ? '' : 'none';
    }
  }
  // NS4-30: kalan bulutçuk sayısı yerine açıklık: "%60 açık" ve dolan çubuk
  const open = g.rooms && g.room < ROOMS.length ? openPercent(g.roomOpenness()) : 100;
  if (open !== hud.open) {
    hud.open = open;
    $('room-open-n').textContent = `%${open}`;
    $('room-open-fill').style.transform = `scaleX(${open / 100})`;
    $('room-open').setAttribute('aria-label', `Sinüs yüzde ${open} açık`);
  }
  // NS4-33: organik duvarlar odanın şeklinde; oda açıldıkça geri çekilir (Serbest nefeste hep açık)
  syncWalls(g.rooms ? g.room : ROOMS.length, g.rooms && g.room < ROOMS.length ? g.roomOpenness() : 1);
  const cyc = g.canCyc(),
    sneeze = g.canSneeze();
  if (cyc !== hud.cyc) {
    hud.cyc = cyc;
    $('btn-cyc', HTMLButtonElement).disabled = !cyc;
    $('btn-cyc').classList.toggle('ready', cyc);
    if (cyc && !hud.cycAnnounced) {
      hud.cycAnnounced = true;
      toast(HEALTH_TOASTS.cyclamenReady.text);
      track('cyclamen_available', { level: g.level, congestion: cg });
    }
  }
  if (sneeze !== hud.sneeze) {
    hud.sneeze = sneeze;
    $('btn-sneeze', HTMLButtonElement).disabled = !sneeze;
    $('btn-sneeze').classList.toggle('ready', sneeze);
    // ilk açılış sıklamenle aynı eşikte (sıklamen toast'u görünür kalır); yeniden dolunca her seferinde haber verilir
    if (sneeze && g.sneezeUses > 0) toast('Burnun yine kaşınıyor… Hapşırık hazır!');
    if (sneeze && !hud.sneezeAnnounced) {
      hud.sneezeAnnounced = true;
      track('sneeze_available', { level: g.level, congestion: cg });
    }
  }
  // NS4-07: buton durumu (kilitli / hazır / kullanıldı / aktif etki / doluyor) ve alt metni
  const cs = cycState(g, playing);
  if (cs !== hud.cycState) {
    hud.cycState = cs;
    renderPowerup('cyc', cs);
  }
  const ss = sneezeState(g),
    sp = sneezePercent(g);
  if (ss !== hud.sneezeState || sp !== hud.sneezePct) {
    hud.sneezeState = ss;
    hud.sneezePct = sp;
    renderPowerup('sneeze', ss);
    $('sneeze-fill').style.transform = `scaleX(${sp / 100})`;
  }
  // NS4-06: oyun bitince (playing=false) ×2 sayacı gösterilmez; game-over ekranının arkasında
  // donmuş süre kalmaz (NS4-01 Not C). Yeni oyunda resetHud() önbelleği sıfırlar.
  const m = playing ? Math.ceil(g.multT / 1000) : 0;
  if (m !== hud.mult) {
    hud.mult = m;
    const el = $('badge-mult');
    el.style.display = m > 0 ? 'block' : 'none';
    if (m > 0) el.textContent = `Ferah nefes ×2 · ${m} sn`;
  }
}
/**
 * Önbelleği sıfırlar (yeni oyun). NS4-04: eski for…in döngüsüyle aynı sonuç: sayılar -1, bayraklar null,
 * cycAnnounced false (eskiden ilk oyunda tanımsızdı; ikisi de "gösterilmedi" anlamına gelir).
 */
export function resetHud(): void {
  Object.assign(hud, initialHud());
  drain = null; // NS4-42
  clearTimeout(refillTimer);
  for (const id of ['cong', 'meter'] as const) $(id).classList.remove('drain', 'done', 'refill');
  resetWalls();
}

/**
 * Güçlendirici butonunun durumunu yazar: data-state (stil), uzun alt metin (geniş düzen), kısa etiket (dar düzen)
 * ve erişilebilir ad. NS4-10: durum yalnızca renkle değil, her düzende metinle de okunur.
 */
function renderPowerup(kind: 'cyc', state: CycState): void;
function renderPowerup(kind: 'sneeze', state: SneezeState): void;
function renderPowerup(kind: 'cyc' | 'sneeze', state: CycState | SneezeState): void {
  const [text, short, name] =
    kind === 'cyc'
      ? [CYC_TEXT[state as CycState], CYC_SHORT[state as CycState], CYC_NAME]
      : [SNEEZE_TEXT[state as SneezeState], SNEEZE_SHORT[state as SneezeState], SNEEZE_NAME];
  const b = $(kind === 'cyc' ? 'btn-cyc' : 'btn-sneeze');
  b.dataset['state'] = state;
  // NS4-24: dolarken yüzde erişilebilir adda da okunur
  const pct = kind === 'sneeze' && state === 'charging' ? ` %${hud.sneezePct}` : '';
  b.setAttribute('aria-label', `${name}: ${text}${pct}`);
  $(kind + '-sub').textContent = text;
  $(kind + '-chip').textContent = short;
}

/** NS4-22: açılma anı ışığının süresi (ms; CSS animasyonuyla aynı). */
export const RELIEF_MS: Readonly<Record<'tetris' | 'allclear' | 'room', number>> = {
  tetris: 900,
  room: 1400,
  allclear: 1600,
};
let reliefTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * NS4-22: ekran ortadan serin bir ışıkla açılır (#relief, data-kind'e göre güç); ışık sürdükçe basınç ve tehlike
 * vinyeti kalkar (CSS kardeş seçicisi), sonra HUD'un değerine yumuşakça döner. Art arda anlar animasyonu yeniden başlatır.
 */
export function reliefFlash(kind: 'tetris' | 'allclear' | 'room'): void {
  const el = $('relief');
  el.classList.remove('on');
  void el.offsetWidth; // animasyonu yeniden başlat
  el.dataset['kind'] = kind;
  el.classList.add('on');
  clearTimeout(reliefTimer);
  reliefTimer = setTimeout(() => el.classList.remove('on'), RELIEF_MS[kind]);
}

/** Tehlike vinyetini gizler. */
export function hideDanger(): void {
  $('danger').classList.remove('on');
}
/** pause() tarafından çağrılır: vinyet önbelleğini sıfırlar; resume sonrası ilk updateHud vinyeti yeniden hesaplar. */
export function forgetDanger(): void {
  hud.danger = null;
}

/**
 * NS4-07: oturumun geçici HUD durumlarını temizler (×2 rozeti, tehlike vinyeti, toast, popup)
 * ve önbelleği sıfırlar; sonraki updateHud her şeyi yeniden yazar. Ana menüye dönüşte ve yeni oyunda çağrılır.
 */
export function clearSessionHud(): void {
  $('badge-mult').style.display = 'none';
  // güçlendirici butonları menünün arkasında eski oyunun durumunu göstermez (yeni oyun başlangıç durumu)
  for (const id of ['btn-cyc', 'btn-sneeze'] as const) {
    const b = $(id, HTMLButtonElement);
    b.disabled = true;
    b.classList.remove('ready');
  }
  renderPowerup('cyc', 'locked');
  renderPowerup('sneeze', 'locked');
  $('sneeze-fill').style.transform = 'scaleX(1)';
  hideDanger();
  $('breath').dataset['state'] = 'ferah';
  $('pressure').style.opacity = '0';
  clearTimeout(reliefTimer);
  $('relief').classList.remove('on');
  $('room-map').classList.remove('on'); // NS4-31
  $('room-hud').style.display = 'none';
  $('board-bg').dataset['room'] = '';
  $('next-mystery').classList.remove('on'); // NS4-38
  $('score-delta').classList.remove('on');
  clearNotifications();
  resetHud();
}

/**
 * NS4-16: HUD yazı ölçeği. Yatay düzende tahta hücresiyle orantılı büyür (40 px hücreye kadar 1, en çok 1,4);
 * portrede (telefon/tablet) her zaman 1 — mobil ölçüler değişmez. CSS --hud-scale ile çarpılır.
 * Örnek: 1366×768 → 1, 1600×900 → ~1,08, 1920×1080 → 1,3, 2560×1440 → 1,4.
 */
export const HUD_SCALE_BASE_CELL = 40;
export const HUD_SCALE_MAX = 1.4;
export function hudScale(L: Pick<Layout, 'portrait' | 'cell'>): number {
  if (L.portrait) return 1;
  return Math.min(HUD_SCALE_MAX, Math.max(1, L.cell / HUD_SCALE_BASE_CELL));
}

/** computeLayout() sonucuna göre DOM HUD elemanlarını yerleştirir (Pixi tarafı View.layout'tadır). */
export function applyHudLayout(L: Layout): void {
  $('stage').style.setProperty('--hud-scale', hudScale(L).toFixed(3));
  place($('board-bg'), L.board);
  // NS4-33: ızgara ::before katmanında hücre boyutunda döşenir (--cell); derinlik katmanı tahtayı kaplar
  $('board-bg').style.setProperty('--cell', `${L.cell}px`);
  place($('meter'), L.meter); // NS4-41: dikey "Tıkanıklık" etiketi kaldırıldı (tıkanıklık kartı adlandırır)
  place($('hold-bg'), L.hold);
  place($('next-bg'), L.next);
  const lh = $('lbl-hold'),
    ln = $('lbl-next');
  lh.style.left = L.hold.x + 12 + 'px';
  lh.style.top = L.hold.y + 6 + 'px';
  ln.style.left = L.next.x + 12 + 'px';
  ln.style.top = L.next.y + 6 + 'px';
  place($('stats'), L.stats);
  $('stats').classList.toggle('compact', !!L.compactStats);
  // NS4-38: yatay düzende skor ve tıkanıklık birer kart; portrede üst şeritte skorun altında tek satır
  $('stats').classList.toggle('wide', !L.portrait);
  place($('cong'), L.cong);
  $('cong').classList.toggle('wide', !L.portrait);
  $('cong').classList.toggle('compact', !L.portrait && L.compactStats);
  const ms = Math.round(Math.min(L.next.w, L.next.h - 22) * 0.62);
  place($('next-mystery'), { x: L.nextSlot.x - ms / 2, y: L.nextSlot.y - ms / 2, w: ms, h: ms });
  place($('btn-hold'), L.btnHold);
  place($('btn-cyc'), L.btnCyc);
  place($('btn-sneeze'), L.btnSneeze);
  place($('btn-pause'), L.btnPause);
  ['btn-hold', 'btn-cyc', 'btn-sneeze'].forEach((id) => $(id).classList.toggle('compact-btn', L.compactBtns));
  // NS4-27: oda etiketleri tahtanın üst kenarına oturur (ortadaki hava çıkışının iki yanında)
  const rh = $('room-hud');
  rh.style.left = L.board.x + 8 + 'px';
  rh.style.width = L.board.w - 16 + 'px';
  rh.style.top = L.board.y - 11 + 'px';
  // NS4-31: oda açılış kartı tahtanın alt yarısında (popup alanının altında)
  const rm = $('room-map');
  rm.style.left = L.board.x + L.board.w * 0.08 + 'px';
  rm.style.width = L.board.w * 0.84 + 'px';
  rm.style.top = L.board.y + L.board.h * 0.56 + 'px';
  const pop = $('popups');
  place(pop, { x: L.board.x, y: L.board.y + L.board.h * 0.22, w: L.board.w, h: L.board.h * 0.4 });
  $('toast').style.top = L.board.y + 8 + 'px';
  $('toast').style.left = L.board.x + L.board.w / 2 + 'px';
  $('toast').style.maxWidth = Math.max(180, Math.min(300 * hudScale(L), L.board.w - 40)) + 'px'; // NS4-41: kısa satırlar
  // NS4-10: ×2 rozeti tahta genişliğinde bir sütunda, tahtanın alt kenarına hizalı; dar tahtada
  // metin satır kırar ve tahtanın dışına taşmaz (önceki konum: alt kenardan 40 / 74 px yukarıda, ortalı).
  const fx = $('fx-badges');
  fx.style.left = L.board.x + 8 + 'px';
  fx.style.width = L.board.w - 16 + 'px';
  fx.style.top = 'auto';
  fx.style.bottom = L.H - (L.board.y + L.board.h) + 10 + 'px';
}
