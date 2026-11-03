/* =====================================================================
   LAYOUT (portre / yatay uyarlamalı)
   NS4-03: main.ts'ten taşındı. NS4-11: yatay düzende hücre üst sınırı 40 → 56 px,
   yan buton yüksekliği 72 px ile sınırlı, Sıradaki paneli 13 → 13,6 hücre.
   NS4-04: kademeli doldurulan nesne + `as Layout` yerine her yön için tam
   nesne döndüren iki saf fonksiyon (ifadeler ve işlem sırası aynı).
   NS4-38: Sıradaki tek parça (Beklet paneliyle aynı boyutta kare / 4 hücre); açılan yer skor ve
   tıkanıklık kartına verildi (portrede skorun altı, yatayda Sıradaki'nin altı).
   Sonuç hem Pixi görünümüne (View.layout) hem DOM HUD yerleşimine verilir.
   ===================================================================== */
import { COLS, VIS } from '../config/gameConfig';
import type { LandscapeLayout, Layout, PortraitLayout, Rect } from '../types/layout';

/** Hücre alt sınırı (px; çok küçük pencerelerde okunabilirlik). */
export const MIN_CELL = 12;
/**
 * NS4-11: yatay düzen hücre üst sınırı (px). Hücre kullanılabilir yükseklik ve genişlikten hesaplanır; bu sınır
 * yalnızca çok büyük ekranlarda (ör. 2560×1440 ve üstü) tahtanın kontrolsüz büyümesini engeller.
 * Önceki sabit sınır 40 px idi; 1600×900 ve üstünde tahtayı gereğinden küçük tutuyordu.
 */
export const MAX_CELL = 56;
/** Portre (telefon/tablet) üst sınırı değişmedi. */
const PORTRAIT_MAX_CELL = 44;
/** Yatay düzende yan butonların yüksekliği: hücreyle orantılı ama 52..72 px aralığında. */
const SIDE_BTN_MIN = 52,
  SIDE_BTN_MAX = 72;

/** Sinüzit Atağı barının kalınlığı (px). */
export const ATTACK_BAR = 6;

export function computeLayout(W: number, H: number): Layout {
  const pad = 12;
  const portrait = W / H < 0.95 || W < 600;
  return portrait ? portraitLayout(W, H, pad) : landscapeLayout(W, H, pad);
}

function portraitLayout(W: number, H: number, pad: number): PortraitLayout {
  const topH = Math.round(Math.max(64, Math.min(96, H * 0.11)));
  const botH = 70;
  const meterW = 10;
  let cell = Math.floor(Math.min((W - pad * 2 - (meterW + 8) * 2) / COLS, (H - topH - botH - pad * 3) / VIS));
  cell = Math.max(MIN_CELL, Math.min(PORTRAIT_MAX_CELL, cell));
  const bw = cell * COLS,
    bh = cell * VIS;
  const bx = Math.round((W - bw) / 2);
  const freeV = H - topH - botH - bh - pad * 2;
  const by = Math.round(pad + topH + Math.max(0, freeV / 2));
  const hb = topH - 6,
    hw = hb;
  const hold: Rect = { x: pad, y: pad, w: hw, h: hb };
  const mini = Math.max(8, Math.floor(hb * 0.18));
  const next: Rect = { x: W - pad - hw, y: pad, w: hw, h: hb };
  const sx = hold.x + hw + 6,
    sw = next.x - sx - 6,
    sh = Math.round(hb * 0.6);
  const by2 = H - pad - 56;
  const gap = 8,
    pw = 48;
  // alt sırada dört güç butonu (Beklet, Sıklamen, Hapşırık, Spray); Sinüzit Atağı barı tahtanın altında
  const nb = 4;
  const bw3 = Math.floor((W - pad * 2 - pw - gap * nb) / nb);
  return {
    attackBar: { x: bx, y: by + bh + 4, w: bw, h: ATTACK_BAR },
    btnSpray: { x: pad + (bw3 + gap) * 3, y: by2, w: bw3, h: 56 },
    W,
    H,
    portrait: true,
    cell,
    board: { x: bx, y: by, w: bw, h: bh },
    meter: { x: bx - meterW - 8, y: by, w: meterW, h: bh },
    hold,
    mini,
    miniBig: mini,
    holdSlot: { x: hold.x + hw / 2, y: hold.y + hb / 2 + 7 },
    next,
    nextSlot: { x: next.x + hw / 2, y: next.y + hb / 2 + 7 },
    stats: { x: sx, y: pad, w: sw, h: sh },
    cong: { x: sx, y: pad + sh, w: sw, h: hb - sh },
    btnHold: { x: pad, y: by2, w: bw3, h: 56 },
    btnCyc: { x: pad + bw3 + gap, y: by2, w: bw3, h: 56 },
    btnSneeze: { x: pad + (bw3 + gap) * 2, y: by2, w: bw3, h: 56 },
    btnPause: { x: W - pad - 46, y: by2 + 5, w: 46, h: 46 },
    compactBtns: bw3 < 150,
    compactStats: true,
  };
}

