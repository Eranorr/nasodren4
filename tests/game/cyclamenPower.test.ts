// Sıklamen gücü (kural seti cyclamen-flow-v2): aktif çekirdek varsa hemen tetikler (hedef sırada çekirdek sütunu ±4, en
// çok 9 gri, ardından çökme), yoksa sıradaki parçayı çekirdekler. Tek kullanım, %35 eşik, ×2 / 30 sn; puan bonusu yok.
import { describe, expect, it } from 'vitest';
import { CFG, COLS, ROWS } from '../../src/config/gameConfig';
import { FLOW, findCore } from '../../src/game/cyclamenFlow';
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

describe('aktif çekirdek varken', () => {
  it('hemen tetiklenir: hedef sırada ±4 (en çok 9 gri); renkli hücre ve başka sıralar korunur; çökme; tüketim', () => {
    const g = createGame(1);
    congested(g);
    g.board[idx(1, 15)] = PIECE.Z; // hedef sırada renkli hücre: dokunulmaz
    g.boardVer++;
    armCore(g);
    expect([g.coreTargetRow, g.coreTargetCol, FLOW.supportSpan, FLOW.span]).toEqual([15, 4, 4, 2]);
    const before = g.board.slice(),
      active = g.type,
      s0 = stats(g);
    const log = recordEvents(g, ['cyclamen', 'core']);
    expect(g.canCyc()).toBe(true);
    expect(g.useCyc()).toBe(true);
    expect([g.cycSupport, g.multT, g.pending?.kind]).toEqual(['trigger', CFG.cycMultMs, 'flush']);
    const cells = [...(g.pending?.cells ?? [])];
    expect(cells).toEqual([0, 2, 3, 4, 5, 6, 7, 8].map((x) => idx(x, 15))); // 0-8 (9 sütun), (1, 15) renkli
    expect(log.payloads('cyclamen')).toEqual([{ core: true }]);
    expect(log.payloads('core').map((e) => e.kind)).toEqual(['triggered']);
    expect([g.coreLife, g.coreTargetRow, findCore(g.board, g.plant)]).toEqual([0, -1, -1]);
    finishClear(g); // drenaj
    for (let k = 16 * COLS; k < g.board.length; k++) expect(g.board[k], `sıra ${(k / COLS) | 0}`).toBe(before[k]);
    expect(g.board[idx(1, 15)]).toBe(PIECE.Z);
    expect(g.pending?.kind).toBe('collapse');
    expect(g.pending?.moves).toEqual([
      [idx(3, 14), idx(3, 15)],
      [idx(4, 14), idx(4, 15)],
      [idx(4, 13), idx(4, 14)],
      [idx(5, 14), idx(5, 15)],
    ]);
    finishClear(g); // çökme
    for (let k = 0; k < (ROWS - 1) * COLS; k++)
      if (g.board[k] && g.board[k] !== PIECE.GARBAGE) expect(g.board[k + COLS], `havada ${k}`).not.toBe(0);
    expect([g.state, g.type]).toEqual(['play', active]); // düşen parça sürer
    expect(stats(g)).toEqual(s0); // drenaj bonusu yok; satır, seviye, kombo, b2b aynı
    expect(log.payloads('core').at(-1)).toEqual({ kind: 'drained', cells: 8, moved: 4, power: true });
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

  it('son oda (10 gri sıra) tek basışta açılmaz', () => {
    let tested = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = createGame(seed);
      g.reset({ rooms: true });
      g.enterRoom(3);
      const gray0 = g.grayCount();
      placePiece(g, PIECE.O, 0, 3, 0);
      g.core = true;
      g.hardDrop();
      if (g.coreLife === 0) continue; // bu tohumda kanal tam altına denk geldi
      expect(g.canCyc()).toBe(true); // %50 tıkanıklık
      g.useCyc();
      while (g.pending) finishClear(g);
      expect(g.room, `tohum ${seed}`).toBe(3);
      expect(gray0 - g.grayCount()).toBeLessThanOrEqual(9);
      expect(g.grayCount()).toBeGreaterThan(0);
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });
});

describe('aktif çekirdek yokken', () => {
  it('düşen parçaya dokunmaz; sıradaki ilk çekirdeksiz parça çekirdeklenir; drenaj yok', () => {
    const g = createGame(2);
    congested(g);
    g.queueCore.fill(false);
    const active = g.type,
      core = g.core,
      ver = g.queueVer,
      gray = g.grayCount();
    const log = recordEvents(g, ['cyclamen']);
    expect(g.useCyc()).toBe(true);
    expect([g.cycSupport, g.type, g.core, g.pending, g.grayCount()]).toEqual(['seed', active, core, null, gray]);
    expect([g.queueCore[0], g.queueVer, g.multT]).toEqual([true, ver + 1, CFG.cycMultMs]);
    expect(log.payloads('cyclamen')).toEqual([{ core: false }]);
    // sıradaki zaten çekirdekliyse bir sonrakine
    const h = createGame(3);
    congested(h);
    h.queueCore.fill(false);
    h.queueCore[0] = true;
    h.useCyc();
    expect(h.queueCore.slice(0, 2)).toEqual([true, true]);
  });

  it('çekirdeklenen parça Hold ile korunur; kilitte V3 yakınlık kuralı: griye yakınsa aktifleşir', () => {
    const g = createGame(4);
    congested(g);
    g.queueCore.fill(false);
    g.useCyc();
    placePiece(g, PIECE.O, 0, 7, 0);
    g.hardDrop(); // çekirdeklenen parça doğar
    expect(g.core).toBe(true);
    g.doHold();
    expect(g.holdCore).toBe(true);
    g.canHold = true;
    g.doHold();
    expect(g.core).toBe(true);
    const t = g.type === 0 ? PIECE.T : g.type;
    placePiece(g, t, 0, 3, 0);
    g.core = true;
    g.hardDrop();
    expect(g.coresArmed).toBe(1);
  });

  it('griye uzak kilitlenirse V3 kuralıyla söner', () => {
    const f = createGame(5);
    congested(f);
    f.queueCore.fill(false);
    f.useCyc();
    placePiece(f, PIECE.O, 0, 7, 0);
    f.hardDrop();
    expect(f.core).toBe(true);
    for (let y = 8; y < 15; y++) f.board[idx(0, y)] = PIECE.S; // 0. sütunda kule
    f.boardVer++;
    placePiece(f, PIECE.I, 1, -2, 0);
    f.core = true;
    f.hardDrop(); // kulenin tepesinde: en yakın gri 15. sırada, uzak
    expect([f.coresFizzled, f.coresArmed, f.coreLife]).toEqual([1, 0, 0]);
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
