import { describe, expect, it } from 'vitest';
import { CFG, COLS } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import {
  clearBoard,
  createGame,
  dropVerticalI,
  fillRow,
  finishClear,
  getCell,
  placePiece,
  recordEvents,
  rowCells,
  setCell,
  setupWell,
} from '../helpers/gameHelpers';

describe('satır temizleme', () => {
  it.each([
    [1, 100],
    [2, 300],
    [3, 500],
    [4, 800],
  ])('%i satır: seviye 1 taban puanı %i', (n, pts) => {
    const g = createGame(1);
    setupWell(g, n);
    setCell(g, 0, 21 - n, PIECE.Z); // NS4-22: tahta tamamen boşalmasın (Tam Ferahlık bonusu tests/game/allclear.test.ts)
    const log = recordEvents(g, ['scored', 'clearstart']);
    dropVerticalI(g);
    const rows = Array.from({ length: n }, (_, k) => 22 - n + k);
    expect(log.payloads('scored')).toEqual([{ n, tspin: 0, b2b: false, combo: 0, pts }]);
    expect(log.payloads('clearstart')).toEqual([{ rows, kind: 'lines' }]);
    expect(g.score).toBe(pts + 18 * 2); // hard drop 18 sıra
    expect(g.lines).toBe(n);
    expect(g.state).toBe('clearing');
    expect(g.type).toBe(0);
    expect(g.tetrises).toBe(n === 4 ? 1 : 0);
  });

  it('temizleme lineClearMs sonunda biter; satırlar silinir ve yeni parça doğar', () => {
    const g = createGame(1);
    setupWell(g, 4);
    dropVerticalI(g);
    const log = recordEvents(g, ['clearend', 'spawn']);
    g.update(CFG.lineClearMs - 1);
    expect(g.state).toBe('clearing');
    g.update(1);
    expect(g.state).toBe('play');
    expect(log.names()).toEqual(['clearend', 'spawn']);
    expect(g.board.every((v) => v === 0)).toBe(true);
  });

  it('bitişik olmayan satırlar temizlenince kalan satırlar sırası korunarak aşağı kayar', () => {
    const g = createGame(1);
    clearBoard(g);
    fillRow(g, 21, PIECE.S, [9]);
    fillRow(g, 19, PIECE.S, [9]);
    setCell(g, 0, 20, PIECE.S);
    setCell(g, 1, 18, PIECE.J);
    setCell(g, 2, 10, PIECE.L);
    const log = recordEvents(g, ['clearstart']);
    dropVerticalI(g); // dikey I satır 18..21, sütun 9
    expect(log.payloads('clearstart')).toEqual([{ rows: [19, 21], kind: 'lines' }]);
    finishClear(g);
    expect(rowCells(g, 21)).toEqual([PIECE.S, 0, 0, 0, 0, 0, 0, 0, 0, PIECE.I]);
    expect(rowCells(g, 20)).toEqual([0, PIECE.J, 0, 0, 0, 0, 0, 0, 0, PIECE.I]);
    expect(getCell(g, 2, 12)).toBe(PIECE.L);
    expect(getCell(g, 2, 10)).toBe(0);
    expect(rowCells(g, 19)).toEqual(new Array<number>(COLS).fill(0));
  });
});

