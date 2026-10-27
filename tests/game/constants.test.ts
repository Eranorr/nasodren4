// NS4-07: güçlendirici ve oyun dengesi sabitleri. Bu değerler bilinçli ürün kararı olmadan değişmemelidir;
// değişirse bu test ve NS4-05 referans skor testi birlikte güncellenmelidir.
import { describe, expect, it } from 'vitest';
import { CFG, COLS, HIDDEN, ROWS, VIS } from '../../src/config/gameConfig';

describe('mekanik sabitler', () => {
  it('tahta boyutları', () => {
    expect({ COLS, ROWS, HIDDEN, VIS }).toEqual({ COLS: 10, ROWS: 22, HIDDEN: 2, VIS: 20 });
  });

  it('süre, hız ve güçlendirici değerleri', () => {
    const { cta, ...mechanics } = CFG;
    expect(cta).toBe('https://www.yasasinsaglik.com/');
    expect(mechanics).toEqual({
      lockDelay: 500,
      maxLockResets: 15,
      lineClearMs: 300,
      drainMs: 800,
      softDropFactor: 20,
      maxLevel: 20,
      linesPerLevel: 10,
      powerThreshold: 0.35,
      cycMultMs: 30000,
      cycMult: 2,
      // NS4-24: sentetik/rebound yerine hapşırık
      sneezePieces: 20,
      sneezeRows: 3,
      sneezeMs: 650,
      // NS4-27: Sinüs Odaları
      roomBonus: 1000,
      roomClearMs: 2400, // NS4-31: harita kartı
      // NS4-22: Tam Ferahlık (satır sayısına göre × seviye)
      allClearBonus: [0, 800, 1200, 1800, 2000],
    });
  });
});
