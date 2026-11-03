// Sinüzit Atağı ve Spray (kural seti sinus-attack-spray-v1; docs/SINUS-ATTACK-AND-SPRAY-FINAL.md): zamanlama, atak
// satırı ve dağınık griler, hücre kaynağı katmanı, Spray, atak satırı puan kuralı, oda geçişinde taşıma, çekirdek ve
// Sıklamen gücünün atak grisini görmemesi, çok oyunculu determinizm.
import { describe, expect, it, vi } from 'vitest';
import { CFG, COLS, HIDDEN, ROOMS, ROWS } from '../../src/config/gameConfig';
import { FLOW, findCore, grayCellsInSpan, nearGrayRow, powerRows } from '../../src/game/cyclamenFlow';
import { Game } from '../../src/game/Game';
import { PIECE } from '../../src/game/pieces';
import { ORIGIN, SINUS, carryAttackCells, pickAttackCells, scatterGray } from '../../src/game/sinusAttack';
import type { RotationState, TetrominoType } from '../../src/types/game';
import { expectedLevel, maxPlausibleScore } from '../../supabase/functions/_shared/scoreRules.ts';
import {
  clearBoard,
  dropVerticalI,
  fillRow,
  finishClear,
  idx,
  placePiece,
  recordEvents,
  setupWell,
  stackRows,
} from '../helpers/gameHelpers';

function game(seed = 7, rooms = false) {
  const g = new Game();
  g.reset({ seed, rooms });
  return g;
}
const stats = (g: Game) => ({ lines: g.lines, level: g.level, combo: g.combo, b2b: g.b2b, score: g.score });
const settle = (g: Game) => {
  for (let i = 0; i < 10 && g.pending && g.pending.kind !== 'room'; i++) finishClear(g);
};
const fullRows = (g: Game) =>
  Array.from({ length: ROWS }, (_, y) => y).filter((y) =>
    Array.from({ length: COLS }, (_, x) => x).every((x) => g.board[idx(x, y)] !== 0),
  );
const trigger = (g: Game) => {
  g.attackT = SINUS.attackMs - 1;
  g.update(1);
};
const cellsOf = (g: Game, o: number) =>
  [...g.board.keys()].filter((k) => g.board[k] === PIECE.GARBAGE && g.origin[k] === o);
const setAttack = (g: Game, x: number, y: number) => {
  g.board[idx(x, y)] = PIECE.GARBAGE;
  g.origin[idx(x, y)] = ORIGIN.attack;
  g.boardVer++;
};
/** Kaynak katmanı tahtayla tutarlı: kaynak yalnızca gri hücrede; renkli ve boş hücrede 0; boş hücrede bitki yok. */
function consistent(g: Game) {
  for (let k = 0; k < g.board.length; k++) {
    const o = g.origin[k] ?? 0;
    if (g.board[k] === PIECE.GARBAGE) {
      if (o !== ORIGIN.room && o !== ORIGIN.attack) return `gri ${k} kaynaksız`;
      if (g.plant[k]) return `gri ${k} bitkili`;
    } else if (o !== ORIGIN.none) return `hücre ${k} (${g.board[k]}) kaynak ${o}`;
    if (!g.board[k] && g.plant[k]) return `boş ${k} bitkili`;
  }
  return 'ok';
}

