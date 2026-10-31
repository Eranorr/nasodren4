// Sıklamen çekirdeği: drenajdan sonra sütun yerçekimi (collapseColumns + 'collapse' evresi). Renkli hücreler griler
// ve taban arasında iner, griler sabit, bitki baytı hücreyle taşınır, kopan saplar temizlenir; çekirdeksiz satır temizlemesinde çalışmaz.
import { describe, expect, it } from 'vitest';
import { COLS, ROWS } from '../../src/config/gameConfig';
import { CORE, FLOW, collapseColumns, hasCore } from '../../src/game/cyclamenFlow';
import { PIECE } from '../../src/game/pieces';
import { LINK, ROLE, plantCode, plantLinks } from '../../src/game/plants';
import type { Game } from '../../src/game/Game';
import { clearBoard, createGame, fillRow, finishClear, idx, placePiece } from '../helpers/gameHelpers';

/** Sütun dizgesi (üstten alta, `ROWS - s.length` sırasından başlar): '#' gri, harf renkli (T), '.' boş. */
function column(board: Uint8Array, x: number, s: string) {
  const y0 = ROWS - s.length;
  for (let i = 0; i < s.length; i++)
    board[(y0 + i) * COLS + x] = s[i] === '#' ? PIECE.GARBAGE : s[i] === '.' ? 0 : PIECE.T;
}
function read(board: Uint8Array, x: number, n: number): string {
  let out = '';
  for (let y = ROWS - n; y < ROWS; y++) {
    const v = board[y * COLS + x];
    out += v === PIECE.GARBAGE ? '#' : v ? 'o' : '.';
  }
  return out;
}
const fresh = () => ({ board: new Uint8Array(COLS * ROWS), plant: new Uint8Array(COLS * ROWS) });

