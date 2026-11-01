// Sıklamen çekirdeği (kural seti cyclamen-flow-v1): torba başına bir çekirdek, Hold/Next, kilitte yakınlıkla aktifleşme
// (sütun ±1, sıra ±2 içinde gri) ya da sönme, aktifleşirken sabitlenen hedef sıra, sonraki standart satır temizlemesiyle
// tetikleme, çekirdek sütunu ±2 içinde en çok 5 grinin drenajı, çekirdek olayları ve 4'ten fazla satırlık temizleme.
import { describe, expect, it, vi } from 'vitest';
import { COLS, ROWS } from '../../src/config/gameConfig';
import { CORE, FLOW, findCore, grayCellsInSpan, hasCore, nearGrayRow, withCore } from '../../src/game/cyclamenFlow';
import { PIECE } from '../../src/game/pieces';
import { PLANTS, ROLE, plantRole } from '../../src/game/plants';
import type { Game } from '../../src/game/Game';
import type { RotationState, TetrominoType } from '../../src/types/game';
import {
  clearBoard,
  createGame,
  fillRow,
  finishClear,
  idx,
  placePiece,
  recordEvents,
  stackRows,
} from '../helpers/gameHelpers';

function coreGame(seed = 1, rooms = false): Game {
  const g = createGame(seed);
  g.reset({ rooms });
  return g;
}
/** Oyunun ilk `n` parçasının çekirdek bayrakları (spawn sırasıyla; tahta boş kalır). */
function dealtCores(g: Game, n: number): { cores: boolean[]; types: number[] } {
  const cores = [g.core],
    types: number[] = [g.type];
  while (cores.length < n) {
    g.spawn();
    cores.push(g.core);
    types.push(g.type);
  }
  return { cores, types };
}
function drop(g: Game, t: TetrominoType, rot: RotationState, x: number, core = false) {
  placePiece(g, t, rot, x, 0);
  g.core = core;
  g.hardDrop();
}
const dropI = (g: Game, col: number, core = false) => drop(g, PIECE.I, 1, col - 2, core);
const board = (cells: readonly (readonly [number, number])[]) => {
  const b = new Uint8Array(COLS * ROWS);
  for (const [x, y] of cells) b[y * COLS + x] = PIECE.GARBAGE;
  return b;
};

/**
 * Kurulum: 21. sıra renkli (0 boş), 20. sıra gri (0 ve 3 boş); çekirdekli T x=5'e iner, çiçek (6, 18): (6, 20) gri
 * 2 sıra altta → aktif, hedef 20. sıra, sütun 6. Sonra 0. sütuna dikey I yalnızca 21. sırayı temizler.
 */
function setupCore(g: Game) {
  clearBoard(g);
  fillRow(g, 21, PIECE.S, [0]);
  fillRow(g, 20, PIECE.GARBAGE, [0, 3]);
  drop(g, PIECE.T, 0, 5, true);
}