describe('kural değerleri', () => {
  it('60 sn; 3 dağınık gri, alt 8 sıra; Spray 30 renkli hücrede, en çok 8 atak grisi', () => {
    expect(SINUS).toEqual({ attackMs: 60_000, attackScatter: 3, attackZoneRows: 8, sprayThreshold: 30, sprayCells: 8 });
    expect([HIDDEN, ROOMS.length]).toEqual([2, 4]);
  });
  it('parça sırası (tohumlu) atak ve Spray akışlarından etkilenmez; tohumsuz oyunda kurulum ek sayı çekmez', () => {
    const a = game(11, true),
      b = game(11, true);
    const dealt = (g: Game) => {
      const out: number[] = [g.type];
      g.on('spawn', () => out.push(g.type));
      return out;
    };
    const da = dealt(a),
      db = dealt(b);
    for (let i = 0; i < 40; i++) {
      if (a.state === 'play') a.hardDrop();
      if (b.state === 'play') b.hardDrop();
      if (i === 5) trigger(a); // yalnızca a'da atak
      a.update(400);
      b.update(400);
    }
    const n = Math.min(da.length, db.length);
    expect(n).toBeGreaterThan(5);
    expect(da.slice(0, n)).toEqual(db.slice(0, n));
    const g = new Game();
    const spy = vi.spyOn(Math, 'random');
    g.reset({ seed: 3 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Sinüzit Atağı: zamanlama', () => {
  it('yalnızca aktif oynanışta dolar; 60 sn dolunca bir kez tetiklenir ve sıfırlanır', () => {
    const g = game();
    clearBoard(g);
    const log = recordEvents(g, ['attackstart', 'attack']);
    g.update(SINUS.attackMs - 1);
    expect([g.attacks, g.attackT]).toEqual([0, SINUS.attackMs - 1]);
    g.update(1);
    expect([g.attacks, g.attackT, log.payloads('attack').length, log.payloads('attackstart').length]).toEqual([
      1, 0, 1, 1,
    ]);
    g.update(SINUS.attackMs - 1);
    expect(g.attacks).toBe(1);
  });
  it('satır temizleme, drenaj, çökme, oda geçişi ve oyun sonunda durur (mola: update çağrılmaz)', () => {
    const g = game();
    setupWell(g, 1);
    dropVerticalI(g);
    expect(g.state).toBe('clearing');
    const t = g.attackT;
    g.update(CFG.lineClearMs - 1);
    expect(g.attackT).toBe(t);
    const d = game();
    stackRows(d, 8);
    d.useCyc(); // drenaj ('draining')
    const t1 = d.attackT;
    d.update(FLOW.rowMs - 1);
    expect([d.state, d.attackT]).toEqual(['draining', t1]);
    const r = game(5, true);
    r.beginRoomClear(); // oda geçişi
    const t2 = r.attackT;
    r.update(CFG.roomClearMs - 1);
    expect(r.attackT).toBe(t2);
    const o = game();
    o.gameOver('blockout');
    o.update(SINUS.attackMs * 2);
    expect(o.attacks).toBe(0);
  });
});

describe('Sinüzit Atağı: atak satırı ve dağınık griler', () => {
  it('tek boşluklu atak satırı; tahta, bitki ve kaynak bir sıra yukarı; satır ve puan sayılmaz', () => {
    const g = game();
    clearBoard(g);
    fillRow(g, ROWS - 1, PIECE.S, [4]);
    g.plant[idx(2, ROWS - 1)] = 0x15;
    const s0 = stats(g),
      y0 = g.y;
    const log = recordEvents(g, ['attack']);
    g.sinusAttack();
    const hole = log.payloads('attack')[0]?.hole ?? -1;
    for (let x = 0; x < COLS; x++) {
      expect(g.board[idx(x, ROWS - 1)]).toBe(x === hole ? 0 : PIECE.GARBAGE);
      expect(g.origin[idx(x, ROWS - 1)]).toBe(x === hole ? ORIGIN.none : ORIGIN.attack);
    }
    expect(g.channelAt[ROWS - 1]).toBe(hole);
    for (let x = 0; x < COLS; x++) if (x !== 4) expect(g.board[idx(x, ROWS - 2)]).toBe(PIECE.S);
    expect(g.plant[idx(2, ROWS - 2)]).toBe(0x15);
    expect(g.y).toBe(y0 - 1); // düşen parça tahtayla birlikte
    expect(stats(g)).toEqual(s0);
    expect(consistent(g)).toBe('ok');
  });
  it('alt 8 sırada en çok 3 atak grisi; dolu hücrenin üstüne yazmaz; tam satır oluşturmaz', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const g = game(seed);
      clearBoard(g);
      for (let y = ROWS - 8; y < ROWS; y++) fillRow(g, y, PIECE.T, [y % COLS, (y + 3) % COLS]);
      const before = g.board.slice();
      g.type = 0;
      g.sinusAttack();
      let added = 0;
      for (let k = 0; k < (ROWS - 1) * COLS; k++) {
        const was = before[k + COLS] ?? 0;
        if (was) expect(g.board[k], `tohum ${seed} hücre ${k}`).toBe(was);
        else if (g.board[k] === PIECE.GARBAGE) {
          added++;
          expect(g.origin[k]).toBe(ORIGIN.attack);
          expect((k / COLS) | 0).toBeGreaterThanOrEqual(ROWS - SINUS.attackZoneRows);
        }
      }
      expect(added).toBeLessThanOrEqual(SINUS.attackScatter);
      expect(fullRows(g), `tohum ${seed}`).toEqual([]);
    }
  });
  it('hava kanalı kapanmaz: oda kanalları atakla kayar, dağınık gri kanala düşmez', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = game(seed, true);
      g.enterRoom(3);
      const ch = [...g.channelAt];
      g.sinusAttack();
      for (let y = 0; y < ROWS - 1; y++) expect(g.channelAt[y]).toBe(ch[y + 1]);
      for (let y = 0; y < ROWS; y++) {
        const c = g.channelAt[y] ?? -1;
        if (c >= 0) expect(g.board[idx(c, y)], `tohum ${seed} sıra ${y}`).toBe(0);
      }
    }
  });
  it('uygun boş hücre yoksa daha az ekler; düşen parçanın altına yazmaz', () => {
    const board = new Uint8Array(COLS * ROWS),
      origin = new Uint8Array(COLS * ROWS);
    for (let y = ROWS - 8; y < ROWS; y++) for (let x = 0; x < COLS - 1; x++) board[y * COLS + x] = PIECE.S;
    expect(scatterGray(board, origin, new Int8Array(ROWS).fill(-1), () => 0.5, 3, 8)).toEqual([]);
    const g = game(9);
    clearBoard(g);
    placePiece(g, PIECE.O, 0, 3, ROWS - 4);
    g.sinusAttack();
    for (const k of [idx(4, g.y), idx(5, g.y), idx(4, g.y + 1), idx(5, g.y + 1)]) expect(g.board[k]).toBe(0);
  });
  it('top-out: en üst sıra doluyken atak oyunu bitirir (blockout)', () => {
    const g = game();
    clearBoard(g);
    g.board[idx(0, 0)] = PIECE.S;
    const log = recordEvents(g, ['gameover']);
    trigger(g);
    expect([g.state, log.payloads('gameover')]).toEqual(['over', ['blockout']]);
  });
});

