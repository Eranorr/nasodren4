// NS4-12: öğretici kartı yerleşimi. Kart HUD panellerine, butonlara ve Duraklat'a binmez; yan boşluk yoksa
// tahtanın orta bandına (4–15. satır) yerleşir, doğma ve iniş satırları açık kalır.
import { describe, expect, it } from 'vitest';
import { TUTORIAL_MIN_MARGIN, computeLayout, tutorialRect } from '../../src/rendering/layout';
import { mediaBlock, rule } from '../helpers/css';
import type { Rect } from '../../src/types/layout';

const VIEWPORTS = [
  [390, 844, 'board'],
  [844, 390, 'margin'],
  [768, 1024, 'board'],
  [1366, 768, 'margin'],
  [1600, 900, 'margin'],
  [1920, 1080, 'margin'],
  [2560, 1440, 'margin'],
  [667, 375, 'board'], // dar yatay telefon: yan boşluk yetmez
] as const;
/** Kartın en uzun içerikteki yüksekliği (tarayıcıda ölçülen en kötü durum 181 px: 844×390, son adım + Tamam). */
const CARD_H = 190;

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

describe.each(VIEWPORTS)('%i×%i', (W, H, place) => {
  const L = computeLayout(W, H);
  const r = tutorialRect(L);
  const card: Rect = { x: r.x, y: r.y, w: r.w, h: Math.min(CARD_H, r.h) };

  it(`yerleşim: ${place}`, () => {
    expect(r.place).toBe(place);
  });

  it('ekranın içinde ve yeterince geniş', () => {
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.x + card.w).toBeLessThanOrEqual(W);
    expect(card.y + card.h).toBeLessThanOrEqual(H);
    expect(card.w).toBeGreaterThanOrEqual(150);
  });

  it('HUD panellerine, butonlara ve Duraklat’a binmez', () => {
    for (const [k, b] of Object.entries({
      hold: L.hold,
      next: L.next,
      stats: L.stats,
      btnHold: L.btnHold,
      btnCyc: L.btnCyc,
      btnSneeze: L.btnSneeze,
      btnPause: L.btnPause,
      meter: L.meter,
    }))
      expect(overlap(card, b), k).toBe(0);
  });

  it('tahtaya binerse yalnızca orta bantta (ilk 4 ve son 5 satır açık)', () => {
    if (r.place === 'margin') {
      expect(overlap(card, L.board)).toBe(0);
      return;
    }
    expect(card.y).toBeGreaterThanOrEqual(L.board.y + L.cell * 4);
    expect(card.y + card.h).toBeLessThanOrEqual(L.board.y + L.cell * 15);
    expect(card.x).toBeGreaterThanOrEqual(L.board.x);
    expect(card.x + card.w).toBeLessThanOrEqual(L.board.x + L.board.w);
  });
});

describe('kart stilleri', () => {
  it('kart işaretçi olaylarını oyuna bırakır; yalnızca butonlar tıklanabilir', () => {
    expect(rule('.tutorial')).toMatch(/pointer-events:\s*none/);
    expect(rule('.tut-skip,\n.tut-done')).toMatch(/pointer-events:\s*auto/);
    expect(TUTORIAL_MIN_MARGIN).toBe(160);
  });

  it('reduced motion altında giriş animasyonu yok', () => {
    expect(mediaBlock('@media (prefers-reduced-motion: reduce)')).toMatch(/\.tutorial \{\s*animation: none;/);
  });

  it('butonlar en az 32 px ve odak halkası görünür', () => {
    expect(rule('.tut-skip')).toMatch(/min-height:\s*32px/);
    expect(rule('.tut-done')).toMatch(/min-height:\s*36px/);
    expect(rule('.tut-skip:focus-visible,\n.tut-done:focus-visible')).toMatch(
      /outline:\s*3px solid var\(--color-focus-ring\)/,
    );
  });
});