describe('çekirdek dağıtımı', () => {
  it.each([1, 2, 7, 42])('her 7-bag’de tam bir çekirdek; torba yine 7 farklı parça (tohum %i)', (seed) => {
    const { cores, types } = dealtCores(coreGame(seed), 70);
    for (let b = 0; b < 10; b++) {
      expect(cores.slice(b * 7, b * 7 + 7).filter(Boolean), `torba ${b}`).toHaveLength(1);
      expect(new Set(types.slice(b * 7, b * 7 + 7)).size).toBe(7);
    }
  });

  it('ilk torba sınırı ve sonraki torba; torba başına 7 rastgele sayı (karıştırma 6 + çekirdek yeri 1)', () => {
    const g = coreGame(3);
    expect(g.queue).toHaveLength(8);
    expect(g.queueCore).toHaveLength(8);
    const dealt = [g.core, ...g.queueCore];
    expect(dealt.slice(0, 7).filter(Boolean)).toHaveLength(1);
    expect(g.coresDealt).toBe(dealt.filter(Boolean).length);
    const { cores } = dealtCores(g, 14);
    expect(cores.slice(7, 14).filter(Boolean)).toHaveLength(1);
    const spy = vi.spyOn(Math, 'random');
    spy.mockClear();
    g.reset();
    expect(spy).toHaveBeenCalledTimes(14); // 2 torba × (6 + 1)
  });

  it('Hold çekirdeği parçayla birlikte taşır (boş ve dolu hold)', () => {
    const g = coreGame(9);
    g.core = true;
    const held = g.type;
    expect(g.doHold()).toBe(true);
    expect([g.hold, g.holdCore]).toEqual([held, true]);
    const second = g.type,
      secondCore = g.core;
    g.canHold = true;
    expect(g.doHold()).toBe(true);
    expect([g.type, g.core]).toEqual([held, true]);
    expect([g.hold, g.holdCore]).toEqual([second, secondCore]);
  });

  it('oda açılınca aktif parça çekirdeğiyle kuyruğun başına döner', () => {
    const g = coreGame(4);
    g.core = true;
    const t = g.type;
    g.beginRoomClear();
    expect([g.queue[0], g.queueCore[0], g.core]).toEqual([t, true, false]);
  });

  it('çekirdekli parçanın bitkisinde yalnızca çiçek hücresi işaretlenir (her tip, her rotasyon)', () => {
    for (const t of [1, 2, 3, 4, 5, 6, 7] as const)
      for (const rot of [0, 1, 2, 3] as const) {
        const codes = PLANTS[t][rot].map((c) => withCore(c, true));
        expect(codes.filter(hasCore), `${t}/${rot}`).toHaveLength(1);
        expect(plantRole(codes.find(hasCore) ?? 0)).toBe(ROLE.head);
        expect(PLANTS[t][rot].map((c) => withCore(c, false))).toEqual(PLANTS[t][rot]);
      }
  });

  it('satır silinince çekirdek hücresiyle birlikte aşağı kayar', () => {
    const g = coreGame(2);
    clearBoard(g);
    g.board[idx(3, 19)] = PIECE.T;
    g.plant[idx(3, 19)] = CORE | (ROLE.head << 4);
    fillRow(g, 21, PIECE.S);
    g.removeRows([21]);
    expect(findCore(g.board, g.plant)).toBe(idx(3, 20));
    expect(g.plant[idx(3, 19)]).toBe(0);
  });
});