describe('hücre kaynağı katmanı', () => {
  it('oda grileri oda kaynaklı; kanal boşluğu kaynaksız; board değeri değişmez', () => {
    const g = game(3, true);
    expect(g.origin.length).toBe(g.board.length);
    expect(cellsOf(g, ORIGIN.room)).toHaveLength(g.grayCount());
    expect(consistent(g)).toBe('ok');
  });
  it('satır silme, hücre silme, kilit, çökme, oda geçişi ve reset sonrasında tutarlı; boş hücrede kaynak kalmaz', () => {
    const g = game(9, true);
    trigger(g);
    const hole = [...g.board.slice((ROWS - 1) * COLS)].indexOf(0);
    g.board[idx(hole, ROWS - 1)] = PIECE.L;
    g.removeRows([ROWS - 1]);
    expect(consistent(g)).toBe('ok');
    const gray = g.board.findIndex((v) => v === PIECE.GARBAGE);
    g.removeCells([gray]);
    expect(g.origin[gray]).toBe(ORIGIN.none);
    g.origin.fill(ORIGIN.attack, 0, COLS * 6); // bozuk durum: kilit kendi hücrelerini temizler
    for (let k = 0; k < COLS * 6; k++) if (g.board[k] !== PIECE.GARBAGE) g.origin[k] = 0;
    g.hardDrop();
    expect(consistent(g)).toBe('ok');
    settle(g);
    g.enterRoom(1);
    expect(consistent(g)).toBe('ok');
    g.reset({ seed: 1 });
    expect([...g.origin].every((v) => v === 0)).toBe(true);
  });
});

