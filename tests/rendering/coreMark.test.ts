// Sıklamen çekirdeği görünümü: işaret (aday: düşen parça, Sıradaki, Hold; aktif: tahta; sönen), mobil boyutu, reduced
// motion, drenaj ve çökme animasyonu, yeniden boyutlandırmada doku temizliği. Render yok (tests/helpers/pixiView.ts).
import { beforeEach, describe, expect, it } from 'vitest';
import { COLS, HIDDEN, VIS } from '../../src/config/gameConfig';
import { CORE, FLOW } from '../../src/game/cyclamenFlow';
import { PIECE } from '../../src/game/pieces';
import { ROLE } from '../../src/game/plants';
import type { Game } from '../../src/game/Game';
import { CORE_FX, coreMarkPulse } from '../../src/rendering/coreMark';
import type { View } from '../../src/rendering/GameView';
import { clearBoard, createGame, fillRow, finishClear, idx, placePiece } from '../helpers/gameHelpers';
import type { ViewHarness } from '../helpers/pixiView';

type S = { visible: boolean; children: S[]; scale: { x: number }; alpha: number; tint: number };
const mark = (s: unknown) => (s as S).children[2];
const marked = (list: readonly unknown[]) => list.filter((s) => (s as S).visible && mark(s)?.visible).length;

let g: Game, H: ViewHarness, v: View;
beforeEach(async () => {
  const { stubCanvasDom, createView } = await import('../helpers/pixiView');
  stubCanvasDom();
  g = createGame(3);
  g.reset();
  H = await createView(g, 390, 844);
  v = H.view;
  g.on('clearstart', (e) => v.onClearStart(e));
  g.on('clearend', () => v.onClearEnd());
});

