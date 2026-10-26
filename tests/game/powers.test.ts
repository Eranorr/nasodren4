import { describe, expect, it } from 'vitest';
import { CFG, COLS } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import {
  createGame,
  dropVerticalI,
  finishClear,
  getCell,
  placePiece,
  recordEvents,
  rowCells,
  setCell,
  setupWell,
  stackRows,
} from '../helpers/gameHelpers';

describe('tıkanıklık (congestion)', () => {
  it('yığın yüksekliği / 20 olarak hesaplanır ve 1 ile sınırlıdır', () => {
    const g = createGame(1);
    stackRows(g, 1);
    expect(g.congestion()).toBe(0.05);
    stackRows(g, 7);
    expect(g.congestion()).toBe(0.35);
    stackRows(g, 22);
    expect(g.congestion()).toBe(1);
  });
});

describe('siklamen (cyc)', () => {
  it('%35 altındaki tıkanıklıkta açılmaz', () => {
    const g = createGame(1);
    stackRows(g, 6); // 0.30
    const log = recordEvents(g, ['clearstart']);
    expect(g.canCyc()).toBe(false);
    expect(g.useCyc()).toBe(false);
    expect(g.canSneeze()).toBe(false);
    expect(g.useSneeze()).toBe(false);
    expect([g.state, g.cycUsed, g.sneezeUses, log.count('clearstart')]).toEqual(['play', false, 0, 0]);
    stackRows(g, 7); // 0.35
    expect(g.canCyc()).toBe(true);
    expect(g.canSneeze()).toBe(true);
  });

  it('alt bölgedeki (satır 12..21) dolu satırları drenajla temizler; puan ve 30 sn ×2 verir', () => {
    const g = createGame(1);
    stackRows(g, 10); // satır 12..21
    setCell(g, 2, 11, PIECE.L); // pencerenin (satır 12+) dışında
    const log = recordEvents(g, ['clearstart', 'powerdone', 'clearend']);
    expect(g.useCyc()).toBe(true);
    const rows = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    expect(g.state).toBe('draining');
    expect(log.payloads('clearstart')).toEqual([{ rows, kind: 'cyc' }]);
    g.update(CFG.drainMs - 1);
    expect(g.state).toBe('draining');
    g.update(1);
    expect(g.state).toBe('play');
    expect(log.payloads('powerdone')).toEqual([{ kind: 'cyc', n: 10 }]);
    expect(log.payloads('clearend')).toEqual([{ rows, kind: 'cyc' }]);
    expect(g.score).toBe(150 * 10);
    expect(g.multT).toBe(CFG.cycMultMs);
    expect(getCell(g, 2, 21)).toBe(PIECE.L); // 10 satır aşağı kaydı
    expect(rowCells(g, 20)).toEqual(new Array<number>(COLS).fill(0));
  });

  it('yalnızca bir kez kullanılabilir', () => {
    const g = createGame(1);
    stackRows(g, 7);
    expect(g.useCyc()).toBe(true);
    finishClear(g);
    stackRows(g, 7);
    expect(g.canCyc()).toBe(false);
    expect(g.useCyc()).toBe(false);
    expect(g.canSneeze()).toBe(true);
  });

  it('×2 çarpanı 30 saniye sürer, sonra biter', () => {
    const g = createGame(1);
    const log = recordEvents(g, ['scored']);
    stackRows(g, 7);
    g.useCyc();
    finishClear(g);
    setupWell(g, 1);
    dropVerticalI(g);
    finishClear(g); // multT 30000 - 300
    g.update(CFG.cycMultMs - CFG.lineClearMs - 1); // aktif parça düşüp temizlemesiz kilitlenir; multT = 1
    expect(g.multT).toBe(1);
    setupWell(g, 1);
    dropVerticalI(g);
    finishClear(g); // multT 0
    expect(g.multT).toBe(0);
    setupWell(g, 1);
    dropVerticalI(g);
    expect(log.payloads('scored').map((e) => [e.combo, e.pts])).toEqual([
      [0, 200], // 100 × 2
      [0, 200], // hâlâ ×2 (araya giren temizlemesiz kilit combo'yu sıfırladı)
      [1, 150], // çarpan bitti: 100 + combo 50
    ]);
  });
});

