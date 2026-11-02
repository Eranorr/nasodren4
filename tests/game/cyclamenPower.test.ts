// Sıklamen gücü (kural seti cyclamen-flow-v3): basınca hemen 3 gri sıra (sıranın bütün grileri) akar, ardından çökme.
// Aktif çekirdek varsa hedef sırasına en yakın sıralar (çekirdek tüketilir), yoksa en alttaki gri sıralar.
// Tek kullanım, %35 eşik, ×2 / 30 sn; puan bonusu yok; dolu bir oda tek basışta açılmaz.
import { describe, expect, it } from 'vitest';
import { CFG, COLS, ROOMS, ROWS } from '../../src/config/gameConfig';
import { FLOW, findCore, powerRows } from '../../src/game/cyclamenFlow';
import { PIECE } from '../../src/game/pieces';
import type { Game } from '../../src/game/Game';
import { clearBoard, createGame, finishClear, idx, placePiece, recordEvents } from '../helpers/gameHelpers';

/** 15-21. sıralar gri (9. sütun kanal): yükseklik 7 → tıkanıklık %35 (güç açılır). */
function congested(g: Game) {
  clearBoard(g);
  for (let y = ROWS - 7; y < ROWS; y++) for (let x = 0; x < COLS - 1; x++) g.board[idx(x, y)] = PIECE.GARBAGE;
  g.boardVer++;
}
/** Çekirdekli T 3-5. sütunlara iner: çiçek (4, 13), gri (4, 15) 2 sıra altta → aktif, hedef 15, sütun 4. */
function armCore(g: Game) {
  placePiece(g, PIECE.T, 0, 3, 0);
  g.core = true;
  g.hardDrop();
}
const stats = (g: Game) => ({ lines: g.lines, level: g.level, combo: g.combo, b2b: g.b2b, score: g.score });
const grayRows = (g: Game) =>
  Array.from({ length: ROWS }, (_, y) => y).filter((y) =>
    Array.from({ length: COLS }, (_, x) => x).some((x) => g.board[idx(x, y)] === PIECE.GARBAGE),
  );
const settle = (g: Game) => {
  while (g.pending && g.pending.kind !== 'room') finishClear(g);
};

describe('sıra seçimi (powerRows)', () => {
  it('hedef yoksa en alttaki gri sıralar; hedef varsa ona en yakınlar (eşitlikte alttaki)', () => {
    const g = createGame(1);
    congested(g); // gri sıralar 15..21
    expect(FLOW.powerRows).toBe(3);
    expect(powerRows(g.board, -1, 3)).toEqual([19, 20, 21]);
    expect(powerRows(g.board, 15, 3)).toEqual([15, 16, 17]);
    expect(powerRows(g.board, 18, 3)).toEqual([17, 18, 19]);
    expect(powerRows(g.board, 21, 3)).toEqual([19, 20, 21]);
    clearBoard(g);
    expect(powerRows(g.board, -1, 3)).toEqual([]);
  });
});

describe('aktif çekirdek varken', () => {
  it('hemen tetiklenir: hedef sıra ve altındaki 2 sıranın bütün grileri akar; renkli hücre kalır; çökme; tüketim', () => {
    const g = createGame(1);
    congested(g);
    g.board[idx(1, 15)] = PIECE.Z; // hedef sırada renkli hücre: dokunulmaz
    g.boardVer++;
    armCore(g);
    expect([g.coreTargetRow, g.coreLife]).toEqual([15, FLOW.coreLife]);
    const before = g.board.slice(),
      active = g.type,
      s0 = stats(g);
    const log = recordEvents(g, ['cyclamen', 'core']);
    expect(g.useCyc()).toBe(true);
    expect([g.cycSupport, g.multT, g.pending?.kind]).toEqual(['trigger', CFG.cycMultMs, 'flush']);
    const cells = [...(g.pending?.cells ?? [])].sort((p, q) => p - q);
    const want = [15, 16, 17]
      .flatMap((y) => Array.from({ length: COLS }, (_, x) => idx(x, y)))
      .filter((k) => before[k] === PIECE.GARBAGE);
    expect(cells).toEqual(want); // 3 sıra; kanal ve renkli hücre hariç
    expect(cells).toHaveLength(26);
    expect(log.payloads('cyclamen')).toEqual([{ core: true }]);
    expect(log.payloads('core').map((e) => e.kind)).toEqual(['triggered']);
    expect([g.coreLife, g.coreTargetRow, findCore(g.board, g.plant)]).toEqual([0, -1, -1]);
    finishClear(g); // drenaj
    for (let k = 18 * COLS; k < g.board.length; k++) expect(g.board[k], `sıra ${(k / COLS) | 0}`).toBe(before[k]);
    settle(g); // çökme
    for (let k = 0; k < (ROWS - 1) * COLS; k++)
      if (g.board[k] && g.board[k] !== PIECE.GARBAGE) expect(g.board[k + COLS], `havada ${k}`).not.toBe(0);
    expect(grayRows(g)).toEqual([18, 19, 20, 21]);
    expect([g.state, g.type]).toEqual(['play', active]); // düşen parça sürer
    expect(stats(g)).toEqual(s0); // drenaj bonusu yok; satır, seviye, kombo, b2b aynı
    expect(log.payloads('core').at(-1)).toMatchObject({ kind: 'drained', cells: 26, power: true });
  });

  it('normal çekirdek drenajı (satır temizlemesiyle) hâlâ ±2, en çok 5 gri', () => {
    const g = createGame(1);
    clearBoard(g);
    for (let x = 1; x < COLS; x++) g.board[idx(x, 21)] = PIECE.S; // 21: 0 boş
    for (let x = 0; x < COLS; x++) if (x !== 0 && x !== 3) g.board[idx(x, 20)] = PIECE.GARBAGE;
    g.boardVer++;
    placePiece(g, PIECE.T, 0, 5, 0);
    g.core = true;
    g.hardDrop(); // çiçek (6, 18) → hedef 20, sütun 6
    placePiece(g, PIECE.I, 1, -2, 0);
    g.hardDrop(); // 21. sıra temizlenir → tetikler
    finishClear(g);
    expect(g.pending?.cells).toHaveLength(5);
    expect(g.flushByPower).toBe(false);
  });
});

