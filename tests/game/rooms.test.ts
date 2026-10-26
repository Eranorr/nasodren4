// NS4-27: Sinüs Odaları: oda başlangıcı (delikli gri bulutçuklar), geçme şartı (son gri hücre temizlenir),
// "Sinüs açıldı" geçişi, bonus, sonraki oda ve Serbest nefes.
import { describe, expect, it } from 'vitest';
import { CFG, COLS, ROOMS, ROWS, VIS } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import {
  clearBoard,
  createGame,
  dropVerticalI,
  fillRow,
  finishClear,
  recordEvents,
  rowCells,
} from '../helpers/gameHelpers';

const grayRows = (g: ReturnType<typeof createGame>) => {
  const out: number[] = [];
  for (let y = 0; y < ROWS; y++) if (rowCells(g, y).some((v) => v === PIECE.GARBAGE)) out.push(y);
  return out;
};

/** Odanın bütün gri hücrelerini silip tek bir gri satır bırakır; dikey I ile tamamlanınca oda açılır. */
function lastGrayRow(g: ReturnType<typeof createGame>) {
  clearBoard(g);
  fillRow(g, ROWS - 1, PIECE.GARBAGE, [9]);
}

describe('oda başlangıcı', () => {
  it('reset() oda akışını açmaz: tahta boş (testler ve eski davranış)', () => {
    const g = createGame(1);
    expect([g.rooms, g.room, g.roomGray]).toEqual([false, 0, 0]);
    expect(g.board.every((v) => v === 0)).toBe(true);
  });

  it('reset({ rooms }) 1. odayı kurar: alttan 4 sıra delikli gri bulutçuk, dolu sıra yok', () => {
    const g = createGame(1);
    const log = recordEvents(g, ['roomstart']);
    g.reset({ rooms: true });
    expect([g.rooms, g.room]).toEqual([true, 0]);
    expect(grayRows(g)).toEqual([18, 19, 20, 21]);
    for (const y of grayRows(g)) {
      const holes = rowCells(g, y).filter((v) => v === 0).length;
      expect(holes).toBeGreaterThanOrEqual(1);
      expect(holes).toBeLessThanOrEqual(ROOMS[0].maxHoles);
    }
    expect(g.roomGray).toBe(g.grayCount());
    expect(g.congestion()).toBe(4 / VIS);
    expect(log.payloads('roomstart')).toEqual([{ room: 0, gray: g.roomGray }]);
    expect(g.state).toBe('play');
    expect(g.type).not.toBe(0);
  });

  it('her oda kendi sıra sayısı ve boşluk aralığıyla kurulur; tıkanıklık odadan odaya artar', () => {
    const g = createGame(3);
    let prev = 0;
    ROOMS.forEach((def, i) => {
      for (let k = 0; k < 20; k++) {
        g.enterRoom(i);
        expect(grayRows(g)).toHaveLength(def.rows);
        for (const y of grayRows(g)) {
          const holes = rowCells(g, y).filter((v) => v === 0).length;
          expect(holes).toBeGreaterThanOrEqual(1);
          expect(holes).toBeLessThanOrEqual(def.maxHoles);
        }
      }
      expect(g.congestion()).toBeGreaterThan(prev);
      prev = g.congestion();
    });
    expect(ROOMS.map((r) => r.rows)).toEqual([4, 6, 8, 10]);
  });
});

