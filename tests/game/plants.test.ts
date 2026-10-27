// NS4-34: parça başına tek sıklamen: tasarım tutarlılığı (her dönüşte), kilitlenmede tahtaya yazım ve satır silinince
// sapın kopması. Rastgele oyun boyunca hiçbir sap boş hücreye ya da başka bir parçaya bağlanmaz.
import { describe, expect, it } from 'vitest';
import { COLS, ROWS } from '../../src/config/gameConfig';
import { PIECE, SHAPES } from '../../src/game/pieces';
import { ALL_LINKS, LINK, PLANTS, ROLE, plantCode, plantLinks, plantRole, rotateLinks } from '../../src/game/plants';
import type { TetrominoType } from '../../src/types/game';
import { clearBoard, createGame, fillRow, finishClear, idx, placePiece } from '../helpers/gameHelpers';
import type { Game } from '../../src/game/Game';

const TYPES = [1, 2, 3, 4, 5, 6, 7] as const satisfies readonly TetrominoType[];
const DIRS = [
  [LINK.up, 0, -1, LINK.down],
  [LINK.right, 1, 0, LINK.left],
  [LINK.down, 0, 1, LINK.up],
  [LINK.left, -1, 0, LINK.right],
] as const;

describe('NS4-34: bitki tasarımı', () => {
  it('bayt: bağlantı ve rol ayrı okunur; döndürme saat yönünde', () => {
    const c = plantCode(LINK.up | LINK.left, ROLE.leaf);
    expect([plantLinks(c), plantRole(c)]).toEqual([LINK.up | LINK.left, ROLE.leaf]);
    expect(rotateLinks(LINK.up)).toBe(LINK.right);
    expect(rotateLinks(LINK.left)).toBe(LINK.up);
    expect(rotateLinks(ALL_LINKS)).toBe(ALL_LINKS);
  });

  it.each(TYPES)('tip %i: her dönüşte tek parça bitki: karşılıklı bağlar, ağaç, tek çiçek', (t) => {
    for (let rot = 0; rot < 4; rot++) {
      const cells = SHAPES[t][rot],
        codes = PLANTS[t][rot];
      expect(codes).toHaveLength(4);
      let edges = 0;
      cells.forEach(([x, y], i) => {
        const links = plantLinks(codes[i] ?? 0);
        for (const [bit, dx, dy, back] of DIRS) {
          if (!(links & bit)) continue;
          const j = cells.findIndex(([qx, qy]) => qx === x + dx && qy === y + dy);
          expect(j, `tip ${t} rot ${rot} hücre ${i}`).toBeGreaterThanOrEqual(0);
          expect(plantLinks(codes[j] ?? 0) & back).toBe(back);
          edges++;
        }
      });
      expect(edges / 2).toBe(3); // 4 hücre, 3 bağ: döngüsüz ve bağlı
      expect(codes.filter((c) => plantRole(c) === ROLE.head)).toHaveLength(1);
      // uç rolleri (çiçek, tomurcuk, sivri uç) yalnızca tek bağlantılı hücrelerde
      for (const c of codes)
        if (([ROLE.head, ROLE.bud, ROLE.tail] as number[]).includes(plantRole(c)))
          expect(plantLinks(c).toString(2).replace(/0/g, '')).toHaveLength(1);
    }
  });

  it('dönüş tasarımı döndürür: T ucunun çiçeği yukarı → sağ → aşağı → sol', () => {
    const headLink = (rot: number) => plantLinks(PLANTS[3][rot].find((c) => plantRole(c) === ROLE.head) ?? 0);
    expect([0, 1, 2, 3].map(headLink)).toEqual([LINK.down, LINK.left, LINK.up, LINK.right]);
  });
});

/** Tahtadaki her sap bağı dolu bir hücreye gider ve karşılıklıdır. */
function linksValid(g: Game): boolean {
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const code = g.plant[idx(x, y)] ?? 0;
      if (!code) continue;
      if (!g.board[idx(x, y)]) return false;
      for (const [bit, dx, dy, back] of DIRS) {
        if (!(code & bit)) continue;
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return false;
        if (!g.board[idx(nx, ny)] || !((g.plant[idx(nx, ny)] ?? 0) & back)) return false;
      }
    }
  return true;
}

describe('NS4-34: tahtada bitki', () => {
  it('kilitlenince parçanın bitkisi tahtaya yazılır', () => {
    const g = createGame(3);
    clearBoard(g);
    placePiece(g, PIECE.T, 2, 4, ROWS - 3);
    g.hardDrop();
    const cells = SHAPES[PIECE.T][2].map(([dx, dy]) => idx(g.x + dx, g.y + dy));
    const written = [...g.plant].filter((c) => c);
    expect(written.sort()).toEqual([...PLANTS[PIECE.T][2]].sort());
    expect(cells.length).toBe(4);
    expect(linksValid(g)).toBe(true);
  });

  it('satır silinince silinen sıraya uzanan sap kopar, kalan hücreler yanlış bağlanmaz', () => {
    const g = createGame(5);
    clearBoard(g);
    fillRow(g, ROWS - 1, PIECE.GARBAGE, [0]); // alt sıra: 0. sütun boş
    placePiece(g, PIECE.I, 1, -2, ROWS - 4); // dikey I, 0. sütuna (x + 2 = 0)
    g.hardDrop();
    expect(g.pending?.rows).toEqual([ROWS - 1]);
    finishClear(g);
    // I'nin alt hücresi silindi; kalan üç hücrenin en altı artık aşağıya bağlı değil
    const bottom = g.plant[idx(0, ROWS - 1)] ?? 0;
    expect(g.board[idx(0, ROWS - 1)]).toBe(PIECE.I);
    expect(bottom & LINK.down).toBe(0);
    expect(bottom & LINK.up).toBe(LINK.up);
    expect(linksValid(g)).toBe(true);
  });

  it('yeni oyun ve oda girişi bitkileri siler', () => {
    const g = createGame(2);
    g.plant.fill(ALL_LINKS);
    g.reset();
    expect(g.plant.every((c) => c === 0)).toBe(true);
    g.plant.fill(ALL_LINKS);
    g.enterRoom(0);
    expect(g.plant.every((c) => c === 0)).toBe(true);
  });

  it('rastgele oyun boyunca saplar hep geçerli (satır silme, çoklu silme)', () => {
    const g = createGame(11);
    let clears = 0;
    for (let n = 0; n < 400 && g.state !== 'over'; n++) {
      if (g.state === 'play' && g.type) {
        const rot = ((Math.random() * 4) | 0) as 0 | 1 | 2 | 3;
        for (let k = 0; k < rot; k++) g.rotate(1);
        const dx = ((Math.random() * 9) | 0) - 4;
        for (let k = 0; k < Math.abs(dx); k++) g.move(dx < 0 ? -1 : 1);
        g.hardDrop();
      }
      if (g.pending) {
        clears++;
        finishClear(g);
      }
      expect(linksValid(g)).toBe(true);
      if (g.stackHeight() > 14) {
        clearBoard(g);
        g.plant.fill(0);
      }
    }
    expect(clears).toBeGreaterThan(0);
  });
});
