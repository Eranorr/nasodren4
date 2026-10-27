/* =====================================================================
   NS4-34: parça başına tek sıklamen. Her tetromino, yılan oyunundaki gibi
   tek bir bitkidir: sap 4 bloğun içinden geçer, bir ucunda çiçek, diğer
   uçlarda tomurcuk ya da sivri sap ucu, gövdede yaprak. Hücre başına bir
   bayt: bit 0-3 sap bağlantıları (yukarı, sağ, aşağı, sol), bit 4-6 rol.
   Tahta bu baytları Game.plant içinde saklar; satır silinince sap kopar.
   Görünüm yalnızca okur (src/rendering/plants.ts).
   ===================================================================== */
import type { TetrominoType } from '../types/game';
import { SHAPES } from './pieces';

export const LINK = { up: 1, right: 2, down: 4, left: 8 } as const;
export const ALL_LINKS = 15;
/** stem: düz sap · head: açmış çiçek · leaf: yaprak · bud: tomurcuk · tail: sivri sap ucu. */
export const ROLE = { stem: 0, head: 1, leaf: 2, bud: 3, tail: 4 } as const;
export type PlantRole = (typeof ROLE)[keyof typeof ROLE];

export const plantCode = (links: number, role: PlantRole): number => (links & ALL_LINKS) | (role << 4);
export const plantLinks = (code: number): number => code & ALL_LINKS;
export const plantRole = (code: number): PlantRole => ((code >> 4) & 7) as PlantRole;

/** Bağlantıları saat yönünde 90° döndürür (yukarı → sağ → aşağı → sol). */
export const rotateLinks = (links: number): number => ((links << 1) | (links >> 3)) & ALL_LINKS;

type DesignCell = readonly [x: number, y: number, role: PlantRole, links: number];
const { up: U, right: R, down: D, left: L } = LINK;
const { stem, head, leaf, bud, tail } = ROLE;

/**
 * Döndürmesiz (rot 0) tasarım; koordinatlar SHAPES[t][0] ile aynı. Her bitkide tam bir çiçek var; sap ağaç
 * şeklinde (T'nin ortasında çatal). O'da sap U çizer: bir üst köşede çiçek, diğerinde tomurcuk.
 */
const DESIGN: Readonly<Record<TetrominoType, readonly DesignCell[]>> = {
  1: [
    [0, 1, tail, R],
    [1, 1, leaf, L | R],
    [2, 1, stem, L | R],
    [3, 1, head, L],
  ],
  2: [
    [1, 0, bud, D],
    [2, 0, head, D],
    [1, 1, leaf, U | R],
    [2, 1, stem, U | L],
  ],
  3: [
    [1, 0, head, D],
    [0, 1, leaf, R],
    [1, 1, stem, U | L | R],
    [2, 1, bud, L],
  ],
  4: [
    [1, 0, leaf, D | R],
    [2, 0, head, L],
    [0, 1, tail, R],
    [1, 1, stem, L | U],
  ],
  5: [
    [0, 0, head, R],
    [1, 0, leaf, L | D],
    [1, 1, stem, U | R],
    [2, 1, tail, L],
  ],
  6: [
    [0, 0, head, D],
    [0, 1, stem, U | R],
    [1, 1, leaf, L | R],
    [2, 1, tail, L],
  ],
  7: [
    [2, 0, head, D],
    [0, 1, tail, R],
    [1, 1, leaf, L | R],
    [2, 1, stem, U | L],
  ],
};

/** SRS döndürme merkezi: I 4×4 kutuda (1,5, 1,5), O dönmez, diğerleri 3×3 kutuda (1, 1). */
const CENTER: Readonly<Record<TetrominoType, readonly [number, number] | null>> = {
  1: [1.5, 1.5],
  2: null,
  3: [1, 1],
  4: [1, 1],
  5: [1, 1],
  6: [1, 1],
  7: [1, 1],
};

function rotated(t: TetrominoType, rot: number): readonly DesignCell[] {
  let cells = DESIGN[t];
  const c = CENTER[t];
  if (!c) return cells;
  for (let k = 0; k < rot; k++)
    cells = cells.map(([x, y, role, links]) => [c[0] - (y - c[1]), c[1] + (x - c[0]), role, rotateLinks(links)]);
  return cells;
}

function build(t: TetrominoType): readonly (readonly number[])[] {
  return SHAPES[t].map((shape, rot) => {
    const cells = rotated(t, rot);
    return shape.map(([x, y]) => {
      const d = cells.find((q) => q[0] === x && q[1] === y);
      if (!d) throw new Error(`bitki tasarımı ${t}/${rot} (${x},${y}) hücresini bulamadı`);
      return plantCode(d[3], d[2]);
    });
  });
}

/** PLANTS[tip][rot][i]: SHAPES[tip][rot][i] hücresinin bitki baytı. */
export const PLANTS: Readonly<Record<TetrominoType, readonly (readonly number[])[]>> = {
  1: build(1),
  2: build(2),
  3: build(3),
  4: build(4),
  5: build(5),
  6: build(6),
  7: build(7),
};