describe('aktivasyon yakınlığı', () => {
  it('yakın gri varken aktifleşir; hedef aktifleşirken sabitlenir', () => {
    const g = coreGame();
    setupCore(g);
    expect([g.coreLife, g.coresArmed, g.coresFizzled]).toEqual([FLOW.coreLife, 1, 0]);
    expect(findCore(g.board, g.plant)).toBe(idx(6, 18));
    expect([g.coreTargetRow, g.coreTargetCol]).toEqual([20, 6]);
  });

  it('yakın gri yokken aktifleşmez: işaret söner, aktif çekirdek oluşmaz', () => {
    const g = coreGame();
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [0]);
    for (let y = 16; y < 21; y++) g.board[idx(5, y)] = PIECE.S; // gri, çekirdekten 3+ sıra aşağıda kalsın
    for (let y = 16; y < 21; y++) g.board[idx(6, y)] = PIECE.S;
    for (let y = 16; y < 21; y++) g.board[idx(7, y)] = PIECE.S;
    g.boardVer++;
    const ver = g.fizzleVer;
    drop(g, PIECE.T, 0, 5, true); // çiçek (6, 14): en yakın gri (6, 21) 7 sıra uzakta
    expect([g.coreLife, g.coresArmed, g.coresFizzled, g.fizzleVer]).toEqual([0, 0, 1, ver + 1]);
    expect(g.fizzleAt).toBe(idx(6, 14));
    expect(findCore(g.board, g.plant)).toBe(-1);
    expect(g.coreTargetRow).toBe(-1);
  });

  it('±1 sütun ve ±2 sıra sınırları; hemen dışındaki gri sayılmaz; renkli/boş sayılmaz', () => {
    const k = idx(5, 10);
    for (const [x, y] of [
      [4, 8],
      [6, 12],
      [5, 8],
      [5, 12],
      [4, 10],
      [6, 10],
    ] as const)
      expect(nearGrayRow(board([[x, y]]), k), `${x},${y}`).toBe(y);
    for (const [x, y] of [
      [3, 10],
      [7, 10],
      [5, 7],
      [5, 13],
      [3, 8],
      [7, 12],
    ] as const)
      expect(nearGrayRow(board([[x, y]]), k), `${x},${y}`).toBe(-1);
    const colored = new Uint8Array(COLS * ROWS);
    colored[idx(5, 11)] = PIECE.T;
    expect(nearGrayRow(colored, k)).toBe(-1);
    // tahta sınırları
    expect(nearGrayRow(board([[1, 21]]), idx(0, 21))).toBe(21);
    expect(nearGrayRow(board([[8, 0]]), idx(9, 0))).toBe(0);
    expect(nearGrayRow(board([]), idx(0, 0))).toBe(-1);
  });

  it('hedef seçimi deterministik: en yakın gri; eşit uzaklıkta alttaki sıra; sonra çekirdek sütununa yakın', () => {
    const k = idx(5, 10);
    expect(
      nearGrayRow(
        board([
          [5, 12],
          [5, 11],
        ]),
        k,
      ),
    ).toBe(11); // uzaklık 1 < 2
    expect(
      nearGrayRow(
        board([
          [5, 9],
          [5, 11],
        ]),
        k,
      ),
    ).toBe(11); // eşit: alttaki
    expect(
      nearGrayRow(
        board([
          [4, 9],
          [5, 8],
        ]),
        k,
      ),
    ).toBe(9); // (4,9): 2, (5,8): 2 → alttaki 9
    const b = board([
      [4, 11],
      [6, 9],
    ]);
    expect(nearGrayRow(b, k)).toBe(nearGrayRow(b, k));
    expect(nearGrayRow(b, k)).toBe(11);
  });

  it('Hold ve Next davranışı değişmez: Hold aktifleştirmez', () => {
    const g = coreGame(9);
    g.core = true;
    g.doHold();
    expect([g.holdCore, g.coreLife, g.coresFizzled]).toEqual([true, 0, 0]);
    expect(g.queueCore).toHaveLength(8);
  });

  it('aktif çekirdek varken yakın olmayan yeni çekirdek söner, eskisi kalır; yakın olan yeni çekirdek yerini alır', () => {
    const g = coreGame();
    setupCore(g); // aktif (6, 18)
    for (let y = 14; y < 20; y++) g.board[idx(9, y)] = PIECE.S; // 9. sütunda yüksek renkli kule
    g.boardVer++;
    dropI(g, 9, true); // dikey I kulenin üstüne (10-13): en yakın gri 20. sırada → söner
    expect(g.coresFizzled).toBe(1);
    expect(findCore(g.board, g.plant)).toBe(idx(6, 18));
    expect(g.coreLife).toBe(FLOW.coreLife - 1);
    drop(g, PIECE.O, 0, 0, true); // O 1-2. sütunlar 18-19 (gri 20'nin üstü): çiçek 18. sırada, gri 2 sıra altta
    let n = 0;
    for (let k = 0; k < g.plant.length; k++) if (g.board[k] && (g.plant[k] ?? 0) & CORE) n++;
    expect(n).toBe(1);
    expect(g.coreLife).toBe(FLOW.coreLife);
    expect([1, 2]).toContain(g.coreTargetCol);
    expect(g.coreTargetRow).toBe(20);
  });
});

