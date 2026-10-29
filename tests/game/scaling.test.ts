// NS4-11: tahta ölçeklendirmesi. computeLayout saf bir fonksiyondur; ölçüler kullanılabilir yükseklik ve
// genişlikten hesaplanır, MAX_CELL çok büyük ekranlarda kontrolsüz büyümeyi engeller.
import { describe, expect, it } from 'vitest';
import { COLS, VIS } from '../../src/config/gameConfig';
import { MAX_CELL, MIN_CELL, computeLayout } from '../../src/rendering/layout';
import type { Rect } from '../../src/types/layout';

const TARGETS = [
  [390, 844],
  [844, 390],
  [768, 1024],
  [1366, 768],
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
] as const;
const PAD = 12;

describe('10×20 oranı ve sınırlar', () => {
  it.each(TARGETS)('%i×%i: tahta 10×20 hücre, hücre sınırlar içinde, tahta ekrana sığar', (W, H) => {
    const L = computeLayout(W, H);
    expect(L.board.w).toBe(L.cell * COLS);
    expect(L.board.h).toBe(L.cell * VIS);
    expect(L.board.h).toBe(L.board.w * 2);
    expect(L.cell).toBeGreaterThanOrEqual(MIN_CELL);
    expect(L.cell).toBeLessThanOrEqual(MAX_CELL);
    expect(L.board.y + L.board.h).toBeLessThanOrEqual(H - PAD);
  });

  it('MAX_CELL makul bir üst sınırdır ve çok büyük ekranlarda aşılmaz', () => {
    expect(MAX_CELL).toBe(56);
    for (const [W, H] of [
      [2560, 1440],
      [3840, 2160],
      [5120, 2880],
    ])
      expect(computeLayout(W, H).cell).toBe(MAX_CELL);
  });
});

describe('mobil, tablet ve 1366×768 korunur', () => {
  it.each([
    [390, 844, 32, [35, 114, 320, 640]],
    [844, 390, 18, [332, 15, 180, 360]],
    [768, 1024, 41, [179, 115, 410, 820]],
    [1366, 768, 37, [498, 14, 370, 740]],
  ] as const)('%i×%i: hücre %i, tahta NS4-10 ile aynı', (W, H, cell, board) => {
    const L = computeLayout(W, H);
    expect(L.cell).toBe(cell);
    expect([L.board.x, L.board.y, L.board.w, L.board.h]).toEqual(board);
  });

  it('portre düzen ve dar düzen bayrakları değişmedi', () => {
    expect(computeLayout(390, 844).portrait).toBe(true);
    expect(computeLayout(768, 1024).portrait).toBe(true);
    expect(computeLayout(844, 390).portrait).toBe(false);
    expect(computeLayout(390, 844).compactBtns).toBe(true);
    expect(computeLayout(844, 390).compactBtns).toBe(true);
    expect(computeLayout(1366, 768).compactBtns).toBe(false);
  });
});

describe('büyük ekranlarda kontrollü büyüme', () => {
  it('1600×900 ve üstünde tahta NS4-10’daki 400×800 sınırından büyük', () => {
    expect(computeLayout(1600, 900).board.w).toBeGreaterThan(400);
    const L = computeLayout(1920, 1080);
    expect([L.cell, L.board.w, L.board.h]).toEqual([52, 520, 1040]);
    expect(computeLayout(2560, 1440).board.w).toBeGreaterThan(L.board.w);
  });

  it('büyüme monotondur: aynı en-boy oranında ekran büyüdükçe tahta küçülmez', () => {
    let prev = 0;
    for (let H = 600; H <= 2160; H += 60) {
      const c = computeLayout(Math.round((H * 16) / 9), H).cell;
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it('tahta ekranı domine etmez: alanın en fazla %30’u', () => {
    for (const [W, H] of TARGETS) {
      const L = computeLayout(W, H);
      if (L.portrait) continue; // portrede tahta zaten ekranın ana öğesidir (mobil düzen korunur)
      expect((L.board.w * L.board.h) / (W * H)).toBeLessThanOrEqual(0.3);
    }
  });

  it('yan buton yüksekliği sınırlı (büyük ekranda gereksiz uzamaz)', () => {
    for (const [W, H] of TARGETS) {
      const L = computeLayout(W, H);
      expect(L.btnHold.h).toBeLessThanOrEqual(72);
      expect(L.btnHold.h).toBeGreaterThanOrEqual(52);
    }
  });
});

/** Mini parça en fazla 4 sütun × 2 satır (I yatay, diğerleri 3×2); slot merkezine hizalanır. */
function pieceBox(x: number, y: number, mini: number): Rect {
  return { x: x - 2 * mini, y: y - mini, w: 4 * mini, h: 2 * mini };
}
const within = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

describe('Beklet ve Sıradaki parçaları panel içinde', () => {
  it.each(TARGETS)('%i×%i', (W, H) => {
    const L = computeLayout(W, H);
    expect(within(pieceBox(L.holdSlot.x, L.holdSlot.y, L.mini), L.hold), 'hold').toBe(true);
    expect(within(pieceBox(L.nextSlot.x, L.nextSlot.y, L.miniBig), L.next), 'next').toBe(true);
  });
});

describe('resize ve yön değişimi', () => {
  it('ölçüler yalnızca ekran boyutuna bağlıdır (büyüt/küçült/geri dön aynı sonucu verir)', () => {
    const a = computeLayout(1920, 1080);
    computeLayout(1366, 768);
    computeLayout(2560, 1440);
    expect(computeLayout(1920, 1080)).toEqual(a);
  });

  it.each([
    [1920, 1080],
    [844, 390],
    [1366, 768],
  ])('%i×%i ↔ döndürülmüş: portre/yatay doğru seçilir ve oran korunur', (W, H) => {
    const land = computeLayout(W, H),
      port = computeLayout(H, W);
    expect(land.portrait).toBe(false);
    expect(port.portrait).toBe(true);
    for (const L of [land, port]) expect(L.board.h).toBe(L.board.w * 2);
  });
});

// NS4-38: tek "Sıradaki" paneli Beklet ile aynı ölçüde; tıkanıklık kartı ekranda, tahtaya ve butonlara binmez
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
describe('NS4-38: Sıradaki tek parça, skor ve tıkanıklık kartı', () => {
  it.each(TARGETS)('%i×%i', (W, H) => {
    const L = computeLayout(W, H);
    expect([L.next.w, L.next.h]).toEqual([L.hold.w, L.hold.h]);
    for (const r of [L.cong, L.stats]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(W);
      expect(r.w).toBeGreaterThan(0);
      for (const o of [L.board, L.next, L.hold, L.btnHold, L.btnCyc, L.btnSneeze, L.btnPause])
        expect(overlaps(r, o)).toBe(false);
    }
    expect(overlaps(L.cong, L.stats)).toBe(false);
    if (L.portrait) expect(L.cong.y + L.cong.h).toBeLessThanOrEqual(L.board.y);
  });
});