describe('geçme şartı: bütün gri bulutçuklar temizlenir', () => {
  it('kısmi temizleme odayı açmaz', () => {
    const g = createGame(1);
    g.reset({ rooms: true });
    clearBoard(g);
    fillRow(g, ROWS - 1, PIECE.GARBAGE, [9]);
    fillRow(g, ROWS - 2, PIECE.GARBAGE, [0, 9]); // ikinci satır tamamlanmaz
    const log = recordEvents(g, ['roomclear']);
    dropVerticalI(g);
    finishClear(g);
    expect(log.count('roomclear')).toBe(0);
    expect([g.state, g.room, g.roomGray]).toEqual(['play', 0, COLS - 2]);
  });

  it('son gri satır temizlenince: bonus, "Sinüs açıldı" geçişi, sonra 2. oda ve yeni parça', () => {
    const g = createGame(1);
    g.reset({ rooms: true });
    lastGrayRow(g);
    const log = recordEvents(g, ['scored', 'roomclear', 'clearstart', 'clearend', 'roomstart', 'spawn']);
    dropVerticalI(g);
    const linePts = log.payloads('scored')[0]?.pts ?? 0;
    finishClear(g);
    expect(log.payloads('roomclear')).toEqual([{ room: 0, bonus: CFG.roomBonus * 1 * 1 }]);
    expect(g.score).toBe(18 * 2 + linePts + CFG.roomBonus);
    expect([g.state, g.type, g.pending]).toEqual(['clearing', 0, { kind: 'room', rows: [] }]);
    expect(g.roomsCleared).toBe(1);
    g.update(CFG.roomClearMs - 1);
    expect(g.room).toBe(0);
    log.clear();
    g.update(1);
    expect(log.names()).toEqual(['roomstart', 'clearend', 'spawn']);
    expect([g.state, g.room]).toEqual(['play', 1]);
    expect(grayRows(g)).toHaveLength(ROOMS[1].rows);
    expect(g.type).not.toBe(0);
  });

  it('bonus oda sırası ve seviyeyle büyür', () => {
    const g = createGame(1);
    g.reset({ rooms: true });
    g.enterRoom(2);
    g.level = 3;
    lastGrayRow(g);
    const log = recordEvents(g, ['roomclear']);
    dropVerticalI(g);
    finishClear(g);
    expect(log.payloads('roomclear')).toEqual([{ room: 2, bonus: CFG.roomBonus * 3 * 3 }]);
  });

  it('hapşırık son bulutçukları savurursa oda açılır; aktif parça kaybolmaz (sıradaki olur)', () => {
    const g = createGame(1);
    g.reset({ rooms: true });
    g.enterRoom(2); // 8 sıra: %40, güçler açık
    // gri yalnızca yığının en üstteki 3 sırasında (15..17), altında renkli sıralar: tıkanıklık %35
    clearBoard(g);
    for (let y = ROWS - 7; y < ROWS - 4; y++) fillRow(g, y, PIECE.GARBAGE, [9]);
    for (let y = ROWS - 4; y < ROWS; y++) fillRow(g, y, PIECE.S, [9]);
    const active = g.type;
    expect(g.useSneeze()).toBe(true);
    finishClear(g);
    expect(g.pending?.kind).toBe('room');
    expect(g.queue[0]).toBe(active);
    finishClear(g);
    expect([g.room, g.type]).toEqual([3, active]);
  });

  it('sıklamen drenajı alttaki bulutçukları eritip odayı açabilir', () => {
    const g = createGame(1);
    g.reset({ rooms: true });
    g.enterRoom(2); // 8 sıra gri, %40
    const log = recordEvents(g, ['roomclear']);
    expect(g.useCyc()).toBe(true);
    finishClear(g);
    expect(log.payloads('roomclear')).toEqual([{ room: 2, bonus: CFG.roomBonus * 3 }]);
  });
});

describe('Serbest nefes', () => {
  it('son oda açılınca tahta boş, oda olayı bir daha gelmez; oyun sonsuz sürer', () => {
    const g = createGame(1);
    g.reset({ rooms: true });
    g.enterRoom(ROOMS.length - 1);
    lastGrayRow(g);
    const log = recordEvents(g, ['roomstart', 'roomclear']);
    dropVerticalI(g);
    finishClear(g);
    finishClear(g);
    expect(g.room).toBe(ROOMS.length);
    expect(log.payloads('roomstart')).toEqual([{ room: ROOMS.length, gray: 0 }]);
    expect(g.board.every((v) => v === 0)).toBe(true);
    expect(g.roomsCleared).toBe(1);
    // gri olmadan satır temizleme: oda olayı yok
    log.clear();
    fillRow(g, ROWS - 1, PIECE.S, [9]);
    dropVerticalI(g);
    finishClear(g);
    expect(log.count('roomclear')).toBe(0);
    expect(g.state).toBe('play');
  });
});