describe('tetikleme ve kontrollü drenaj', () => {
  it('sonraki standart satır temizlemesiyle tetiklenir; hedef satırlarla kayar; yalnızca sütun ±2', () => {
    const g = coreGame();
    setupCore(g);
    dropI(g, 0); // 21. sıra temizlenir (çekirdek satırı değil)
    expect(g.pending?.rows).toEqual([21]);
    finishClear(g);
    expect(g.coreTargetRow).toBe(-1); // tüketildi
    expect(g.flushRow).toBe(21); // 20 → 21 (altındaki satır silindi)
    expect(g.pending?.kind).toBe('flush');
    expect(g.pending?.cells).toEqual([idx(4, 21), idx(5, 21), idx(6, 21), idx(7, 21), idx(8, 21)]); // 6 ± 2
    expect(g.lastFlush).toBeLessThanOrEqual(5);
    expect(findCore(g.board, g.plant)).toBe(-1);
  });

  it('başka sıra ve sütunlara, renkli hücrelere dokunmaz; en fazla 5 gri; puan/satır/kombo/b2b değişmez', () => {
    const g = coreGame();
    setupCore(g);
    g.board[idx(2, 12)] = PIECE.GARBAGE;
    g.boardVer++;
    dropI(g, 0);
    finishClear(g);
    const stats = { lines: g.lines, level: g.level, combo: g.combo, b2b: g.b2b, score: g.score };
    const cells = [...(g.pending?.cells ?? [])];
    while (g.pending) finishClear(g);
    for (const x of [1, 2, 9]) expect(g.board[idx(x, 21)], `kenar ${x}`).toBe(PIECE.GARBAGE); // aralık dışı
    expect(g.board[idx(0, 21)]).toBe(PIECE.I);
    expect(g.board[idx(2, 13)]).toBe(PIECE.GARBAGE); // başka sıra
    expect(cells.length).toBeLessThanOrEqual(5);
    expect({ lines: g.lines, level: g.level, combo: g.combo, b2b: g.b2b, score: g.score }).toEqual(stats);
    expect(FLOW.flushBonus).toBe(0);
    // çökme: T hücreleri boşalan 21. sıraya iner, havada renkli yok, griler yerinde
    for (let k = 0; k < (ROWS - 1) * COLS; k++)
      if (g.board[k] && g.board[k] !== PIECE.GARBAGE) expect(g.board[k + COLS], `havada ${k}`).not.toBe(0);
    expect([g.board[idx(5, 21)], g.board[idx(6, 21)], g.board[idx(7, 21)]]).toEqual([PIECE.T, PIECE.T, PIECE.T]);
    for (let k = 0; k < g.board.length; k++) if (!g.board[k]) expect(g.plant[k]).toBe(0); // board/plant uyumu
  });

  it('hedef sıra güçle silinirse drenaj güvenli biçimde iptal; hapşırık tetiklemez', () => {
    const g = coreGame();
    stackRows(g, 8); // 14-21 gri (9. sütun boş), %40: güçler açık
    drop(g, PIECE.T, 0, 3, true); // çiçek 12. sırada, (4, 14) gri: hedef 14
    expect(g.coreTargetRow).toBe(14);
    g.useSneeze(); // en üst 3 dolu sıra: 12-14 (çekirdek ve hedef dahil)
    finishClear(g);
    expect([g.flushes, g.coreTargetRow]).toEqual([0, -1]);
  });

  it('7 parça sonunda söner (hedef de)', () => {
    const g = coreGame();
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [0, 9]);
    g.boardVer++;
    drop(g, PIECE.T, 0, 6, true); // (7, 19) çiçek; gri (7, 21) 2 sıra altta
    expect(g.coreLife).toBe(FLOW.coreLife);
    for (const c of [0, 0, 1, 1, 2, 2, 3]) dropI(g, c); // hiçbiri sıra tamamlamaz
    expect([g.coreLife, g.coresExpired, g.coreTargetRow, findCore(g.board, g.plant)]).toEqual([0, 1, -1, -1]);
  });

  it('hedef aralıkta gri kalmadıysa drenaj olmaz, çekirdek tüketilir', () => {
    const g = coreGame();
    setupCore(g);
    for (let x = 4; x <= 8; x++) g.board[idx(x, 20)] = PIECE.Z; // aralığı renkliyle doldur (hedef sıra korunur)
    g.boardVer++;
    dropI(g, 0);
    finishClear(g);
    expect([g.state, g.pending, g.flushes, g.coreLife]).toEqual(['play', null, 0, 0]);
  });

  it('drenaj aralığı tahta kenarında kırpılır', () => {
    const b = board([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => [x, 21] as const));
    expect(grayCellsInSpan(b, 21, 0, FLOW.span)).toEqual([idx(0, 21), idx(1, 21), idx(2, 21)]);
    expect(grayCellsInSpan(b, 21, 9, FLOW.span)).toHaveLength(3);
    expect(grayCellsInSpan(b, 21, 5, FLOW.span)).toHaveLength(5);
  });
});