describe('Spray', () => {
  it('yalnızca normal standart temizlemede kırılan renkli hücrelerle dolar; 30da dolu; fazla birikmez', () => {
    const g = game();
    setupWell(g, 3);
    dropVerticalI(g); // 3 sıra: 27 S + 3 I = 30
    expect(g.sprayCharge).toBe(30);
    finishClear(g);
    setupWell(g, 2);
    dropVerticalI(g);
    finishClear(g);
    expect(g.sprayCharge).toBe(SINUS.sprayThreshold);
  });
  it('gri hücreler, Sıklamen gücü ve Hapşırık şarj vermez', () => {
    const g = game();
    clearBoard(g);
    for (let y = ROWS - 4; y < ROWS; y++) fillRow(g, y, PIECE.GARBAGE, [9]);
    dropVerticalI(g); // 4 tam sıra, yalnızca I renkli (oda grisi: kaynaksız elle yazıldı)
    expect(g.sprayCharge).toBe(4);
    finishClear(g);
    stackRows(g, 8);
    g.useCyc();
    settle(g);
    stackRows(g, 8);
    g.useSneeze();
    settle(g);
    expect(g.sprayCharge).toBe(4);
  });
  it('atak grisi yokken kullanılamaz ve şarj harcanmaz; atak gelince yeniden kullanılabilir', () => {
    const g = game(8, true);
    g.sprayCharge = SINUS.sprayThreshold;
    const log = recordEvents(g, ['spraystate']);
    g.update(16);
    expect([g.canSpray(), g.sprayNoTarget(), g.useSpray(), g.sprayCharge]).toEqual([
      false,
      true,
      false,
      SINUS.sprayThreshold,
    ]);
    trigger(g);
    g.update(16);
    expect([g.canSpray(), g.sprayNoTarget()]).toEqual([true, false]);
    expect(log.payloads('spraystate')).toEqual(['notarget', 'ready']);
  });
  it('yalnızca görünür atak grisi; en çok 8 benzersiz; oda grisi ve renkli hücre korunur; çökme; şarj sıfır', () => {
    const g = game(12, true);
    trigger(g);
    trigger(g);
    for (let x = 0; x < COLS; x++) if (!g.board[idx(x, ROWS - 3)]) g.board[idx(x, ROWS - 3)] = PIECE.L;
    g.board[idx(4, 0)] = PIECE.GARBAGE; // gizli sırada atak grisi: hedef değil
    g.origin[idx(4, 0)] = ORIGIN.attack;
    g.boardVer++;
    const snap = [...g.origin],
      room = cellsOf(g, ORIGIN.room),
      s0 = stats(g);
    g.sprayCharge = SINUS.sprayThreshold;
    const log = recordEvents(g, ['spray', 'core']);
    expect(g.useSpray()).toBe(true);
    const cells = log.payloads('spray')[0]?.cells ?? [];
    expect(cells.length).toBe(SINUS.sprayCells);
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells.every((k) => snap[k] === ORIGIN.attack && k >= HIDDEN * COLS)).toBe(true);
    expect(g.sprayCharge).toBe(0);
    settle(g);
    expect(cellsOf(g, ORIGIN.room)).toEqual(room);
    for (let k = 0; k < (ROWS - 1) * COLS; k++)
      if (g.board[k] && g.board[k] !== PIECE.GARBAGE) expect(g.board[k + COLS], `havada ${k}`).not.toBe(0);
    expect(stats(g)).toEqual(s0);
    expect(log.payloads('core')).toEqual([]);
    expect(consistent(g)).toBe('ok');
  });
  it('saf seçici: atak grisi 8den azsa yalnızca onlar; deterministik', () => {
    const board = new Uint8Array(COLS * ROWS),
      origin = new Uint8Array(COLS * ROWS);
    for (const k of [210, 215, 100]) {
      board[k] = PIECE.GARBAGE;
      origin[k] = ORIGIN.attack;
    }
    board[211] = PIECE.GARBAGE;
    origin[211] = ORIGIN.room;
    board[212] = PIECE.L;
    expect(pickAttackCells(board, origin, () => 0.3, 8, HIDDEN)).toEqual([100, 210, 215]);
    expect(pickAttackCells(board, origin, () => 0.3, 2, HIDDEN)).toEqual(
      pickAttackCells(board, origin, () => 0.3, 2, HIDDEN),
    );
  });
});

