// Gri bulutçuk teması: renkli parça gri hücrelerin hemen üstüne (boşluksuz) oturur. Hard drop, soft drop, doğal
// yerçekimi ve ghost aynı kilit konumunu verir; renkli blokla çarpışma aynıdır; dört odanın başlangıç düzeninde ve
// çekirdekli/çekirdeksiz parçada sonuç aynıdır; görünür sıra = tahta sırası - HIDDEN (çizim bitişik).
import { describe, expect, it } from 'vitest';
import { CFG, COLS, HIDDEN, ROOMS, ROWS } from '../../src/config/gameConfig';
import { PIECE, SHAPES } from '../../src/game/pieces';
import type { Game } from '../../src/game/Game';
import type { BlockId, RotationState, TetrominoType } from '../../src/types/game';
import { clearBoard, createGame, fillRow, idx, placePiece } from '../helpers/gameHelpers';

type How = 'hard' | 'soft' | 'gravity';
/** Parçayı (x, spawn yüksekliği) konumundan verilen yolla indirir; kilitlenen 4 hücreyi (tahta indeksi) döndürür. */
function land(g: Game, t: TetrominoType, rot: RotationState, x: number, how: How, core = false): number[] {
  placePiece(g, t, rot, x, 0);
  g.core = core;
  let cells: number[] = [];
  const off = g.on('lock', (c) => {
    cells = [...c];
  });
  if (how === 'hard') g.hardDrop();
  else if (how === 'soft') {
    g.softDrop = true;
    for (let i = 0; i < 2000 && !cells.length; i++) g.update(16);
    g.softDrop = false;
  } else for (let i = 0; i < 5000 && !cells.length; i++) g.update(16); // seviye 1: 1 sn/sıra + kilit gecikmesi
  off();
  return cells.sort((a, b) => a - b);
}
/** Kilitlenen parça altındaki bir hücreye (gri ya da renkli) ya da tabana dokunuyor mu. */
function touches(g: Game, cells: readonly number[]): boolean {
  return cells.some((k) => k + COLS >= ROWS * COLS || (g.board[k + COLS] !== 0 && !cells.includes(k + COLS)));
}
/** Tahtayı bir anlık görüntüden kurar (satır 21 en altta). '#': gri, 's': renkli, '.': boş. */
function setBoard(g: Game, rows: Readonly<Record<number, string>>) {
  clearBoard(g);
  for (const [y, s] of Object.entries(rows))
    for (let x = 0; x < COLS; x++) {
      const ch = s[x];
      g.board[idx(x, Number(y))] = ch === '#' ? PIECE.GARBAGE : ch === 's' ? PIECE.S : 0;
    }
  g.boardVer++;
}

