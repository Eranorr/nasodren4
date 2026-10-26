// NS4-10: HUD yerleşimi beş hedef görünümde taşma ve çakışma üretmez. computeLayout saf bir fonksiyondur;
// tahta ölçüleri bilinçli olarak sabitlenir. NS4-11: 1600×900, 2560×1440 eklendi; 1920×1080 tahtası
// bilinçli olarak 400×800 → 520×1040 büyüdü (hücre üst sınırı 40 → 56).
import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../src/rendering/layout';
import type { Rect } from '../../src/types/layout';

const VIEWPORTS = [
  [390, 844],
  [844, 390],
  [768, 1024],
  [1366, 768],
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
] as const;

/** Görünüm → [tahta x, y, genişlik, yükseklik]. 1920 ve üstü NS4-11'de büyüdü; diğerleri NS4-09 ile aynı. */
const BOARD: Record<string, readonly number[]> = {
  '390x844': [35, 114, 320, 640],
  '844x390': [332, 15, 180, 360],
  '768x1024': [179, 115, 410, 820],
  '1366x768': [498, 14, 370, 740],
  '1600x900': [585, 20, 430, 860],
  '1920x1080': [700, 20, 520, 1040],
  '2560x1440': [1000, 160, 560, 1120],
};

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inside = (r: Rect, W: number, H: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H;

describe.each(VIEWPORTS)('%i×%i', (W, H) => {
  const L = computeLayout(W, H);
  const controls = { btnHold: L.btnHold, btnCyc: L.btnCyc, btnSneeze: L.btnSneeze, btnPause: L.btnPause };
  const panels = { hold: L.hold, next: L.next, stats: L.stats, meter: L.meter };

  it('tahta ölçüsü değişmedi', () => {
    expect([L.board.x, L.board.y, L.board.w, L.board.h]).toEqual(BOARD[`${W}x${H}`]);
  });

  it('bütün HUD öğeleri ekranın içinde', () => {
    for (const [k, r] of Object.entries({ ...controls, ...panels, board: L.board }))
      expect(inside(r, W, H), k).toBe(true);
  });

  it('butonlar ve paneller tahtanın üzerine taşmaz', () => {
    for (const [k, r] of Object.entries({ ...controls, ...panels })) expect(overlap(r, L.board), k).toBe(0);
  });

  it('butonlar birbirine ve panellere çakışmaz; pause butonu görünür', () => {
    const list = Object.entries({ ...controls, hold: L.hold, next: L.next, stats: L.stats });
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [a, ra] = list[i] ?? ['', L.board];
        const [b, rb] = list[j] ?? ['', L.board];
        expect(overlap(ra, rb), `${a} × ${b}`).toBe(0);
      }
    expect(L.btnPause.w).toBeGreaterThanOrEqual(44);
    expect(L.btnPause.h).toBeGreaterThanOrEqual(44);
  });

  it('dokunma hedefleri en az 44 px yüksekliğinde', () => {
    for (const [k, r] of Object.entries(controls)) expect(r.h, k).toBeGreaterThanOrEqual(44);
  });
});