describe('combo ve back-to-back', () => {
  it('art arda temizlemeler combo bonusu verir; temizlemeyen kilit combo’yu sıfırlar', () => {
    const g = createGame(1);
    const log = recordEvents(g, ['scored']);
    for (let i = 0; i < 3; i++) {
      setupWell(g, 1);
      dropVerticalI(g);
      finishClear(g);
    }
    expect(log.payloads('scored').map((e) => [e.combo, e.pts])).toEqual([
      [0, 100],
      [1, 150],
      [2, 200],
    ]);
    expect(g.maxCombo).toBe(2);
    clearBoard(g);
    placePiece(g, PIECE.O, 0, 0, 1);
    g.hardDrop();
    expect(g.combo).toBe(-1);
    setupWell(g, 1);
    dropVerticalI(g);
    expect(log.payloads('scored').at(-1)).toMatchObject({ combo: 0, pts: 100 });
  });

  it('art arda iki Tetris ×1.5 back-to-back alır; zor olmayan temizleme zinciri koparır', () => {
    const g = createGame(1);
    const log = recordEvents(g, ['scored']);
    setupWell(g, 4);
    dropVerticalI(g);
    finishClear(g);
    expect(g.b2b).toBe(true);
    setupWell(g, 4);
    dropVerticalI(g);
    finishClear(g);
    setupWell(g, 1);
    dropVerticalI(g);
    finishClear(g);
    expect(g.b2b).toBe(false); // NS4-06: 0 değil, gerçek boolean
    expect(log.payloads('scored').map((e) => [e.b2b, e.pts])).toEqual([
      [false, 800],
      [true, 1250], // floor(800 × 1.5) + combo 1 × 50
      [false, 200], // 100 + combo 2 × 50
    ]);
  });
});

describe('back-to-back değeri', () => {
  it('her temizleme türünden sonra boolean kalır; puanlar değişmez', () => {
    const g = createGame(1);
    const log = recordEvents(g, ['scored']);
    const types: string[] = [];
    for (const rows of [1, 4, 4, 2, 1]) {
      setupWell(g, rows);
      dropVerticalI(g);
      types.push(typeof g.b2b);
      finishClear(g);
    }
    clearBoard(g);
    placePiece(g, PIECE.O, 0, 0, 1);
    g.hardDrop(); // temizlemesiz kilit b2b'ye dokunmaz
    types.push(typeof g.b2b);
    expect(types).toEqual(new Array<string>(6).fill('boolean'));
    expect(log.payloads('scored').map((e) => [e.b2b, e.pts])).toEqual([
      [false, 100],
      [false, 850], // 800 + combo 1 × 50
      [true, 1300], // floor(800 × 1.5) + combo 2 × 50
      [false, 450], // 300 + combo 3 × 50
      [false, 600], // seviye 2: 100 × 2 + combo 4 × 50 × 2
    ]);
  });
});

/** NS4-01 T-spin double tahtası: alt iki satır T yuvası, (3,19) üst köşe dolu. */
function tsdBoard(g: ReturnType<typeof createGame>) {
  clearBoard(g);
  fillRow(g, 21, PIECE.L, [4]);
  fillRow(g, 20, PIECE.L, [3, 4, 5]);
  setCell(g, 3, 19, PIECE.L);
}