describe('çekirdek işareti', () => {
  it('aktif parçada yalnızca çiçek hücresinde; çekirdeksiz parçada yok (bitki görseli yüklenmeden de)', () => {
    expect(v.plantTex).toHaveLength(0); // Node: bitki görseli yok, işaret yine görünmeli
    clearBoard(g);
    placePiece(g, PIECE.T, 0, 4, 2);
    g.core = true;
    v.syncAll();
    expect(marked(v.active)).toBe(1);
    g.core = false;
    g.pieceVer++;
    H.step(16);
    expect(marked(v.active)).toBe(0);
  });

  it('Sıradaki ve Hold önizlemelerinde parçayla birlikte görünür', () => {
    v.syncAll();
    expect(marked(v.nextS)).toBe(g.queueCore[0] ? 1 : 0);
    g.queueCore[0] = true;
    g.queueVer++;
    H.step(16);
    expect(marked(v.nextS)).toBe(1);
    g.queueCore[0] = false;
    g.queueVer++;
    H.step(16);
    expect(marked(v.nextS)).toBe(0);
    g.core = true;
    g.doHold();
    H.step(16);
    expect(g.holdCore).toBe(true);
    expect(marked(v.holdS)).toBe(1);
    g.canHold = true;
    g.doHold(); // hold'daki çekirdekli parça geri gelir
    expect(g.core).toBe(true);
    for (let i = 0; i < 3; i++) g.softStep(); // çiçek gizli üst sıralarda kalmasın
    H.step(16);
    expect(marked(v.active)).toBe(1);
  });

  it('tahtada çekirdek biti olan hücrede görünür; gri ve oyun sonunda gizli', () => {
    clearBoard(g);
    g.board[idx(3, 21)] = PIECE.J;
    g.plant[idx(3, 21)] = CORE | (ROLE.head << 4);
    g.board[idx(4, 21)] = PIECE.GARBAGE;
    g.plant[idx(4, 21)] = CORE; // gri hücrede işaret çizilmez
    g.boardVer++;
    v.syncBoard();
    expect(marked(v.cells)).toBe(1);
    expect(mark(v.cells[(21 - HIDDEN) * COLS + 3])?.visible).toBe(true);
    v.onGameOver();
    H.step(2000);
    expect(marked(v.cells)).toBe(0);
  });

  it('mobil (390×844, DPR 1 ve 2): işaret Next/Hold küçük önizlemesinde de ≥ 10 px halka, kontur ≥ 1,5 px', async () => {
    for (const dpr of [1, 2]) {
      const { createView } = await import('../helpers/pixiView');
      const h = await createView(g, 390, 844, dpr);
      const L = h.view.L;
      expect(2 * CORE_FX.ring * Math.min(L.mini, L.miniBig)).toBeGreaterThanOrEqual(10);
      expect(2 * CORE_FX.ring * L.cell).toBeGreaterThanOrEqual(16);
      expect(h.view.coreTex.orig.width).toBe(Math.max(8, Math.round(L.cell * dpr))); // blok karosuyla aynı px
      expect(Math.max(1.5, h.view.coreTex.orig.width * CORE_FX.width)).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('nabız: normalde ölçek ve alpha değişir; reduced motion açıkken sabit (1, 1)', () => {
    const a = coreMarkPulse(0, false),
      b = coreMarkPulse(CORE_FX.period / 2, false);
    expect(a.scale).toBeLessThan(b.scale);
    expect(a.alpha).toBeCloseTo(CORE_FX.alphaMin, 6);
    expect(coreMarkPulse(123, true)).toEqual({ scale: 1, alpha: 1 });
    clearBoard(g);
    placePiece(g, PIECE.T, 0, 4, 2);
    g.core = true;
    v.syncAll();
    const m = v.active.map(mark).find((x) => x?.visible);
    v.reducedMotion = true;
    for (let t = 0; t < CORE_FX.period; t += 100) {
      H.step(100, 100);
      expect([m?.scale.x, m?.alpha]).toEqual([1, 1]);
    }
    v.reducedMotion = false;
    const seen = new Set<number>();
    for (let t = 0; t < CORE_FX.period; t += 100) {
      H.step(100, 100);
      seen.add(Math.round((m?.scale.x ?? 0) * 1000));
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('drenaj görünümü', () => {
  beforeEach(() => {
    g.reset();
  });
  /** 21. sıra renkli (0 boş), 20. sıra gri (0 ve 3 boş), çekirdekli T; 0. sütuna I satırı temizler → 21'deki gri sıra akar. */
  function armAndClear() {
    clearBoard(g);
    fillRow(g, 21, PIECE.S, [0]);
    fillRow(g, 20, PIECE.GARBAGE, [0, 3]);
    placePiece(g, PIECE.T, 0, 5, 0);
    g.core = true;
    g.hardDrop();
    H.step(16);
  }

  it('aktif çekirdek tahtada büyük ve altın; hedef sırası şeritle aydınlanır; son iki parçada söner (reduced motion)', () => {
    v.reducedMotion = true;
    armAndClear();
    const cell = () => mark(v.cells[(18 - HIDDEN) * COLS + 6]);
    H.step(16);
    expect([cell()?.visible, cell()?.alpha, cell()?.tint]).toEqual([true, 1, CORE_FX.activeTint]);
    expect(cell()?.scale.x).toBe(CORE_FX.activeScale);
    expect([v.coreLane.visible, v.coreLane.y, v.coreLane.alpha]).toEqual([
      true,
      (g.coreTargetRow - HIDDEN) * v.L.cell,
      CORE_FX.laneAlpha,
    ]);
    expect(v.coreLane.width).toBeCloseTo(COLS * v.L.cell, 6);
    g.coreLife = FLOW.coreFadeAt;
    H.step(16);
    expect(cell()?.alpha).toBeCloseTo(CORE_FX.fadeAlpha, 6);
    expect(cell()?.scale.x).toBe(CORE_FX.activeScale);
    g.coreLife = 0; // sönmüş: bit kalkınca işaret gider
    g.clearCore();
    g.boardVer++;
    H.step(16);
    expect(cell()?.visible).toBe(false);
    expect(v.coreLane.visible).toBe(false); // aktif çekirdek yok: şerit yok
  });

  it('drenaj 300 ms; hedef sıra yatay parlar, bulutçuklar yerinden yukarı süzülür; ışık geri alınır', () => {
    armAndClear();
    placePiece(g, PIECE.I, 1, -2, 0);
    g.core = false;
    g.hardDrop();
    H.step(16);
    finishClear(g);
    H.step(16);
    expect(v.anim?.kind).toBe('flush');
    expect(v.anim?.dur).toBe(FLOW.rowMs);
    const f = v.flashes[0],
      c = v.L.cell;
    expect([f.visible, f.width, f.height, f.x, f.y]).toEqual([true, COLS * c, c, 0, (21 - HIDDEN) * c]);
    const i = v.anim?.cells?.[0] ?? 0;
    H.step(150);
    expect(v.cells[i]?.texture).toBe(v.happyTex);
    expect(v.cells[i]?.x).toBeCloseTo((i % COLS) * c + c / 2, 6); // kanala çekilmez
    expect(v.cells[i]?.y).toBeLessThan(((i / COLS) | 0) * c + c / 2);
    finishClear(g);
    H.step(16);
    expect([f.visible, f.width, f.height, f.x]).toEqual([false, COLS * c, c, 0]);
  });

  it('reduced motion: drenajda bulutçuklar yerinde söner', () => {
    v.reducedMotion = true;
    armAndClear();
    placePiece(g, PIECE.I, 1, -2, 0);
    g.core = false;
    g.hardDrop();
    H.step(16);
    finishClear(g);
    H.step(16);
    const i = v.anim?.cells?.[0] ?? 0,
      c = v.L.cell;
    H.step(200);
    expect([v.cells[i]?.x, v.cells[i]?.y]).toEqual([(i % COLS) * c + c / 2, ((i / COLS) | 0) * c + c / 2]);
  });
});

describe('drenaj görünümü: yeniden boyutlandırma', () => {
  it('drenaj sırasında hedef sıra ışığı yeni ölçüye uyar; çekirdek dokusu yenilenir, eskisi serbest kalır', () => {
    g.reset();
    clearBoard(g);
    fillRow(g, 21, PIECE.S, [0]);
    fillRow(g, 20, PIECE.GARBAGE, [0, 3]);
    placePiece(g, PIECE.T, 0, 5, 0);
    g.core = true;
    g.hardDrop();
    placePiece(g, PIECE.I, 1, -2, 0);
    g.hardDrop();
    H.step(16);
    finishClear(g);
    H.step(16);
    expect(v.anim?.kind).toBe('flush');
    const old = v.coreTex;
    H.resize(1366, 768);
    H.step(16);
    const f = v.flashes[0],
      c = v.L.cell;
    expect([f.width, f.height, f.y]).toEqual([COLS * c, c, (21 - HIDDEN) * c]);
    expect(v.coreTex).not.toBe(old);
    expect(old.baseTexture).toBeNull(); // destroy(true): eski doku ve kaynağı bırakıldı
    expect(v.marks.every((m) => m.texture === v.coreTex)).toBe(true);
    H.resize(844, 390);
    H.resize(1920, 1080);
    while (g.pending) finishClear(g);
    H.step(16);
    expect(v.marks).toHaveLength(COLS * VIS + 4 + 4 + 4); // tahta, aktif, Hold, Sıradaki
  });
});

describe('çökme görünümü', () => {
  /**
   * 21. sıra gri (0 boş), 20. sırada J; 8. sütunda havada kalacak renkli hücre; çekirdekli I (6-9, çiçek 9. sütunda)
   * 20. sırayı temizler: hedef 21, 7-9. sütunlardaki griler akar, (8, 20) hücresi 21'e iner.
   */
  function drainAndCollapse() {
    g.reset();
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [0]);
    for (let x = 0; x < 6; x++) g.board[idx(x, 20)] = PIECE.J;
    g.board[idx(8, 19)] = PIECE.S; // satırla 20'ye kayar; altındaki gri akınca 21'e iner
    g.boardVer++;
    placePiece(g, PIECE.I, 0, 6, 18); // hücreleri 19'da: (8, 19) S üstünde; inince 20'yi tamamlar
    g.core = true;
    g.hardDrop();
    H.step(16);
    finishClear(g); // satır → drenaj
    H.step(16);
    finishClear(g); // drenaj → çökme
    H.step(16);
  }

  it('drenajdan sonra ayrı evre (180 ms): hücre eski sırasından hedefe iner; doku değişmez', () => {
    drainAndCollapse();
    expect(v.anim?.kind).toBe('collapse');
    expect(v.anim?.dur).toBe(FLOW.collapseMs);
    const c = v.L.cell,
      s = v.cells[(21 - HIDDEN) * COLS + 8];
    expect(s?.texture).toBe(v.tex[PIECE.S]);
    const y0 = s?.y ?? 0;
    expect(y0).toBeLessThan((21 - HIDDEN) * c + c / 2); // henüz yolda
    expect(y0).toBeGreaterThanOrEqual((20 - HIDDEN) * c + c / 2 - 1e-6);
    H.step(100);
    expect(s?.y ?? 0).toBeGreaterThan(y0);
    finishClear(g);
    H.step(16);
    expect(v.anim).toBeNull();
    expect(s?.y).toBeCloseTo((21 - HIDDEN) * c + c / 2, 6);
  });

  it('reduced motion: hücreler doğrudan hedefte', () => {
    v.reducedMotion = true;
    drainAndCollapse();
    const c = v.L.cell;
    expect(v.cells[(21 - HIDDEN) * COLS + 8]?.y).toBeCloseTo((21 - HIDDEN) * c + c / 2, 6);
  });
});

describe('aday, aktif, sönen çekirdek', () => {
  beforeEach(() => {
    g.reset();
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [0]);
  });

  it('aktif çekirdek (tahta) altın ve adaydan büyük, kendi ritmiyle; aday çekirdek (düşen parça) beyaz, nabızlı', () => {
    placePiece(g, PIECE.T, 0, 3, 0);
    g.core = true;
    g.hardDrop(); // çiçek (4, 19): gri (4, 21) 2 sıra altta → aktif
    expect(g.coreLife).toBe(FLOW.coreLife);
    g.core = true; // sıradaki parça aday
    g.pieceVer++;
    H.step(16);
    const board = mark(v.cells[(19 - HIDDEN) * COLS + 4]);
    const cand = () => v.active.map(mark).find((m) => m?.visible);
    expect(board?.visible).toBe(true);
    const seen = new Set<number>();
    for (let t = 0; t < CORE_FX.period; t += 100) {
      H.step(100, 100);
      expect([board?.alpha, board?.tint, cand()?.tint]).toEqual([1, CORE_FX.activeTint, 0xffffff]);
      expect(board?.scale.x ?? 0).toBeGreaterThanOrEqual(CORE_FX.activeScale);
      expect(board?.scale.x ?? 0).toBeGreaterThan(cand()?.scale.x ?? 0);
      seen.add(Math.round((cand()?.scale.x ?? 0) * 1000));
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(v.coreLane.visible).toBe(true);
  });

  it('yakınlık sağlanamazsa kısa sönme efekti oynar ve biter; işaret tahtada kalmaz', () => {
    for (let y = 12; y < 21; y++) for (const x of [3, 4, 5]) g.board[idx(x, y)] = PIECE.S;
    g.boardVer++;
    placePiece(g, PIECE.T, 0, 3, 0);
    g.core = true;
    g.hardDrop(); // çiçek (4, 10): en yakın gri 11 sıra altta → söner
    expect(g.coresFizzled).toBe(1);
    H.step(16);
    expect(v.fizzle.visible).toBe(true);
    expect(v.fizzle.y).toBeCloseTo((10 - HIDDEN) * v.L.cell + v.L.cell / 2, 6);
    expect(marked(v.cells)).toBe(0);
    H.step(CORE_FX.fizzleMs + 32);
    expect(v.fizzle.visible).toBe(false);
  });

  it('reduced motion: sönme efekti oynamaz (işaret doğrudan kalkar)', () => {
    v.reducedMotion = true;
    for (let y = 12; y < 21; y++) for (const x of [3, 4, 5]) g.board[idx(x, y)] = PIECE.S;
    g.boardVer++;
    placePiece(g, PIECE.T, 0, 3, 0);
    g.core = true;
    g.hardDrop();
    H.step(16);
    expect(v.fizzle.visible).toBe(false);
    expect(marked(v.cells)).toBe(0);
  });
});
