/* =====================================================================
   LAYOUT (portre / yatay uyarlamalı)
   NS4-03: main.ts'ten taşındı. NS4-11: yatay düzende hücre üst sınırı 40 → 56 px,
   yan buton yüksekliği 72 px ile sınırlı, Sıradaki paneli 13 → 13,6 hücre.
   NS4-04: kademeli doldurulan nesne + `as Layout` yerine her yön için tam
   nesne döndüren iki saf fonksiyon (ifadeler ve işlem sırası aynı).
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
  const nw = Math.round(hb * 1.6);
  const next: Rect = { x: W - pad - nw, y: pad, w: nw, h: hb };
  const by2 = H - pad - 56;
  const gap = 8,
    pw = 48;
  const bw3 = Math.floor((W - pad * 2 - pw - gap * 3) / 3);
  return {
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
    nextSlots: [0, 1].map((k) => ({ x: next.x + (nw * (k + 0.5)) / 2, y: next.y + hb / 2 + 7 })),
    stats: { x: hold.x + hw + 6, y: pad, w: next.x - (hold.x + hw) - 12, h: hb },
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
  return {
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
    stats: { x: lx + 4, y: by + cell * 4.6, w: sw - 4, h: cell * 3 },
    btnHold: { x: lx, y: by + bh - bh2 * 3 - 16, w: sw, h: bh2 },
    btnCyc: { x: lx, y: by + bh - bh2 * 2 - 8, w: sw, h: bh2 },
    btnSneeze: { x: lx, y: by + bh - bh2, w: sw, h: bh2 },
    // NS4-11: 5. parça 12,6 + 0,62 = 13,22 hücreye iniyordu; panel 13 hücreydi (taşma). Slotlar aynı.
    next: { x: rx, y: by, w: sw, h: cell * 13.6 },
    nextSlots: [0, 1, 2, 3, 4].map((k) => ({ x: rx + sw / 2, y: by + cell * (k === 0 ? 2.6 : 2.6 + 0.4 + k * 2.4) })),
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