describe('çekirdek olayları', () => {
  const kinds = (log: ReturnType<typeof recordEvents>) => log.payloads('core').map((e) => e.kind);

  it('seen: kuyruktan gelen çekirdekli parça için bir kez; Hold dönüşü ve oda geçişinde kuyruğa dönüş tekrarlamaz', () => {
    const g = coreGame(3, true);
    const log = recordEvents(g, ['core']);
    let expected = 0;
    for (let i = 0; i < 21; i++) {
      g.spawn();
      if (g.core) expected++;
    }
    expect(expected).toBeGreaterThanOrEqual(2);
    expect(kinds(log).filter((k) => k === 'seen')).toHaveLength(expected);
    // Hold'dan geri gelen parça yeniden 'seen' yaymaz
    g.core = true;
    g.doHold(); // hold boştu: sıradaki parça kuyruktan (çekirdekliyse kendi 'seen'i)
    log.clear();
    g.canHold = true;
    g.doHold(); // çekirdekli parça hold'dan döner
    expect(g.core).toBe(true);
    expect(kinds(log)).toEqual([]);
    // oda açılışında kuyruğa dönen çekirdekli parça yeniden doğunca 'seen' yok
    g.beginRoomClear();
    finishClear(g);
    expect(g.core).toBe(true);
    expect(kinds(log)).toEqual([]);
  });

  it('activated (hedef), triggered, drained (akan gri ve inen renkli sayısı); fizzled; expired', () => {
    const g = coreGame();
    const log = recordEvents(g, ['core']);
    setupCore(g);
    dropI(g, 0);
    while (g.pending) finishClear(g);
    const p = log.payloads('core');
    expect(p.map((e) => e.kind).filter((k) => k !== 'seen')).toEqual(['activated', 'triggered', 'drained']);
    expect(p[0]).toEqual({ kind: 'activated', row: 20, col: 6 });
    expect(p[2]).toEqual({ kind: 'drained', cells: 5, moved: g.lastCollapseMoves, power: false });
    log.clear();
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [0, 9]);
    for (let y = 10; y < 21; y++) g.board[idx(9, y)] = PIECE.S;
    g.boardVer++;
    dropI(g, 9, true); // gri uzak: söner
    expect(kinds(log).filter((k) => k !== 'seen')).toEqual(['fizzled']);
    log.clear();
    drop(g, PIECE.T, 0, 5, true); // (6, 19) çiçek, gri (6, 21) → aktif
    for (const c of [0, 0, 1, 1, 2, 2, 3]) dropI(g, c);
    expect(kinds(log).filter((k) => k !== 'seen')).toEqual(['activated', 'expired']); // arada doğan çekirdekliler 'seen'
  });
});

describe('4’ten fazla satırlık temizleme (çökmenin bıraktığı tam sıra + Tetris)', () => {
  it('puan tablosu 4 satırda doyar (Tetris, b2b); satır sayısı gerçek; NaN yok', () => {
    const g = coreGame();
    clearBoard(g);
    for (let y = 17; y < 22; y++) fillRow(g, y, PIECE.S, y === 21 ? [] : [0]); // 21 tam, 17-20'de 0. sütun boş
    placePiece(g, PIECE.I, 1, -2, 0); // dikey I 0. sütun: 17-20 → 5 sıra birden
    const scored: { n: number; pts: number }[] = [];
    g.on('scored', (e) => scored.push({ n: e.n, pts: e.pts }));
    g.hardDrop();
    expect(g.pending?.rows).toEqual([17, 18, 19, 20, 21]);
    expect(scored).toEqual([{ n: 5, pts: 800 }]); // Tetris tabanı × seviye 1
    expect([g.lines, g.tetrises, g.b2b, Number.isFinite(g.score)]).toEqual([5, 1, true, true]);
  });
});