describe('sütun yerçekimi (saf)', () => {
  it('tek renkli hücre tabana iner; arada boş kalmaz', () => {
    const { board, plant } = fresh();
    column(board, 3, 'o...');
    expect(collapseColumns(board, plant, [3])).toEqual([[idx(3, 18), idx(3, 21)]]);
    expect(read(board, 3, 4)).toBe('...o');
  });

  it('renkli hücre kalan gri bloğun hemen üstüne iner, griden geçmez; griler yer değiştirmez', () => {
    const { board, plant } = fresh();
    column(board, 3, 'o..#.');
    collapseColumns(board, plant, [3]);
    expect(read(board, 3, 5)).toBe('..o#.'); // gri altındaki boşluğa geçmedi
  });

  it('bir sütundaki birden çok renkli hücre sırasını korur', () => {
    const { board, plant } = fresh();
    column(board, 0, 'o.o..o.');
    board[idx(0, 15)] = PIECE.I;
    board[idx(0, 17)] = PIECE.S;
    board[idx(0, 20)] = PIECE.Z;
    collapseColumns(board, plant, [0]);
    expect([board[idx(0, 19)], board[idx(0, 20)], board[idx(0, 21)]]).toEqual([PIECE.I, PIECE.S, PIECE.Z]);
    expect(read(board, 0, 7)).toBe('....ooo');
  });

  it('birden çok gri engel arasındaki bölmeler ayrı çözülür; gri sayısı ve yerleri aynı', () => {
    const { board, plant } = fresh();
    column(board, 5, 'o.#o..#o..#');
    const grays = [...board.keys()].filter((k) => board[k] === PIECE.GARBAGE);
    collapseColumns(board, plant, [5]);
    expect(read(board, 5, 11)).toBe('.o#..o#..o#');
    expect([...board.keys()].filter((k) => board[k] === PIECE.GARBAGE)).toEqual(grays);
  });

  it('yalnızca verilen sütunlar; başka sütunda havada hücre değişmez', () => {
    const { board, plant } = fresh();
    column(board, 1, 'o..');
    column(board, 2, 'o..');
    collapseColumns(board, plant, [2]);
    expect([read(board, 1, 3), read(board, 2, 3)]).toEqual(['o..', '..o']);
  });

  it('bitki baytı (rol, sap, çekirdek) hücreyle taşınır; board ve plant ayrışmaz', () => {
    const { board, plant } = fresh();
    column(board, 4, 'oo..');
    plant[idx(4, 18)] = plantCode(LINK.down, ROLE.head) | CORE; // çiçek (çekirdekli), altındaki sapa bağlı
    plant[idx(4, 19)] = plantCode(LINK.up, ROLE.stem);
    collapseColumns(board, plant, [4]);
    expect(plant[idx(4, 20)]).toBe(plantCode(LINK.down, ROLE.head) | CORE); // aynı miktarda indiler: bağ korunur
    expect(plant[idx(4, 21)]).toBe(plantCode(LINK.up, ROLE.stem));
    expect(hasCore(plant[idx(4, 20)] ?? 0)).toBe(true);
    for (let k = 0; k < board.length; k++) if (!board[k]) expect(plant[k], `boş hücre ${k}`).toBe(0);
  });

  it('kopan saplar iki uçta da temizlenir; aynı miktarda inen komşuların sapı korunur', () => {
    const { board, plant } = fresh();
    // yatay: 3. sütundaki hücre 2 iner, 4. sütundaki yerinde kalır (altı gri) → sağ/sol bağ kopar
    column(board, 3, 'o..');
    column(board, 4, 'o##');
    plant[idx(3, 19)] = plantCode(LINK.right, ROLE.stem);
    plant[idx(4, 19)] = plantCode(LINK.left, ROLE.tail);
    // yatay: 6 ve 7. sütunlar ikisi de 2 iner → bağ korunur
    column(board, 6, 'o..');
    column(board, 7, 'o..');
    plant[idx(6, 19)] = plantCode(LINK.right, ROLE.head);
    plant[idx(7, 19)] = plantCode(LINK.left, ROLE.leaf);
    // dikey: 9. sütunda üstteki 1 iner, alttaki (altı dolu) inmez → bağ kopar (bitişik değildiler)
    column(board, 9, 'o.o');
    plant[idx(9, 19)] = plantCode(LINK.down, ROLE.head);
    plant[idx(9, 21)] = plantCode(LINK.up, ROLE.stem);
    collapseColumns(board, plant, [3, 4, 6, 7, 9]);
    expect([plantLinks(plant[idx(3, 21)] ?? 0), plantLinks(plant[idx(4, 19)] ?? 0)]).toEqual([0, 0]);
    expect([plantLinks(plant[idx(6, 21)] ?? 0), plantLinks(plant[idx(7, 21)] ?? 0)]).toEqual([LINK.right, LINK.left]);
    expect([plantLinks(plant[idx(9, 20)] ?? 0), plantLinks(plant[idx(9, 21)] ?? 0)]).toEqual([0, 0]);
    // roller korunur
    expect([plant[idx(6, 21)] ?? 0, plant[idx(9, 20)] ?? 0].map((c) => c >> 4)).toEqual([ROLE.head, ROLE.head]);
  });

  it('gizli sıralar: 0. sıradaki hücre de iner', () => {
    const { board, plant } = fresh();
    board[idx(9, 0)] = PIECE.L;
    plant[idx(9, 0)] = plantCode(0, ROLE.head);
    expect(collapseColumns(board, plant, [9])).toEqual([[idx(9, 0), idx(9, 21)]]);
    expect([board[idx(9, 21)], plant[idx(9, 21)]]).toEqual([PIECE.L, plantCode(0, ROLE.head)]);
  });
});

/**
 * Çekirdekli satır temizlemesi → drenaj → çökme. 21: 1-9 gri (0 boş); 20: 0-5 J; 19 ve 18'de 7-8. sütunlarda havada
 * kalacak renkliler. Çekirdekli yatay I 6-9'a (20. sıra) konur: çiçek (9, 20), gri (9, 21) yakın → aktif, hedef 21,
 * sütun 9; I 20. sırayı tamamlar ve tetikler: 21'de 7-9. sütunlardaki griler akar, üstlerindeki renkliler iner.
 */