function landscapeLayout(W: number, H: number, pad: number): LandscapeLayout {
  const side = 6;
  let cell = Math.floor(Math.min((H - pad * 2) / VIS, (W - pad * 2 - 56) / (COLS + side * 2)));
  cell = Math.max(MIN_CELL, Math.min(MAX_CELL, cell));
  const bw = cell * COLS,
    bh = cell * VIS,
    sw = cell * side;
  const bx = Math.round((W - bw) / 2),
    by = Math.round((H - bh) / 2);
  const lx = bx - 40 - sw,
    rx = bx + bw + 16;
  const bh2 = Math.min(SIDE_BTN_MAX, Math.max(SIDE_BTN_MIN, cell * 1.6));
  // NS4-38: skor ve tıkanıklık kartı; küçük hücrede (telefon yatay) en az 80 px, sol sütunda butonlara binmez
  const cardY = by + cell * 4.6,
    cardH = Math.min(Math.max(cell * 3.4, 80), by + bh - bh2 * 3 - 16 - 8 - cardY);
  // Sinüzit Atağı barı tahta ile Sıradaki sütunu arasında dikey; Spray sağ sütunda Duraklat'ın üstünde
  return {
    attackBar: { x: bx + bw + 5, y: by, w: ATTACK_BAR, h: bh },
    btnSpray: { x: rx, y: by + bh - 46 - 8 - bh2, w: sw, h: bh2 },
    W,
    H,
    portrait: false,
    cell,
    board: { x: bx, y: by, w: bw, h: bh },
    meter: { x: bx - 16, y: by, w: 8, h: bh },
    hold: { x: lx, y: by, w: sw, h: cell * 4 },
    mini: Math.round(cell * 0.62),
    miniBig: Math.round(cell * 0.8),
    holdSlot: { x: lx + sw / 2, y: by + cell * 2.2 },
    stats: { x: lx, y: cardY, w: sw, h: cardH },
    btnHold: { x: lx, y: by + bh - bh2 * 3 - 16, w: sw, h: bh2 },
    btnCyc: { x: lx, y: by + bh - bh2 * 2 - 8, w: sw, h: bh2 },
    btnSneeze: { x: lx, y: by + bh - bh2, w: sw, h: bh2 },
    // NS4-38: tek parça, Beklet paneliyle aynı ölçü; altında tıkanıklık kartı
    next: { x: rx, y: by, w: sw, h: cell * 4 },
    nextSlot: { x: rx + sw / 2, y: by + cell * 2.2 },
    cong: { x: rx, y: cardY, w: sw, h: cardH },
    btnPause: { x: rx, y: by + bh - 46, w: 46, h: 46 },
    compactBtns: sw < 150,
    compactStats: sw < 150,
  };
}

/** NS4-12: öğretici kartı yerleşimi. h: kartın kullanabileceği en fazla yükseklik (içerik kısa, gerçek kart daha alçak). */
export interface TutorialRect extends Rect {
  /** 'margin': yan boşlukta (hiçbir şeyi örtmez); 'board': tahtanın orta bandında (doğma ve iniş satırları açık). */
  readonly place: 'margin' | 'board';
}
/** Yan boşluk bu genişlikten darsa kart tahtanın orta bandına yerleşir. */
export const TUTORIAL_MIN_MARGIN = 160;

/**
 * Öğretici kartının yeri. Yatay düzende Sıradaki panelinin sağındaki boşluk yeterliyse oraya (tahta, HUD ve
 * butonlar açık kalır). Değilse (portre ve dar yatay ekranlar) tahtanın 4–15. satırları arasındaki orta banda:
 * parçanın doğduğu üst satırlar ve indiği alt satırlar görünür kalır; HUD panellerine ve butonlara binmez.
 */
export function tutorialRect(L: Layout): TutorialRect {
  if (!L.portrait) {
    const x = L.next.x + L.next.w + 16;
    const room = L.W - x - 12;
    if (room >= TUTORIAL_MIN_MARGIN) return { place: 'margin', x, y: L.next.y, w: Math.min(300, room), h: L.board.h };
  }
  return { place: 'board', x: L.board.x + 8, y: L.board.y + L.cell * 4, w: L.board.w - 16, h: L.cell * 11 };
}

/** Çok oyunculu: rakip kartları için portrede üstte şerit yüksekliği, yatayda sağda sütun genişliği (px). */
export const MP_STRIP = 76;
export const MP_SIDE = 156;

/** Yerleşimdeki bütün dikdörtgen ve noktaları dikey kaydırır. */
function shiftLayout(L: Layout, dy: number, H: number): Layout {
  const out: Record<string, unknown> = { ...L, H };
  for (const [k, v] of Object.entries(L))
    if (typeof v === 'object' && v !== null && 'y' in v) out[k] = { ...v, y: (v as Rect).y + dy };
  return out as unknown as Layout;
}

/**
 * Çok oyunculu tur yerleşimi: oyuncunun kendi tahtası ve HUD'u aynı kurallarla, rakip kartları için ayrılan
 * alanın dışında hesaplanır. Portrede kartlar üstte bir şeritte (yan yana), yatayda sağda bir sütunda (alt alta).
 */
export function versusLayout(W: number, H: number): { readonly L: Layout; readonly opps: Rect } {
  if (computeLayout(W, H).portrait)
    return {
      L: shiftLayout(computeLayout(W, H - MP_STRIP), MP_STRIP, H),
      opps: { x: 12, y: 8, w: W - 24, h: MP_STRIP - 12 },
    };
  return { L: { ...computeLayout(W - MP_SIDE, H), W }, opps: { x: W - MP_SIDE, y: 12, w: MP_SIDE - 12, h: H - 24 } };
}