describe('T-spin', () => {
  it('rotasyonla yuvaya giren T, iki ön köşe dolu olduğu için tam T-spin double sayılır', () => {
    const g = createGame(1);
    tsdBoard(g);
    placePiece(g, PIECE.T, 1, 3, 19);
    expect(g.rotate(1)).toBe(true);
    expect([g.rot, g.x, g.y, g.lastKick]).toEqual([2, 3, 19, 0]);
    expect(g.tspinKind()).toBe(2);
    const log = recordEvents(g, ['scored']);
    g.hardDrop();
    expect(log.payloads('scored')).toEqual([{ n: 2, tspin: 2, b2b: false, combo: 0, pts: 1200 }]);
    expect(g.tspins).toBe(1);
    expect(g.b2b).toBe(true);
  });

  it('üç köşe dolu ama ön köşelerden biri boşsa mini T-spin sayılır', () => {
    const g = createGame(1);
    clearBoard(g);
    fillRow(g, 21, PIECE.L, [3, 4, 5]);
    setCell(g, 3, 20);
    setCell(g, 6, 20);
    placePiece(g, PIECE.T, 3, 4, 19);
    expect(g.rotate(1)).toBe(true); // 3→0, üçüncü tekme adayı (lastKick 2)
    expect([g.rot, g.x, g.y, g.lastKick]).toEqual([0, 3, 20, 2]);
    expect(g.tspinKind()).toBe(1);
    const log = recordEvents(g, ['scored']);
    g.hardDrop();
    expect(log.payloads('scored')).toEqual([{ n: 1, tspin: 1, b2b: false, combo: 0, pts: 200 }]);
    expect(g.tspins).toBe(1);
  });

  it('5. tekme adayıyla (lastKick 4) yapılan T-spin, ön köşe eksik olsa da tam sayılır', () => {
    const g = createGame(1);
    clearBoard(g);
    fillRow(g, 19, PIECE.L, [0, 1]);
    fillRow(g, 20, PIECE.L, [0, 1]);
    setCell(g, 1, 19, PIECE.L); // TR köşesi; 0→1 ilk dört aday da kapalı
    setCell(g, 0, 17, PIECE.L);
    placePiece(g, PIECE.T, 0, 0, 17);
    expect(g.rotate(1)).toBe(true);
    expect([g.rot, g.x, g.y, g.lastKick]).toEqual([1, -1, 19, 4]); // KICK_JLSTZ['01'][4] = [-1, -2]
    expect(g.tspinKind()).toBe(2); // BR köşesi (1,21) boş: kural olmasa mini olurdu
    const log = recordEvents(g, ['scored']);
    g.hardDrop();
    expect(log.payloads('scored')).toEqual([{ n: 2, tspin: 2, b2b: false, combo: 0, pts: 1200 }]);
  });

  it('yalnızca iki köşesi dolu rotasyon T-spin sayılmaz', () => {
    const g = createGame(1);
    clearBoard(g);
    setCell(g, 3, 21);
    setCell(g, 5, 21);
    placePiece(g, PIECE.T, 1, 3, 19);
    expect(g.rotate(1)).toBe(true);
    expect([g.rot, g.x, g.y, g.lastKick]).toEqual([2, 3, 19, 0]);
    expect(g.tspinKind()).toBe(0);
  });

  it('son hareket rotasyon değilse veya parça T değilse T-spin sayılmaz', () => {
    const g = createGame(1);
    tsdBoard(g);
    placePiece(g, PIECE.T, 2, 3, 19);
    expect(g.tspinKind()).toBe(0); // lastRot false
    placePiece(g, PIECE.J, 0, 3, 5);
    g.rotate(1);
    expect(g.tspinKind()).toBe(0); // T değil
    // Yukarıda döndürülüp düz düşen T: son konumda 3 köşe dolu, ama hard drop lastRot'u sıfırlar → normal tekli
    placePiece(g, PIECE.T, 0, 3, 10);
    g.rotate(1);
    expect(g.lastRot).toBe(true);
    const log = recordEvents(g, ['scored']);
    g.hardDrop();
    expect(log.payloads('scored')).toEqual([{ n: 1, tspin: 0, b2b: false, combo: 0, pts: 100 }]);
  });

  it('satır temizlemeyen T-spin de scored olayı üretir', () => {
    const g = createGame(1);
    clearBoard(g);
    fillRow(g, 21, PIECE.L, [3, 4, 5, 9]);
    setCell(g, 3, 20);
    setCell(g, 6, 20);
    placePiece(g, PIECE.T, 3, 4, 19);
    g.rotate(1);
    const log = recordEvents(g, ['scored']);
    g.hardDrop();
    expect(log.payloads('scored')).toEqual([{ n: 0, tspin: 1, b2b: false, combo: -1, pts: 100 }]);
    expect(g.tspins).toBe(0);
  });
});

