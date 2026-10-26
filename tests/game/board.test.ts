import { describe, expect, it } from 'vitest';
import { COLS, ROWS } from '../../src/config/gameConfig';
import { Game } from '../../src/game/Game';
import { PIECE } from '../../src/game/pieces';
import type { TetrominoType } from '../../src/types/game';
import {
  clearBoard,
  createGame,
  dropVerticalI,
  finishClear,
  mockRandom,
  setCell,
  setupWell,
} from '../helpers/gameHelpers';

describe('tahta başlangıç durumu ve reset', () => {
  it('new Game() boş tahta ve idle durumla başlar', () => {
    mockRandom(1);
    const g = new Game();
    expect(g.board).toHaveLength(COLS * ROWS);
    expect(g.board.every((v) => v === 0)).toBe(true);
    expect(g.state).toBe('idle');
    expect(g.type).toBe(0);
    expect(g.queue).toHaveLength(8);
  });

  it('reset() oyunu oynanır duruma getirir ve sayaçları sıfırlar', () => {
    const g = createGame(1);
    expect(g.state).toBe('play');
    expect(g.score).toBe(0);
    expect(g.lines).toBe(0);
    expect(g.level).toBe(1);
    expect(g.combo).toBe(-1);
    expect(g.b2b).toBe(false);
    expect(g.hold).toBe(0);
    expect(g.canHold).toBe(true);
    expect(g.cycUsed).toBe(false);
    expect(g.sneezeUses).toBe(0);
    expect(g.sneezeCharge()).toBe(1);
    expect(g.multT).toBe(0);
    expect(g.queue).toHaveLength(8);
    expect(g.board.every((v) => v === 0)).toBe(true);
  });

  it('reset() oynanmış bir oyunun tahtasını ve skorlarını temizler', () => {
    const g = createGame(2);
    setupWell(g, 1);
    dropVerticalI(g);
    expect(g.score).toBeGreaterThan(0);
    expect(g.lines).toBe(1);
    finishClear(g);
    expect(g.doHold()).toBe(true);
    expect(g.hold).not.toBe(0);
    g.reset();
    expect(g.state).toBe('play');
    expect(g.score).toBe(0);
    expect(g.lines).toBe(0);
    expect(g.combo).toBe(-1);
    expect(g.hold).toBe(0);
    expect(g.pending).toBeNull();
    expect(g.board.every((v) => v === 0)).toBe(true);
  });
});

describe('cell() ve fits()', () => {
  it('tahta dışı yanlar ve taban dolu (9), üst kenarın üstü boş (0) sayılır', () => {
    const g = createGame(1);
    expect(g.cell(-1, 5)).toBe(9);
    expect(g.cell(COLS, 5)).toBe(9);
    expect(g.cell(0, ROWS)).toBe(9);
    expect(g.cell(0, -1)).toBe(0);
    expect(g.cell(4, 10)).toBe(0);
  });

  it('fits() duvarları ve dolu hücreleri çarpışma sayar', () => {
    const g = createGame(1);
    clearBoard(g);
    // T rot0 hücreleri: (1,0) (0,1) (1,1) (2,1)
    expect(g.fits(PIECE.T, 0, 0, 5)).toBe(true);
    expect(g.fits(PIECE.T, 0, -1, 5)).toBe(false);
    expect(g.fits(PIECE.T, 0, 7, 5)).toBe(true);
    expect(g.fits(PIECE.T, 0, 8, 5)).toBe(false);
    expect(g.fits(PIECE.T, 0, 3, 20)).toBe(true);
    expect(g.fits(PIECE.T, 0, 3, 21)).toBe(false);
    setCell(g, 4, 10);
    expect(g.fits(PIECE.T, 0, 3, 10)).toBe(false);
    expect(g.fits(PIECE.T, 0, 3, 9)).toBe(false);
    expect(g.fits(PIECE.T, 0, 3, 11)).toBe(true);
  });
});

describe('parça doğması (spawn)', () => {
  it('kuyruğun ilk parçası x=3, rot=0 konumunda ve bir sıra aşağıda doğar', () => {
    mockRandom(3);
    const g = new Game();
    g.reset();
    const next = g.queue[0];
    g.hardDrop();
    expect(g.type).toBe(next);
    expect(g.x).toBe(3);
    expect(g.rot).toBe(0);
    expect(g.y).toBe(1);
    expect(g.queue).toHaveLength(8);
  });

  it('spawn(type) kuyruğa dokunmadan istenen parçayı doğurur', () => {
    const g = createGame(1);
    const queue = [...g.queue];
    g.spawn(PIECE.O);
    expect(g.type).toBe(PIECE.O);
    expect(g.queue).toEqual(queue);
  });

  it('doğma noktasının bir altı doluysa parça y=0 da kalır', () => {
    const g = createGame(1);
    clearBoard(g);
    setCell(g, 4, 2); // T rot0'ın y=1'deki alt satırı (4,2)'ye çarpar
    g.spawn(PIECE.T);
    expect(g.state).toBe('play');
    expect(g.y).toBe(0);
  });
});

describe('7-bag randomizer', () => {
  it.each([1, 2, 3, 42, 2026])('tohum %i: her 7 parçalık grup yedi farklı parça içerir', (seed) => {
    const g = createGame(seed);
    const dealt: TetrominoType[] = [];
    for (let i = 0; i < 21; i++) {
      if (g.type === 0) throw new Error('aktif parça yok');
      dealt.push(g.type);
      clearBoard(g);
      g.hardDrop();
    }
    for (let b = 0; b < 3; b++) {
      expect(new Set(dealt.slice(b * 7, b * 7 + 7))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
    }
  });

  it('aynı tohum aynı parça sırasını üretir (tek rastgelelik kaynağı Math.random)', () => {
    const a = createGame(7);
    const b = createGame(7);
    expect([a.type, ...a.queue]).toEqual([b.type, ...b.queue]);
  });

  it('Math.random hep 0 dönerse torba 1,7,6,5,4,3,2 sırasıyla dağıtılır', () => {
    mockRandom(1).mockReturnValue(0);
    const g = new Game();
    g.reset();
    expect([g.type, ...g.queue.slice(0, 6)]).toEqual([1, 7, 6, 5, 4, 3, 2]);
  });
});