describe('atak satırı puan kuralı', () => {
  /** 4 sıralık kuyu (9. sütun boş); `atk` sıralarının 0. sütunu atak grisi. */
  function well(g: Game, atk: readonly number[]) {
    setupWell(g, 4);
    for (const y of atk) setAttack(g, 0, y);
  }
  it('yalnızca atak satırı: tahtadan silinir; puan, satır, seviye, kombo, B2B, Spray şarjı yok; yeni parça doğar', () => {
    const g = game();
    setupWell(g, 1);
    setAttack(g, 0, ROWS - 1);
    g.combo = 2;
    g.b2b = true;
    const s0 = stats(g);
    const log = recordEvents(g, ['scored', 'attackline', 'harddrop', 'levelup']);
    dropVerticalI(g);
    const drop = (log.payloads('harddrop')[0] ?? 0) * 2;
    expect(log.payloads('scored')).toEqual([]);
    expect(log.payloads('attackline')).toEqual([{ rows: 1, cells: 1 }]);
    expect({ ...stats(g), score: g.score - drop }).toEqual(s0);
    expect([g.sprayCharge, g.attackLines, g.tetrises]).toEqual([0, 1, 0]);
    finishClear(g);
    expect(g.board[idx(0, ROWS - 1)]).not.toBe(PIECE.GARBAGE); // satır silindi
    expect(g.state).toBe('play');
    expect(g.type).not.toBe(0);
  });
  it('4 satırın 1i atak satırı: 3 normal satır gibi puanlanır (Tetris değil); şarj yalnızca normal satırlardan', () => {
    const g = game();
    well(g, [ROWS - 1]);
    const spy = vi.spyOn(g, 'scoreClear');
    const log = recordEvents(g, ['scored', 'attackline']);
    dropVerticalI(g);
    expect(spy).toHaveBeenCalledWith(3, 0);
    expect(log.payloads('scored')).toEqual([{ n: 3, tspin: 0, b2b: false, combo: 0, pts: 500 }]);
    expect([g.lines, g.tetrises, g.combo, g.b2b]).toEqual([3, 0, 0, false]);
    expect(g.sprayCharge).toBe(30); // 3 normal sıra: 27 S + 3 I (atak satırının 8 S + 1 I sayılmaz)
    expect(log.payloads('attackline')).toEqual([{ rows: 1, cells: 1 }]);
    finishClear(g);
    expect(fullRows(g)).toEqual([]);
    expect(consistent(g)).toBe('ok');
  });
  it('atak satırı olmadan aynı temizleme Tetris; referans puan formülü değişmez', () => {
    const g = game();
    well(g, []);
    const log = recordEvents(g, ['scored']);
    dropVerticalI(g);
    expect(log.payloads('scored')).toEqual([{ n: 4, tspin: 0, b2b: false, combo: 0, pts: 800 }]);
    expect([g.lines, g.tetrises]).toEqual([4, 1]);
  });
  it('atak satırındaki oda grileri de silinir ve oda ilerlemesine katkı verir', () => {
    const g = game(4, true);
    clearBoard(g);
    for (const x of [0, 1, 2, 3, 4]) {
      g.board[idx(x, ROWS - 1)] = PIECE.GARBAGE;
      g.origin[idx(x, ROWS - 1)] = ORIGIN.room;
    }
    setAttack(g, 5, ROWS - 1);
    for (const x of [6, 7, 8]) g.board[idx(x, ROWS - 1)] = PIECE.S;
    g.roomGray = g.roomGoalGray();
    expect(g.roomGray).toBe(5);
    const log = recordEvents(g, ['roomclear', 'scored']);
    dropVerticalI(g);
    finishClear(g);
    expect(log.payloads('scored')).toEqual([]);
    expect(log.payloads('roomclear')).toHaveLength(1); // oda grisi kalmadı: oda açılır
    expect(g.pending?.kind).toBe('room');
  });
  it('atak satırı aktif çekirdeği tetiklemez (yalnızca normal satır tetikler)', () => {
    const g = game();
    clearBoard(g);
    fillRow(g, 21, PIECE.S, [9]);
    setAttack(g, 0, 21);
    fillRow(g, 20, PIECE.GARBAGE, [0, 3, 9]);
    placePiece(g, PIECE.T, 0, 5, 0);
    g.core = true;
    g.hardDrop();
    expect(g.coreLife).toBe(FLOW.coreLife);
    const log = recordEvents(g, ['core']);
    dropVerticalI(g); // yalnızca 21. sıra (atak satırı) dolar
    expect(log.payloads('core').map((e) => e.kind)).not.toContain('triggered');
  });
});