// NS4-24: sentetik açıcı ve rebound kaldırıldı; yerine yeniden dolan hapşırık
describe('hapşırık (sneeze)', () => {
  it('oyun başında dolu; yalnızca %35 tıkanıklıkta kullanılabilir', () => {
    const g = createGame(1);
    expect(g.sneezeCharge()).toBe(1);
    expect(g.canSneeze()).toBe(false);
    stackRows(g, 7);
    expect(g.canSneeze()).toBe(true);
  });

  it('yığının en üstteki üç dolu sırasını savurur; puan verir, şarjı boşaltır', () => {
    const g = createGame(1);
    stackRows(g, 7); // satır 15..21
    setCell(g, 4, 21, PIECE.L); // alttaki sıralar yerinde kalır
    const log = recordEvents(g, ['clearstart', 'powerdone', 'clearend']);
    expect(g.useSneeze()).toBe(true);
    expect(g.state).toBe('clearing');
    expect(log.payloads('clearstart')).toEqual([{ rows: [15, 16, 17], kind: 'sneeze' }]);
    expect([g.sneezeUses, g.sneezeCharge()]).toEqual([1, 0]);
    g.update(CFG.sneezeMs - 1);
    expect(g.state).toBe('clearing');
    g.update(1);
    expect(g.state).toBe('play');
    expect(log.payloads('powerdone')).toEqual([{ kind: 'sneeze', n: 3 }]);
    expect(log.payloads('clearend')).toEqual([{ rows: [15, 16, 17], kind: 'sneeze' }]);
    expect(g.score).toBe(50 * 3);
    expect(g.stackHeight()).toBe(4);
    expect(getCell(g, 4, 21)).toBe(PIECE.L);
  });

  it('boşken kullanılamaz; her kilitlenen parça şarjı doldurur, CFG.sneezePieces parçada yeniden hazır', () => {
    const g = createGame(1);
    stackRows(g, 10);
    g.useSneeze();
    finishClear(g);
    expect(g.canSneeze()).toBe(false);
    expect(g.useSneeze()).toBe(false);
    for (let i = 0; i < CFG.sneezePieces; i++) {
      expect(g.canSneeze()).toBe(false);
      placePiece(g, PIECE.O, 0, 3, 0);
      g.hardDrop();
      stackRows(g, 10); // yığın sabit: tıkanıklık eşik üstünde kalır, oyun bitmez
    }
    expect(g.sneezeCharge()).toBe(1);
    expect(g.canSneeze()).toBe(true);
  });

  it('oyunda birden çok kez kullanılır; ceza (hızlanma, alttan tıkanıklık) yoktur', () => {
    const g = createGame(1);
    const log = recordEvents(g, ['powerdone', 'gameover']);
    for (let k = 0; k < 3; k++) {
      stackRows(g, 10);
      g.sneezePieces = CFG.sneezePieces;
      expect(g.useSneeze()).toBe(true);
      finishClear(g);
    }
    expect(g.sneezeUses).toBe(3);
    expect(log.count('powerdone')).toBe(3);
    expect(g.gravityMs()).toBe(1000);
    const before = g.board.slice();
    g.update(20000 / 3); // eski rebound çöp aralığından uzun: tahtanın altına bir şey eklenmez
    expect(rowCells(g, 21)).toEqual(Array.from(before.slice(21 * COLS, 22 * COLS)));
    expect(log.count('gameover')).toBe(0);
  });

  it('üst sıra seçimi: yığın kısaysa yalnızca mevcut sıralar; eşik altında kullanılamaz', () => {
    const g = createGame(1);
    stackRows(g, 2);
    g.sneezePieces = CFG.sneezePieces;
    // eşik altı: kullanılamaz (yalnızca tıkanıklıkta)
    expect(g.useSneeze()).toBe(false);
    expect(g.topNonEmptyRows(3)).toEqual([20, 21]);
  });
});
