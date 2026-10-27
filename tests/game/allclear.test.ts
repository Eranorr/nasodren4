// NS4-22: Tam Ferahlık: satır temizlemesi tahtayı tamamen boşaltırsa bonus (CFG.allClearBonus[n] × seviye),
// olay sırası (scored → allclear → clearstart), güçlerin boşalttığı tahtanın sayılmaması ve odalarla birleşimi.
import { describe, expect, it } from 'vitest';
import { CFG, ROOMS } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import {
  clearBoard,
  createGame,
  dropVerticalI,
  fillRow,
  finishClear,
  placePiece,
  recordEvents,
  setCell,
  setupWell,
  stackRows,
} from '../helpers/gameHelpers';

/** n satırlık Tam Ferahlık kurulumları: 1 yatay I, 2 O, 3 L, 4 dikey I (tahtada başka hücre yok). */
const SETUPS: Record<1 | 2 | 3 | 4, (g: ReturnType<typeof createGame>) => void> = {
  1: (g) => {
    clearBoard(g);
    fillRow(g, 21, PIECE.S, [3, 4, 5, 6]);
    placePiece(g, PIECE.I, 0, 3, 0);
  },
  2: (g) => {
    clearBoard(g);
    for (const y of [20, 21]) fillRow(g, y, PIECE.S, [8, 9]);
    placePiece(g, PIECE.O, 0, 7, 0);
  },
  3: (g) => {
    clearBoard(g);
    fillRow(g, 19, PIECE.S, [8]);
    fillRow(g, 20, PIECE.S, [8]);
    fillRow(g, 21, PIECE.S, [8, 9]);
    placePiece(g, PIECE.L, 1, 7, 19); // yerinde (kuyu ağzı dar: bırakılamaz, kilitlenir)
  },
  4: (g) => {
    setupWell(g, 4);
    placePiece(g, PIECE.I, 1, 7, 0);
  },
};

describe('Tam Ferahlık', () => {
  it.each([1, 2, 3, 4] as const)(
    '%i satırla tahta boşalınca bonus ve allclear (scored → allclear → clearstart)',
    (n) => {
      const g = createGame(1);
      SETUPS[n](g);
      const log = recordEvents(g, ['scored', 'allclear', 'clearstart']);
      g.hardDrop();
      const bonus = CFG.allClearBonus[n];
      expect(log.names()).toEqual(['scored', 'allclear', 'clearstart']);
      expect(log.payloads('scored')[0]?.n).toBe(n);
      expect(log.payloads('allclear')).toEqual([{ lines: n, bonus }]);
      expect(g.allClears).toBe(1);
      finishClear(g);
      expect(g.board.every((v) => v === 0)).toBe(true);
    },
  );

  it('bonus taban satır puanına eklenir ve seviyeyle çarpılır; ×2 sıklamen çarpanı bonusa uygulanmaz', () => {
    const g = createGame(1);
    g.lines = 30; // seviye 4 (temizlemeden sonra 34 satır: yine 4)
    g.level = 4;
    g.multT = CFG.cycMultMs;
    setupWell(g, 4);
    const before = g.score;
    dropVerticalI(g);
    const tetris = 800 * 4 * CFG.cycMult;
    expect(g.score - before).toBe(18 * 2 + tetris + CFG.allClearBonus[4] * 4);
  });

  it('tahtada tek hücre kalırsa yok', () => {
    const g = createGame(1);
    const log = recordEvents(g, ['allclear']);
    setupWell(g, 4);
    setCell(g, 0, 17, PIECE.Z);
    dropVerticalI(g);
    expect(log.count('allclear')).toBe(0);
    expect(g.allClears).toBe(0);
  });

  it('sıklamenin boşalttığı tahta sayılmaz (yalnızca satır temizlemesi)', () => {
    const g = createGame(1);
    const log = recordEvents(g, ['allclear']);
    stackRows(g, 8);
    g.useCyc();
    finishClear(g);
    expect(g.board.every((v) => v === 0)).toBe(true);
    expect(log.count('allclear')).toBe(0);
  });

  it('yeni oyunda sayaç sıfırlanır', () => {
    const g = createGame(1);
    setupWell(g, 4);
    dropVerticalI(g);
    expect(g.allClears).toBe(1);
    g.reset();
    expect(g.allClears).toBe(0);
  });

  it('odada tahta boşalınca oda da açılır (allclear, ardından roomclear); iki bonus da alınır', () => {
    const g = createGame(1);
    g.reset({ rooms: true });
    const log = recordEvents(g, ['allclear', 'roomclear']);
    setupWell(g, 4, PIECE.GARBAGE);
    const before = g.score;
    dropVerticalI(g);
    finishClear(g);
    expect(log.names()).toEqual(['allclear', 'roomclear']);
    expect(g.score - before).toBe(18 * 2 + 800 + CFG.allClearBonus[4] + CFG.roomBonus);
    expect(g.room).toBe(0); // geçiş sürüyor
    finishClear(g);
    expect(g.room).toBe(1);
  });

  it('Serbest nefeste de geçerli (oda açılmaz)', () => {
    const g = createGame(1);
    g.reset({ rooms: true });
    g.enterRoom(ROOMS.length);
    const log = recordEvents(g, ['allclear', 'roomclear']);
    setupWell(g, 4);
    dropVerticalI(g);
    finishClear(g);
    expect(log.names()).toEqual(['allclear']);
  });
});