describe('oda geçişi: atak grileri taşınır', () => {
  function openRoom(g: Game) {
    g.removeCells(cellsOf(g, ORIGIN.room));
    g.boardVer++;
    expect(g.roomCleared()).toBe(true);
    g.beginRoomClear();
    finishClear(g);
  }
  it('oda hedefi yalnızca oda grileri; atak grileri silinmez, yeni odaya taşınır; puan/satır/şarj yok', () => {
    const g = game(5, true);
    const goal = g.roomGray;
    trigger(g);
    trigger(g);
    expect(g.roomGray).toBe(goal);
    const n = cellsOf(g, ORIGIN.attack).length;
    const s0 = { lines: g.lines, charge: g.sprayCharge };
    openRoom(g);
    expect(g.room).toBe(1);
    expect([cellsOf(g, ORIGIN.attack).length, g.carriedAttackGray]).toEqual([n, n]);
    expect([g.lines, g.sprayCharge]).toEqual([s0.lines, s0.charge]);
    expect(g.roomGray).toBe(cellsOf(g, ORIGIN.room).length);
    expect(fullRows(g)).toEqual([]);
    expect(consistent(g)).toBe('ok');
    // hava kanalına ve oda sıralarının üstünde en üst kanalın sütununa yerleşmez
    for (const k of cellsOf(g, ORIGIN.attack)) expect(g.channelAt[(k / COLS) | 0]).not.toBe(k % COLS);
    const topY = [...g.channelAt].findIndex((c) => c >= 0);
    for (let y = 0; y < topY; y++) expect(g.board[idx(g.channelAt[topY] ?? 0, y)]).toBe(0);
  });
  it('saf yerleşim: eski koordinat korunur; çakışan hücre en yakın güvenli hücreye; renkli/oda grisi ezilmez', () => {
    const b = new Uint8Array(COLS * ROWS),
      p = new Uint8Array(COLS * ROWS),
      o = new Uint8Array(COLS * ROWS),
      ch = new Int8Array(ROWS).fill(-1);
    const y = ROWS - 1;
    b[idx(3, y)] = PIECE.L;
    b[idx(4, y)] = PIECE.GARBAGE;
    o[idx(4, y)] = ORIGIN.room;
    ch[y] = 5;
    const r = carryAttackCells(b, p, o, ch, [idx(1, 10), idx(3, y), idx(4, y), idx(5, y)], SINUS.attackZoneRows);
    expect(r).toEqual({
      placed: [idx(1, 10), idx(2, y), idx(4, y - 1), idx(6, y)],
      relocated: 3,
      overflow: 0,
      lost: 0,
    });
    expect([b[idx(3, y)], o[idx(4, y)], b[idx(5, y)]]).toEqual([PIECE.L, ORIGIN.room, 0]);
  });
  it('alt bölgede yer yoksa üst sıralara; hiç yer yoksa sessiz silme yok: top-out (blockout)', () => {
    const b = new Uint8Array(COLS * ROWS),
      p = new Uint8Array(COLS * ROWS),
      o = new Uint8Array(COLS * ROWS);
    for (let y = ROWS - 8; y < ROWS; y++) for (let x = 1; x < COLS; x++) b[idx(x, y)] = PIECE.GARBAGE;
    expect(carryAttackCells(b, p, o, new Int8Array(ROWS).fill(-1), [idx(0, ROWS - 1)], 8)).toEqual({
      placed: [idx(0, ROWS - 9)],
      relocated: 1,
      overflow: 1,
      lost: 0,
    });
    const g = game(10, true);
    const log = recordEvents(g, ['gameover']);
    expect(g.enterRoom(1, [...g.board.keys()])).toBe(false);
    expect([g.state, g.carryTopouts, log.payloads('gameover')]).toEqual(['over', 1, ['blockout']]);
  });
});