const pendingOf = (g: Game) => g.pending;

function scenario(): Game {
  const g = createGame(1);
  g.reset();
  clearBoard(g);
  fillRow(g, 21, PIECE.GARBAGE, [0]);
  for (let x = 0; x < 6; x++) g.board[idx(x, 20)] = PIECE.J;
  g.board[idx(7, 19)] = PIECE.S; // satır silinince 20'ye iner; altındaki gri akınca havada kalır
  g.board[idx(8, 18)] = PIECE.S; // 19'a iner
  g.boardVer++;
  placePiece(g, PIECE.I, 0, 6, 19); // hücreler 20. sırada (üstteki renkliler yolu kapatmasın)
  g.core = true;
  g.hardDrop();
  finishClear(g); // satır
  return g;
}

describe('drenaj → çökme evresi', () => {
  it('drenaj, sonra ayrı çökme; havada renkli hücre kalmaz; ghost yeni tahtayı okur', () => {
    const g = scenario();
    expect(g.pending?.kind).toBe('flush');
    expect(g.pending?.cells).toEqual([idx(7, 21), idx(8, 21), idx(9, 21)]);
    finishClear(g);
    expect([g.state, g.pending?.kind, g.type]).toEqual(['draining', 'collapse', 0]); // aktif parça yok
    expect(g.pending?.moves).toEqual([
      [idx(7, 20), idx(7, 21)],
      [idx(8, 19), idx(8, 21)],
    ]);
    for (let k = 0; k < (ROWS - 1) * COLS; k++)
      if (g.board[k] && g.board[k] !== PIECE.GARBAGE) expect(g.board[k + COLS], `havada ${k}`).not.toBe(0);
    for (let x = 1; x < 7; x++) expect(g.board[idx(x, 21)], `gri ${x}`).toBe(PIECE.GARBAGE); // griler yerinde
    finishClear(g);
    expect(g.state).toBe('play');
    expect(g.type).not.toBe(0);
    placePiece(g, PIECE.O, 0, 6, 0); // O: 7-8. sütunlar, 21'de dolu → 19-20
    expect(g.ghostY()).toBe(19);
  });

  it('çökme satır, seviye, kombo, b2b ve puan vermez; oluşan tam sıra o an temizlenmez (zincir yok)', () => {
    const g = createGame(1);
    g.reset();
    clearBoard(g);
    // 21: 0-8 renkli, 9 boş (delik); 20: 1-9 gri (9. sütundaki gri deliği örter), 0 boş; 19: 9. sütunda renkli;
    // 18: 0-5 renkli, çekirdekli yatay I 6-9'u doldurur: çiçek (9, 18), gri (9, 20) 2 sıra altta → hedef 20
    fillRow(g, 21, PIECE.S, [9]);
    fillRow(g, 20, PIECE.GARBAGE, [0]);
    g.board[idx(9, 19)] = PIECE.T;
    for (let x = 0; x < 6; x++) g.board[idx(x, 18)] = PIECE.J;
    g.boardVer++;
    placePiece(g, PIECE.I, 0, 6, 17);
    g.core = true;
    g.hardDrop();
    expect(g.pending?.rows).toEqual([18]);
    finishClear(g); // satır (puan burada)
    const stats = { lines: g.lines, level: g.level, combo: g.combo, b2b: g.b2b, score: g.score };
    expect([g.pending?.kind, g.flushRow]).toEqual(['flush', 20]);
    finishClear(g); // 20'de 7-9. sütunlardaki griler akar
    expect(g.pending?.moves).toEqual([[idx(9, 19), idx(9, 21)]]); // renkli hücre deliğe iner: 21. sıra tam olur
    finishClear(g);
    expect([g.state, g.lastCollapseFull, g.collapseFullRows]).toEqual(['play', true, 1]);
    expect([...g.board.subarray(21 * COLS, 22 * COLS)].every(Boolean)).toBe(true); // tam sıra kaldı (zincir yok)
    expect({ lines: g.lines, level: g.level, combo: g.combo, b2b: g.b2b, score: g.score }).toEqual(stats);
    expect(g.collapsedCells).toBe(1);
  });

  it('çökmenin bıraktığı tam sıra sonraki kilitte normal satır kuralıyla silinir (puan, kombo, b2b)', () => {
    const g = createGame(1);
    g.reset();
    clearBoard(g);
    fillRow(g, 21, PIECE.S, [9]);
    fillRow(g, 20, PIECE.GARBAGE, [0]);
    g.board[idx(9, 19)] = PIECE.T;
    for (let x = 0; x < 6; x++) g.board[idx(x, 18)] = PIECE.J;
    g.boardVer++;
    placePiece(g, PIECE.I, 0, 6, 17);
    g.core = true;
    g.hardDrop();
    while (g.pending) finishClear(g);
    expect([g.lines, g.combo, g.b2b]).toEqual([1, 0, false]);
    const scored: { n: number; pts: number; combo: number; b2b: boolean }[] = [];
    g.on('scored', (e) => scored.push({ n: e.n, pts: e.pts, combo: e.combo, b2b: e.b2b }));
    const before = g.score;
    placePiece(g, PIECE.O, 0, -1, 0); // O 0-1. sütunlar: 18-19 (hiçbir sırayı kendisi tamamlamaz)
    g.hardDrop();
    expect(pendingOf(g)?.rows).toEqual([21]); // (while döngüsünden sonra tip daraltması olmasın)
    // normal kural: tekli 100 × seviye 1 + kombo 50 × 1 × seviye 1; b2b yok
    expect(scored).toEqual([{ n: 1, pts: 150, combo: 1, b2b: false }]);
    expect(g.score - before).toBe(150 + 2 * 18); // + hard drop (18 sıra × 2)
    finishClear(g);
    expect(g.lines).toBe(2);
  });

  it('çekirdeksiz satır temizlemesinde sütun yerçekimi yok', () => {
    const g = createGame(1);
    g.reset();
    clearBoard(g);
    fillRow(g, 21, PIECE.S, [0]);
    g.board[idx(5, 18)] = PIECE.T; // havada (çıkıntı) renkli hücre
    g.boardVer++;
    placePiece(g, PIECE.I, 1, -2, 0);
    g.hardDrop();
    finishClear(g);
    expect([g.pending, g.state]).toEqual([null, 'play']);
    expect(g.board[idx(5, 19)]).toBe(PIECE.T); // satırla bir sıra kaydı, sütunda çökmedi
    expect(g.board[idx(5, 21)]).toBe(0);
    expect(g.collapsedCells).toBe(0);
  });

  it('inen hücre yoksa çökme evresi atlanır; oda kontrolü drenajdan sonra', () => {
    const g = createGame(1);
    g.reset({ rooms: true });
    clearBoard(g);
    // 21: 1-4 renkli, 5-9 gri (0 boş); 20: 0-3 ve 8-9 renkli; çekirdekli I 4-7: çiçek (7, 20), hedef 21, sütun 7 ± 2
    fillRow(g, 21, PIECE.GARBAGE, [0, 1, 2, 3, 4]);
    for (let x = 1; x < 5; x++) g.board[idx(x, 21)] = PIECE.S;
    for (const x of [0, 1, 2, 3, 8, 9]) g.board[idx(x, 20)] = PIECE.J;
    g.boardVer++;
    placePiece(g, PIECE.I, 0, 4, 19);
    g.core = true;
    g.hardDrop();
    finishClear(g);
    expect(g.pending?.cells).toHaveLength(5);
    finishClear(g); // drenaj: üstte renkli yok → çökme yok → oda boş: oda açılır
    expect(g.pending?.kind).toBe('room');
    expect(FLOW.collapseMs).toBe(180);
  });
});