describe('seviye ve yerçekimi', () => {
  it('her 10 satırda seviye artar ve levelup olayı yayınlanır', () => {
    const g = createGame(1);
    const log = recordEvents(g, ['levelup']);
    for (let i = 0; i < 9; i++) {
      setupWell(g, 1);
      dropVerticalI(g);
      finishClear(g);
    }
    expect(g.level).toBe(1);
    setupWell(g, 1);
    dropVerticalI(g);
    expect(g.lines).toBe(10);
    expect(g.level).toBe(2);
    expect(log.payloads('levelup')).toEqual([2]);
  });

  it('seviye 20’de sınırlanır', () => {
    const g = createGame(1);
    g.lines = 199;
    g.level = 19;
    const log = recordEvents(g, ['levelup']);
    setupWell(g, 1);
    dropVerticalI(g);
    finishClear(g);
    expect(g.level).toBe(20);
    setupWell(g, 4);
    dropVerticalI(g);
    expect(g.lines).toBe(204);
    expect(g.level).toBe(20);
    expect(log.payloads('levelup')).toEqual([20]);
  });

  it.each([
    [1, 1000],
    [2, 793],
    [5, 355.196928256],
    [10, 64.151584959],
    [20, 0.455397712],
  ])('seviye %i yerçekimi aralığı %f ms', (level, ms) => {
    const g = createGame(1);
    g.level = level;
    expect(g.gravityMs()).toBeCloseTo(ms, 6);
  });

  it('seviye artınca parça daha sık düşer', () => {
    const g = createGame(1);
    clearBoard(g);
    placePiece(g, PIECE.T, 0, 3, 1);
    g.update(999);
    expect(g.y).toBe(1);
    g.update(1);
    expect(g.y).toBe(2);
    g.level = 2;
    placePiece(g, PIECE.T, 0, 3, 1);
    g.update(792);
    expect(g.y).toBe(1);
    g.update(1);
    expect(g.y).toBe(2);
  });

  it('soft drop yerçekimini 20 kat hızlandırır ve düşülen her sıra için +1 verir', () => {
    const g = createGame(1);
    clearBoard(g);
    placePiece(g, PIECE.T, 0, 3, 1);
    g.softDrop = true;
    g.update(1000 / CFG.softDropFactor);
    expect(g.y).toBe(2);
    expect(g.score).toBe(1);
  });
});

describe('NS4-01 referans skor dizisi (tek oyun)', () => {
  it('tekli +138, Tetris +1732, T-spin double +3800, combo 538/638/738', () => {
    const g = createGame(1);
    const deltas: number[] = [];
    const step = (fn: () => void) => {
      const before = g.score;
      fn();
      deltas.push(g.score - before);
      finishClear(g);
    };
    // 1) tekli: satır 21 (3..6 boş), lines=9 → seviye 2'ye geçiş
    step(() => {
      clearBoard(g);
      fillRow(g, 21, PIECE.S, [3, 4, 5, 6]);
      setCell(g, 0, 20, PIECE.Z); // NS4-22: tahta tamamen boşalmasın (Tam Ferahlık bonusu tests/game/allclear.test.ts)
      g.lines = 9;
      g.spawn(PIECE.I);
      g.hardDrop();
    });
    expect(g.level).toBe(2);
    // 2) Tetris: satır 18..21 sütun 0 boş, dikey I
    step(() => {
      clearBoard(g);
      for (let y = 18; y < 22; y++) fillRow(g, y, PIECE.J, [0]);
      setCell(g, 9, 17, PIECE.Z);
      g.spawn(PIECE.I);
      placePiece(g, PIECE.I, 1, -2, 2);
      g.hardDrop();
    });
    expect([g.tetrises, g.b2b]).toEqual([1, true]);
    // 3) T-spin double (b2b + combo 2)
    step(() => {
      tsdBoard(g);
      placePiece(g, PIECE.T, 1, 3, 19);
      g.rotate(1);
      g.hardDrop();
    });
    expect(g.tspins).toBe(1);
    // 4) üç tekli: combo 3, 4, 5
    for (let i = 0; i < 3; i++)
      step(() => {
        clearBoard(g);
        fillRow(g, 21, PIECE.S, [3, 4, 5, 6]);
        setCell(g, 0, 20, PIECE.Z);
        g.spawn(PIECE.I);
        g.hardDrop();
      });
    expect(deltas).toEqual([138, 1732, 3800, 538, 638, 738]);
    expect(g.combo).toBe(5);
  });
});