describe('çekirdek ve Sıklamen gücü atak grisini görmez', () => {
  function drop(g: Game, t: TetrominoType, rot: RotationState, x: number, core = false) {
    placePiece(g, t, rot, x, 0);
    g.core = core;
    g.hardDrop();
  }
  /** 21. sıra renkli (0 boş), 20. sıra gri (0 ve 3 boş; kaynak `o20`); çekirdekli T x=5: çiçek (6, 18). */
  function setupCore(g: Game, o20: (x: number) => number) {
    clearBoard(g);
    fillRow(g, 21, PIECE.S, [0]);
    fillRow(g, 20, PIECE.GARBAGE, [0, 3]);
    for (let x = 0; x < COLS; x++) if (g.board[idx(x, 20)] === PIECE.GARBAGE) g.origin[idx(x, 20)] = o20(x);
    drop(g, PIECE.T, 0, 5, true);
  }
  it('yakında yalnız oda grisi: aktifleşir; yalnız atak grisi: söner (kaynak bozulmaz)', () => {
    const a = game();
    setupCore(a, () => ORIGIN.room);
    expect([a.coreLife, a.coreTargetRow, a.coreTargetCol]).toEqual([FLOW.coreLife, 20, 6]);
    const b = game();
    setupCore(b, () => ORIGIN.attack);
    expect([b.coreLife, b.coresFizzled, findCore(b.board, b.plant)]).toEqual([0, 1, -1]);
    expect(cellsOf(b, ORIGIN.attack)).toHaveLength(8);
    expect(consistent(b)).toBe('ok');
  });
  it('hedef seçimi: atak grisi hiç yokmuş gibi (sıra aynı)', () => {
    const b = new Uint8Array(COLS * ROWS),
      o = new Uint8Array(COLS * ROWS);
    const put = (x: number, y: number, src: number) => {
      b[idx(x, y)] = PIECE.GARBAGE;
      o[idx(x, y)] = src;
    };
    put(5, 11, ORIGIN.attack); // en yakın ama atak
    put(4, 12, ORIGIN.room);
    put(6, 8, ORIGIN.room);
    expect(nearGrayRow(b, idx(5, 10), o)).toBe(12);
    expect(nearGrayRow(b, idx(5, 10))).toBe(11); // kaynak katmanı verilmezse (saf, eski kural) atak sayılır
  });
  it('normal drenaj yalnızca oda grileri (±2, en çok 5); aralıktaki atak grisi korunur; puan/satır değişmez', () => {
    const g = game();
    setupCore(g, (x) => (x === 5 || x === 6 ? ORIGIN.attack : ORIGIN.room));
    drop(g, PIECE.I, 1, -2); // 0. sütun: 21. sıra temizlenir, hedef 21'e kayar
    finishClear(g);
    expect(g.pending?.cells).toEqual([idx(4, 21), idx(7, 21), idx(8, 21)]);
    const s = stats(g);
    while (g.pending) finishClear(g);
    expect(stats(g)).toEqual(s);
    expect([g.origin[idx(5, 21)], g.origin[idx(6, 21)]]).toEqual([ORIGIN.attack, ORIGIN.attack]);
    expect(FLOW.flushBonus).toBe(0);
    expect(consistent(g)).toBe('ok');
  });
  it('Sıklamen gücü yalnızca oda grisi içeren sıraları seçer ve yalnızca oda grilerini siler', () => {
    const g = game();
    stackRows(g, 8);
    for (let y = 14; y < ROWS; y++) for (let x = 0; x < 9; x++) g.origin[idx(x, y)] = ORIGIN.room;
    for (let x = 0; x < 9; x++) g.origin[idx(x, 21)] = ORIGIN.attack;
    for (const x of [5, 6, 7, 8]) g.origin[idx(x, 20)] = ORIGIN.attack;
    const atk = cellsOf(g, ORIGIN.attack);
    expect(powerRows(g.board, -1, 3, g.origin)).toEqual([18, 19, 20]);
    expect(grayCellsInSpan(g.board, 20, 0, COLS, g.origin)).toHaveLength(5);
    g.useCyc();
    expect(g.pending?.cells?.every((k) => g.origin[k] === ORIGIN.room)).toBe(true);
    while (g.pending) finishClear(g);
    expect(cellsOf(g, ORIGIN.attack)).toEqual(atk);
    expect([g.sprayCharge, consistent(g)]).toEqual([0, 'ok']);
  });
});