describe('gri bulutçuk teması', () => {
  it('tek gri hücrenin üzerine boşluksuz oturur', () => {
    const g = createGame(1);
    setBoard(g, { 21: '....#.....' });
    const cells = land(g, PIECE.O, 0, 3, 'hard'); // O: 4-5. sütunlar
    expect(cells).toEqual([idx(4, 19), idx(5, 19), idx(4, 20), idx(5, 20)]);
    expect(touches(g, cells)).toBe(true);
  });

  it('tam gri sıranın üzerine boşluksuz oturur (her tip ve rotasyon, her geçerli x)', () => {
    for (const t of [1, 2, 3, 4, 5, 6, 7] as const)
      for (const rot of [0, 1, 2, 3] as const)
        for (let x = -2; x < COLS; x++) {
          const g = createGame(1);
          setBoard(g, { 21: '##########' });
          if (!g.fits(t, rot, x, 0)) continue;
          const cells = land(g, t, rot, x, 'hard');
          const low = Math.max(...cells.map((k) => (k / COLS) | 0));
          expect(low, `${t}/${rot}/${x}`).toBe(20); // en alt hücre griye bitişik (20. sıra), arada boş sıra yok
        }
  });

  it('hava kanalı boşluğuna parça inmeye devam eder', () => {
    const g = createGame(1);
    setBoard(g, { 18: '#######.##', 19: '#######.##', 20: '#######.##', 21: '#######.##' });
    const cells = land(g, PIECE.I, 1, 5, 'hard'); // dikey I: x + 2 = 7. sütun
    expect(cells).toEqual([idx(7, 18), idx(7, 19), idx(7, 20), idx(7, 21)]);
  });

  it('gri bloğun üstündeki gerçek boş hücre kullanılabilir (fits)', () => {
    const g = createGame(1);
    setBoard(g, { 21: '##########' });
    expect(g.cell(4, 20)).toBe(0);
    expect(g.cell(4, 21)).toBe(PIECE.GARBAGE);
    expect(g.fits(PIECE.O, 0, 3, 19)).toBe(true); // 19-20. sıralar
    expect(g.fits(PIECE.O, 0, 3, 20)).toBe(false); // 21. sıra dolu
  });

  it('hard drop, soft drop, doğal yerçekimi ve ghost aynı konumda (gri bitişik)', () => {
    for (const [t, rot, x] of [
      [PIECE.O, 0, 3],
      [PIECE.T, 2, 3],
      [PIECE.S, 0, 1],
      [PIECE.J, 1, 6],
      [PIECE.I, 0, 2],
    ] as const) {
      const results = (['hard', 'soft', 'gravity'] as const).map((how) => {
        const g = createGame(1);
        setBoard(g, { 19: '#######.##', 20: '#######.##', 21: '#######.##' });
        placePiece(g, t, rot, x, 0);
        const ghost = g.ghostY();
        const cells = land(g, t, rot, x, how);
        const expected = SHAPES[t][rot].map(([dx, dy]) => idx(x + dx, ghost + dy)).sort((a, b) => a - b);
        expect(cells, `${how} ${t}/${rot}`).toEqual(expected); // ghost = gerçek kilit konumu
        expect(touches(g, cells)).toBe(true);
        return cells;
      });
      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
    }
    expect(CFG.lockDelay).toBe(500);
  });

  it('renkli sabit blokla çarpışma griyle aynı', () => {
    for (const v of [PIECE.GARBAGE, PIECE.S] as BlockId[]) {
      const g = createGame(1);
      clearBoard(g);
      fillRow(g, 21, v, [7]);
      g.board[idx(2, 20)] = v;
      g.boardVer++;
      expect(land(g, PIECE.T, 0, 1, 'hard'), String(v)).toEqual([idx(2, 18), idx(1, 19), idx(2, 19), idx(3, 19)]);
    }
  });

  it.each(ROOMS.map((_, i) => i))('oda %i başlangıç düzeninde her iniş temaslı; hard = soft', (room) => {
    for (const t of [1, 2, 3, 4, 5, 6, 7] as const)
      for (const rot of [0, 1, 2, 3] as const)
        for (let x = -2; x < COLS; x++) {
          const make = () => {
            const g = createGame(room + 11);
            g.reset({ rooms: true });
            g.enterRoom(room);
            return g;
          };
          const a = make();
          if (!a.fits(t, rot, x, 0)) continue;
          const hard = land(a, t, rot, x, 'hard');
          expect(touches(a, hard), `oda ${room + 1} ${t}/${rot}/${x}`).toBe(true);
          const b = make();
          expect(land(b, t, rot, x, 'soft')).toEqual(hard);
        }
  });

  it('gizli sıra ofseti: doğuş y=0 + bir sıra iner; görünür sıra = tahta sırası - HIDDEN', () => {
    const g = createGame(1);
    clearBoard(g);
    g.spawn(PIECE.O);
    expect([g.y, HIDDEN, ROWS]).toEqual([1, 2, 22]);
    expect(g.cell(0, -1)).toBe(0); // tahtanın üstü boş sayılır
    expect(g.cell(0, ROWS)).toBe(9); // taban
  });

  it('sıklamen çekirdeği çarpışmayı değiştirmez: çekirdekli ve çekirdeksiz parça aynı konumda kilitlenir', () => {
    const run = (core: boolean) => {
      const g = createGame(3);
      g.reset({ rooms: true });
      g.enterRoom(2);
      return [PIECE.O, PIECE.T, PIECE.L].map((t, i) => land(g, t, 0, i * 3, 'hard', core));
    };
    expect(run(true)).toEqual(run(false));
  });
});

describe('gri temasının çizimi', () => {
  it('kilitlenen parçanın sprite alt kenarı gri sprite üst kenarına bitişik (tüm ekran boyutları)', async () => {
    const { stubCanvasDom, createView } = await import('../helpers/pixiView');
    stubCanvasDom();
    for (const [w, h, dpr] of [
      [390, 844, 2],
      [844, 390, 2],
      [1366, 768, 1],
      [1920, 1080, 1],
    ] as const) {
      const g = createGame(1);
      const { view: v } = await createView(g, w, h, dpr);
      setBoard(g, { 19: '#######.##', 20: '#######.##', 21: '#######.##' });
      const cells = land(g, PIECE.O, 0, 3, 'hard');
      v.syncAll();
      const c = v.L.cell;
      const sprite = (k: number) => v.cells[(((k / COLS) | 0) - HIDDEN) * COLS + (k % COLS)];
      const bottomPiece = sprite(Math.max(...cells));
      const grayBelow = sprite(Math.max(...cells) + COLS);
      expect(grayBelow?.texture).toBe(v.tex[PIECE.GARBAGE]);
      const row = (Math.max(...cells) / COLS) | 0;
      expect(row).toBe(18); // gri 19. sırada başlıyor
      expect(bottomPiece?.y, `${w}x${h}`).toBeCloseTo((row - HIDDEN) * c + c / 2, 6);
      expect(grayBelow?.y).toBeCloseTo((row + 1 - HIDDEN) * c + c / 2, 6);
      // kenarlar: (parça merkezi + c/2) = (gri merkezi - c/2)
      expect((bottomPiece?.y ?? 0) + c / 2).toBeCloseTo((grayBelow?.y ?? 0) - c / 2, 6);
      expect(bottomPiece?.height).toBeCloseTo(c, 6);
      expect(grayBelow?.height).toBeCloseTo(c, 6);
    }
  });
});
