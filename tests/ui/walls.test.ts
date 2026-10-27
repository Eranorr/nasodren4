// NS4-33: organik sinüs duvarları: oda şekilleri, açıldıkça geri çekilme, yumuşak geçiş, HUD bağlantısı ve stiller.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import { COLS, ROOMS, VIS } from '../../src/config/gameConfig';
import {
  WALLS,
  WALL_BACK,
  WALL_BASE,
  wallInset,
  wallPath,
  wallPolygons,
  wallShape,
  type WallShape,
} from '../../src/ui/sinusWalls';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { rule } from '../helpers/css';
import { clearBoard, fillRow, dropVerticalI, finishClear } from '../helpers/gameHelpers';
import { PIECE } from '../../src/game/pieces';
import { loadUi } from '../helpers/uiHarness';

const SHAPES = Object.entries<WallShape>(WALLS);
const SIDES = ['left', 'right', 'top', 'bottom'] as const;
const LEN = { left: VIS, right: VIS, top: COLS, bottom: COLS };
/** Kenar boyunca en derin nokta (k: kabarık çarpanı). */
const deepest = (s: WallShape, k = 1) =>
  Math.max(
    ...SIDES.flatMap((side) => Array.from({ length: LEN[side] * 8 + 1 }, (_, i) => wallInset(s, side, i / 8, k))),
  );
/** Ekran koordinatında işaretli alan (pozitif: saat yönü). */
const area = (pts: readonly (readonly [number, number])[]) =>
  pts.reduce((a, [x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length] ?? [0, 0];
    return a + x * ny - nx * y;
  }, 0) / 2;

describe('NS4-33: oda şekilleri', () => {
  it('her odanın kendi şekli var; Serbest nefes ve oda dışı "free"', () => {
    expect(ROOMS.map((_, i) => wallShape(i))).toEqual(ROOMS.map((r) => WALLS[r.id]));
    expect(new Set(ROOMS.map((_, i) => wallPath(wallShape(i), 0))).size).toBe(ROOMS.length);
    expect(wallShape(ROOMS.length)).toBe(WALLS.free);
    expect(WALLS.free.bulges).toEqual([]);
  });

  it.each(SHAPES)('%s: bütün alt yollar aynı yönde (nonzero dolguda birleşir, delik açmaz)', (_id, s) => {
    for (const open of [0, 0.5, 1])
      for (const scale of [1, WALL_BACK])
        for (const p of wallPolygons(s, open, scale)) expect(area(p)).toBeGreaterThan(0);
  });

  it.each(SHAPES)('%s: sinüs ağzı (üst kenar ortası) açık; kabarıklar bir hücreyi geçmez', (_id, s) => {
    for (let x = 3.2; x <= 6.8; x += 0.1) expect(wallInset(s, 'top', x, 1)).toBe(WALL_BASE);
    expect(deepest(s)).toBeLessThanOrEqual(1.05);
  });

  it("kapalı odada duvarlar belirgin (en az 0,5 hücre), açılınca kabarıklar %12'ye çekilir", () => {
    for (const r of ROOMS) {
      const s = WALLS[r.id];
      expect(deepest(s)).toBeGreaterThanOrEqual(0.5);
      expect(deepest(s, 0.12) - WALL_BASE).toBeCloseTo((deepest(s) - WALL_BASE) * 0.12, 5);
    }
  });

  it('açıldıkça duvar yolu değişir ve geri çekilir (en derin nokta azalır)', () => {
    const s = WALLS.yanak;
    const maxX = (open: number) => Math.max(...(wallPolygons(s, open)[0] ?? []).map(([x]) => x)); // sol bant
    expect(maxX(0)).toBeGreaterThan(maxX(0.5));
    expect(maxX(0.5)).toBeGreaterThan(maxX(1));
    expect(wallPath(s, 0)).not.toBe(wallPath(s, 1));
  });
});