describe('çok oyunculu determinizm', () => {
  function client(seed: number) {
    const g = new Game();
    g.reset({ seed, rooms: true });
    const log: string[] = [];
    g.on('attack', (e) => log.push(`A@${Math.round(g.elapsed)}:${e.hole}:${e.scattered}`));
    g.on('spray', (e) => log.push(`S:${e.cells.join('.')}`));
    g.on('core', (e) => log.push(`C:${e.kind}`));
    g.on('attackline', (e) => log.push(`L:${e.rows}:${e.cells}`));
    g.on('roomstart', (e) => log.push(`R${e.room}:${[...g.origin].join('')}`));
    g.on('gameover', (r) => log.push(`O:${r}@${Math.round(g.elapsed)}`));
    for (let step = 0; step < 4000 && g.state !== 'over'; step++) {
      if (g.state === 'play' && step % 4 === 0) g.hardDrop();
      if (step % 15 === 14) {
        for (let k = 0; k < g.board.length; k++) if (g.board[k] && g.board[k] !== PIECE.GARBAGE) g.board[k] = 0;
        g.plant.fill(0);
        g.boardVer++;
      }
      if (step % 250 === 249 && g.state === 'play') g.removeCells(cellsOf(g, ORIGIN.room));
      if (step % 120 === 0 && g.state === 'play') g.sprayCharge = SINUS.sprayThreshold;
      if (step % 7 === 0 && g.canSpray()) g.useSpray();
      if (g.canCyc()) g.useCyc();
      g.update(100);
    }
    log.push(`${g.score}|${g.lines}|${g.level}|${g.attackLines}|${g.carriedAttackGray}|${g.state}|${consistent(g)}`);
    return log;
  }
  it('iki ve üç oyuncu: aynı atak, Spray, kaynak katmanı, taşıma, çekirdek, skor ve sonuç', () => {
    const [a, b, c] = [client(41), client(41), client(41)];
    expect(a.some((l) => l.startsWith('A@'))).toBe(true);
    expect(a.some((l) => l.startsWith('S:'))).toBe(true);
    expect(a.filter((l) => l.startsWith('R')).length).toBeGreaterThan(1);
    expect(a.at(-1)).toMatch(/\|ok$/);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(client(42)).not.toEqual(a);
  });
  it('skor üst sınırı (maxPlausibleScore) yeni kuralla geçerli: atak satırı puan ve satır eklemez', () => {
    for (const seed of [41, 43, 47]) {
      const g = new Game();
      g.reset({ seed, rooms: true });
      for (let step = 0; step < 6000 && g.state !== 'over'; step++) {
        if (g.state === 'play' && step % 5 === 0) g.hardDrop();
        if (g.canSpray()) g.useSpray();
        if (g.canCyc()) g.useCyc();
        if (g.canSneeze()) g.useSneeze();
        g.update(100);
      }
      const dur = Math.max(1, Math.round(g.elapsed / 1000));
      expect(Number.isFinite(g.score)).toBe(true);
      expect(g.level).toBe(expectedLevel(g.lines));
      expect(g.score).toBeLessThanOrEqual(maxPlausibleScore(g.lines, g.level, dur));
    }
  });
  it('tohumlu oyunda atak ve Spray Math.random çağırmaz', () => {
    const g = new Game();
    const spy = vi.spyOn(Math, 'random');
    g.reset({ seed: 42, rooms: true });
    for (let i = 0; i < 400 && g.state !== 'over'; i++) {
      if (g.state === 'play' && i % 3 === 0) g.hardDrop();
      if (i % 12 === 11) clearBoard(g);
      if (i % 50 === 0) g.sprayCharge = SINUS.sprayThreshold;
      if (g.canSpray()) g.useSpray();
      g.update(200);
    }
    expect(g.attacks).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
