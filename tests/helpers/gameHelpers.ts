// NS4-05: oyun motoru testleri için ortak yardımcılar.
// Her test kendi tahtasını kurar; yardımcılar yalnızca Game'in public alanlarını ve
// metodlarını kullanır. Math.random taklitleri vitest.config.ts'teki restoreMocks ile
// her testten sonra geri alınır.
import { vi } from 'vitest';
import { CFG, COLS, ROWS } from '../../src/config/gameConfig';
import { Game } from '../../src/game/Game';
import { PIECE } from '../../src/game/pieces';
import type { GameEventName, GameEvents } from '../../src/types/events';
import type { BlockId, CellValue, RotationState, TetrominoType } from '../../src/types/game';

/** Tohumlu LCG ile Math.random'ı deterministik yapar (değerler [0, 1) aralığında). */
export function mockRandom(seed = 1) {
  let s = seed >>> 0;
  return vi.spyOn(Math, 'random').mockImplementation(() => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  });
}

/** Oyunu uygulamadaki gibi başlatır: new Game() + reset() (durum 'play'). */
export function createGame(seed = 1): Game {
  mockRandom(seed);
  const g = new Game();
  g.reset();
  return g;
}

export function idx(x: number, y: number): number {
  return y * COLS + x;
}

export function getCell(g: Game, x: number, y: number): CellValue {
  return g.board[idx(x, y)] as CellValue;
}

export function rowCells(g: Game, y: number): number[] {
  return Array.from(g.board.subarray(y * COLS, y * COLS + COLS));
}

/** Tahta değişikliklerinde boardVer artırılır (congestion() önbelleği buna bağlıdır). */
export function clearBoard(g: Game): void {
  g.board.fill(0);
  g.boardVer++;
}

export function setCell(g: Game, x: number, y: number, v: BlockId = PIECE.GARBAGE): void {
  g.board[idx(x, y)] = v;
  g.boardVer++;
}

/** Satırı v ile doldurur; holes içindeki sütunlar boş kalır. */
export function fillRow(g: Game, y: number, v: BlockId = PIECE.GARBAGE, holes: readonly number[] = []): void {
  for (let x = 0; x < COLS; x++) g.board[idx(x, y)] = holes.includes(x) ? 0 : v;
  g.boardVer++;
}

/** Tahtayı temizler ve en alttaki `rows` satırı 9. sütun boş kalacak şekilde doldurur. */
export function setupWell(g: Game, rows: number, v: BlockId = PIECE.S): void {
  clearBoard(g);
  for (let k = 0; k < rows; k++) fillRow(g, ROWS - 1 - k, v, [9]);
}

/** Tıkanıklık için alttan `rows` satırı (temizlenmeyecek şekilde, 9. sütun boş) doldurur. */
export function stackRows(g: Game, rows: number): void {
  setupWell(g, rows, PIECE.GARBAGE);
}

/** Aktif parçayı verilen konuma koyar (spawn() ile aynı sayaç sıfırlamaları, kuyruktan çekmeden). */
export function placePiece(g: Game, type: TetrominoType, rot: RotationState, x: number, y: number): void {
  g.type = type;
  g.rot = rot;
  g.x = x;
  g.y = y;
  g.lastRot = false;
  g.lockT = 0;
  g.lockResets = 0;
  g.gAcc = 0;
  g.lowestY = y;
  g.pieceVer++;
}

/** Dikey I'yı 9. sütundaki kuyuya bırakır (hard drop). */
export function dropVerticalI(g: Game): void {
  placePiece(g, PIECE.I, 1, 7, 0);
  g.hardDrop();
}

/** Bekleyen temizleme/drenaj işlemini oyunun kendi süresi kadar update() ile bitirir. */
export function finishClear(g: Game): void {
  const p = g.pending;
  if (!p) throw new Error('finishClear: bekleyen temizleme yok');
  const ms = { lines: CFG.lineClearMs, sneeze: CFG.sneezeMs, cyc: CFG.drainMs, room: CFG.roomClearMs };
  g.update(ms[p.kind]);
}

const EVENT_FLAGS: Record<GameEventName, true> = {
  spawn: true,
  move: true,
  rotate: true,
  hold: true,
  lock: true,
  harddrop: true,
  levelup: true,
  gameover: true,
  clearstart: true,
  clearend: true,
  scored: true,
  powerdone: true,
  roomstart: true,
  roomclear: true,
};
/** GameEvents içindeki tüm olay adları (Record tipi eksik/fazla adı derleme hatası yapar). */
export const ALL_EVENTS = Object.keys(EVENT_FLAGS) as GameEventName[];

export interface RecordedEvent {
  readonly name: GameEventName;
  readonly args: readonly unknown[];
}

export interface EventLog {
  readonly all: RecordedEvent[];
  names(): GameEventName[];
  payloads<K extends GameEventName>(name: K): GameEvents[K][];
  count(name: GameEventName): number;
  clear(): void;
}

/** Olayları sırasıyla kaydeder. */
export function recordEvents(g: Game, names: readonly GameEventName[] = ALL_EVENTS): EventLog {
  const all: RecordedEvent[] = [];
  for (const name of names) g.on(name, (...args: readonly unknown[]) => all.push({ name, args }));
  return {
    all,
    names: () => all.map((e) => e.name),
    payloads: <K extends GameEventName>(name: K) =>
      all.filter((e) => e.name === name).map((e) => e.args[0] as GameEvents[K]),
    count: (name) => all.filter((e) => e.name === name).length,
    clear: () => {
      all.length = 0;
    },
  };
}