describe('NS4-33: yumuşak geçiş (syncWalls)', () => {
  let dom: FakeDom;
  beforeEach(() => {
    dom = installFakeDom();
  });
  const load = async () => {
    vi.resetModules();
    return import('../../src/ui/sinusWalls');
  };
  const front = () => dom.el('walls-front').getAttribute('d');
  const back = () => dom.el('walls-back').getAttribute('d');

  it('ilk karede hedefe oturur; ön ve arka katman yazılır', async () => {
    const w = await load();
    w.syncWalls(0, 0, 1000);
    expect(front()).toBe(wallPath(WALLS.yanak, 0));
    expect(back()).toBe(wallPath(WALLS.yanak, 0, WALL_BACK));
  });

  it('açıklık değişince süzülerek gider, sonunda hedefe varır', async () => {
    const w = await load();
    w.syncWalls(0, 0, 0);
    w.syncWalls(0, 0.5, 100);
    const mid = front();
    expect(mid).not.toBe(wallPath(WALLS.yanak, 0));
    expect(mid).not.toBe(wallPath(WALLS.yanak, 0.5));
    for (let t = 116; t < 5000; t += 16) w.syncWalls(0, 0.5, t);
    expect(front()).toBe(wallPath(WALLS.yanak, 0.5));
  });

  it('değişiklik yoksa yol yeniden yazılmaz', async () => {
    const w = await load();
    w.syncWalls(1, 0.25, 0);
    const el = dom.el('walls-front');
    const spy = vi.spyOn(el, 'setAttribute');
    for (let t = 16; t < 500; t += 16) w.syncWalls(1, 0.25, t);
    expect(spy).not.toHaveBeenCalled();
  });

  it('oda değişince yeni şekil yazılır ve yeni oda tıkalı hâline doğru kapanır', async () => {
    const w = await load();
    w.syncWalls(0, 1, 0);
    w.syncWalls(1, 0, 16);
    expect(front()).not.toBe(wallPath(WALLS.yanak, 1));
    expect(front()).not.toBe(wallPath(WALLS.etmoid, 0)); // hemen kapanmaz
    for (let t = 32; t < 5000; t += 16) w.syncWalls(1, 0, t);
    expect(front()).toBe(wallPath(WALLS.etmoid, 0));
  });

  it('hareketi azalt: süzülmeden yeni duruma geçer; resetWalls sonrası ilk kare oturur', async () => {
    const w = await load();
    w.setWallsReducedMotion(true);
    w.syncWalls(2, 0, 0);
    w.syncWalls(2, 0.7, 16);
    expect(front()).toBe(wallPath(WALLS.alin, 0.7));
    w.setWallsReducedMotion(false);
    w.resetWalls();
    w.syncWalls(3, 0.3, 32);
    expect(front()).toBe(wallPath(WALLS.sfenoid, 0.3));
  });
});

describe('NS4-33: HUD bağlantısı', () => {
  let dom: FakeDom;
  beforeEach(() => {
    vi.useFakeTimers();
    dom = installFakeDom();
  });

  it('oyun başında 1. odanın tıkalı duvarı; oda açılıp geçince 2. odanın şekli', async () => {
    const ui = await loadUi(1, true);
    ui.lc.start();
    ui.frame();
    expect(dom.el('walls-front').getAttribute('d')).toBe(wallPath(WALLS.yanak, 0));
    clearBoard(ui.g);
    fillRow(ui.g, 21, PIECE.GARBAGE, [9]);
    dropVerticalI(ui.g);
    finishClear(ui.g);
    vi.advanceTimersByTime(5000);
    ui.g.update(5000);
    for (let i = 0; i < 400; i++) ui.frame(); // gerçek zamanla süzülür; şekil oda değişince hemen yazılır
    expect(ui.g.room).toBe(1);
    const d = dom.el('walls-front').getAttribute('d') ?? '';
    expect(d.split('Z').length - 1).toBe(wallPolygons(WALLS.etmoid, 0).length);
  });

  it('oda akışı kapalıyken açık "free" duvarı', async () => {
    const ui = await loadUi(1, false);
    ui.lc.start();
    ui.frame();
    expect(dom.el('walls-front').getAttribute('d')).toBe(wallPath(WALLS.free, 1));
  });
});

describe('NS4-33: işaretleme ve stiller', () => {
  it('duvarlar #board-bg içinde, ekran okuyucudan gizli; ızgara duvarların üstünde', () => {
    const bg = html.slice(html.indexOf('id="board-bg"'), html.indexOf('id="meter"'));
    expect(bg).toContain('id="sinus-walls"');
    expect(bg).toContain('aria-hidden="true"');
    expect(bg).toContain(`viewBox="0 0 ${COLS} ${VIS}"`);
    expect(bg.indexOf('walls-back')).toBeLessThan(bg.indexOf('walls-front'));
    expect(rule('#board-bg::before')).toContain('z-index: 1');
    expect(rule('#board-bg::before')).toContain('var(--cell)');
    expect(rule('#board-bg')).toContain('isolation: isolate');
    expect(rule('.sinus-walls')).toContain('pointer-events: none');
  });

  it('renkler odanın tonundan türetilir (sabit renk yok)', () => {
    for (const sel of ['.wall-back', '.wall-front', '.sinus-walls']) {
      expect(rule(sel)).toContain('var(--color-rim)');
      expect(rule(sel)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });
});