describe('aktif çekirdek yokken', () => {
  it('basınca hemen en alttaki 3 gri sıra akar; düşen parça ve sıradaki parçalar değişmez', () => {
    const g = createGame(2);
    congested(g);
    g.queueCore.fill(false);
    const active = g.type,
      queue = [...g.queueCore],
      s0 = stats(g);
    const log = recordEvents(g, ['cyclamen']);
    expect(g.useCyc()).toBe(true);
    expect([g.cycSupport, g.pending?.kind, g.multT]).toEqual(['rows', 'flush', CFG.cycMultMs]);
    expect(g.pending?.cells).toHaveLength(27); // 19-21: 3 × 9
    expect(log.payloads('cyclamen')).toEqual([{ core: false }]);
    settle(g);
    expect(grayRows(g)).toEqual([15, 16, 17, 18]);
    expect([g.state, g.type, g.queueCore]).toEqual(['play', active, queue]);
    expect(stats(g)).toEqual(s0);
  });

  it('gri yoksa (serbest nefes) yalnızca ×2', () => {
    const g = createGame(3);
    clearBoard(g);
    for (let y = ROWS - 7; y < ROWS; y++) for (let x = 0; x < COLS - 1; x++) g.board[idx(x, y)] = PIECE.S;
    g.boardVer++;
    expect(g.useCyc()).toBe(true);
    expect([g.pending, g.multT, g.state]).toEqual([null, CFG.cycMultMs, 'play']);
  });
});

describe('dolu oda tek basışta açılmaz', () => {
  it.each(ROOMS.map((r, i) => [r.id, i] as const))('%s: odaya girer girmez güç → oda açılmaz, gri kalır', (_id, i) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = createGame(seed);
      g.reset({ rooms: true });
      g.enterRoom(i);
      // eşiğe ulaşmak için gri sıraların üstüne renkli kule (griye dokunmaz)
      const top = ROWS - (ROOMS[i]?.rows ?? 0) - 1;
      for (let y = top; y >= 0 && g.congestion() < CFG.powerThreshold; y--) g.board[idx(0, y)] = PIECE.S;
      g.boardVer++;
      expect(g.useCyc(), `tohum ${seed}`).toBe(true);
      settle(g);
      expect(g.pending?.kind, `tohum ${seed}`).not.toBe('room');
      expect(g.room).toBe(i);
      expect(g.grayCount(), `tohum ${seed}`).toBeGreaterThan(0);
    }
  });
});

describe('tek kullanım, eşik, ×2', () => {
  it('oyun başına bir kez; kullanımdan sonra yeniden açılmaz', () => {
    const g = createGame(1);
    congested(g);
    expect(g.useCyc()).toBe(true);
    expect([g.canCyc(), g.useCyc()]).toEqual([false, false]);
    g.update(CFG.cycMultMs + 1000);
    expect(g.canCyc()).toBe(false);
  });

  it('%35 tıkanıklık eşiği korunur', () => {
    const g = createGame(1);
    clearBoard(g);
    for (let y = ROWS - 6; y < ROWS; y++) for (let x = 0; x < COLS - 1; x++) g.board[idx(x, y)] = PIECE.GARBAGE;
    g.boardVer++;
    expect([g.congestion(), g.canCyc()]).toEqual([0.3, false]);
    congested(g);
    expect([g.congestion(), g.canCyc(), CFG.powerThreshold]).toEqual([0.35, true, 0.35]);
  });

  it('×2 / 30 sn: kullanıldığı anda başlar; satır puanını ikiye katlar; süre dolunca biter', () => {
    const g = createGame(1);
    congested(g);
    g.useCyc();
    expect([g.multT, CFG.cycMultMs, CFG.cycMult]).toEqual([30_000, 30_000, 2]);
    const scored: number[] = [];
    g.on('scored', (e) => scored.push(e.pts));
    g.combo = -1;
    g.scoreClear(1, 0);
    g.update(CFG.cycMultMs);
    expect(g.multT).toBe(0);
    g.combo = -1;
    g.scoreClear(1, 0);
    expect(scored).toEqual([100 * g.level * 2, 100 * g.level]); // aynı tekli: ×2 içinde ve sonrasında
  });
});
