// NS4-34: blok bitkisi dokuları: atlas karoları, çiçek yönü, yaprak yeri, yükleme ve görünümde hücre katmanları.
// NS4-36: çiçek, tomurcuk ve yapraklar kullanıcının blok karolarından (her renk kendi çiçeği); çiçek sapı kısa, hücreyi
// boydan doldurur; sap ve sivri uç karodaki bordo sap renklerinde çizilir.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LINK, PLANTS, ROLE, plantCode } from '../../src/game/plants';
import { BLOCK_ART } from '../../src/rendering/textures';
import {
  STEM_COLORS,
  PLANT,
  PLANT_COLS,
  PLANT_TILES,
  STEM_TILES,
  bloomIndex,
  bloomRotation,
  createPlantAtlas,
  leafPlace,
  loadPlantArt,
  plantArtUrl,
  stemIndex,
  type PlantArt,
} from '../../src/rendering/plants';

const SHIPPED = Object.keys(import.meta.glob('../../public/images/bitki/*.webp')).map((f) =>
  f.replace(/^.*\/(.+)\.webp$/, '$1'),
);
const img = (name: string) => ({ name, width: 100, height: 200 });
const ART = {
  flower: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((t) => [t, img(`cicek-${t}`)])),
  bud: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((t) => [t, img(`tomurcuk-${t}`)])),
  leaves: [img('yaprak1'), img('yaprak2')],
} as unknown as PlantArt;

describe('NS4-34: bitki karoları', () => {
  it('sap karosu role göre (çiçek ve tomurcuk kısa çiçek sapını kullanır), çiçek karosu tipe göre', () => {
    expect(stemIndex(plantCode(LINK.left | LINK.right, ROLE.stem))).toBe(10);
    expect(stemIndex(plantCode(LINK.down, ROLE.head))).toBe(48 + 4);
    expect(stemIndex(plantCode(LINK.down, ROLE.bud))).toBe(48 + 4);
    expect(stemIndex(plantCode(LINK.up, ROLE.leaf))).toBe(16 + 1);
    expect(stemIndex(plantCode(LINK.right, ROLE.tail))).toBe(32 + 2);
    expect(bloomIndex(1, plantCode(LINK.left, ROLE.head))).toBe(STEM_TILES);
    expect(bloomIndex(7, plantCode(LINK.left, ROLE.bud))).toBe(STEM_TILES + 13);
    expect(bloomIndex(3, plantCode(LINK.left, ROLE.leaf))).toBe(-1);
    expect(STEM_TILES).toBe(64);
    expect(PLANT_TILES).toBe(78);
  });

  it('çiçek hücreyi boydan doldurur ama taşmaz (sap ucu + çiçek boyu < 1 hücre)', () => {
    expect(PLANT.stub + PLANT.flower).toBeGreaterThanOrEqual(0.88);
    expect(PLANT.stub + PLANT.flower).toBeLessThan(1);
    expect(PLANT.stub + PLANT.bud).toBeLessThan(PLANT.stub + PLANT.flower);
  });

  it('çiçek bağlantının tersine bakar (aşağıdan gelen sapta dik)', () => {
    const r = (links: number) => Math.round((bloomRotation(plantCode(links, ROLE.head)) * 180) / Math.PI);
    expect([r(LINK.down), r(LINK.left), r(LINK.up), r(LINK.right)].map((d) => (d + 360) % 360)).toEqual([
      0, 90, 180, 270,
    ]);
    expect(bloomRotation(plantCode(0, ROLE.head))).toBe(0);
  });

  it('yaprak hücrenin içinde ve sapın boş tarafında', () => {
    const px = 100;
    for (let links = 0; links < 16; links++) {
      const [x, y, a] = leafPlace(links, px);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(px);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(px);
      // yaprak yönü bağlı bir kola doğru değil (düz sapta kola dik; artı şekli hiçbir tasarımda yok)
      for (const [bit, ang] of [
        [LINK.up, -90],
        [LINK.right, 0],
        [LINK.down, 90],
        [LINK.left, 180],
      ] as const)
        if (links & bit && links !== 15 && links !== (LINK.left | LINK.right) && links !== (LINK.up | LINK.down))
          expect(Math.abs((((a * 180) / Math.PI - ang + 540) % 360) - 180)).toBeGreaterThan(30);
    }
  });

  it('her parça rengi için karonun çiçeği ve tomurcuğu, iki kalp yaprak yayınlanıyor (kuyruk çizimle)', () => {
    const want = Object.values(BLOCK_ART).flatMap((n) => [`cicek-${n}`, `tomurcuk-${n}`]);
    expect([...SHIPPED].sort()).toEqual([...want, 'yaprak1', 'yaprak2'].sort());
    expect(plantArtUrl('yaprak1')).toBe('/images/bitki/yaprak1.webp');
  });
});

describe('NS4-34: bitki atlası', () => {
  type Op = readonly unknown[];
  let ops: Op[];
  let canvases: { width: number; height: number }[];
  beforeEach(() => {
    ops = [];
    canvases = [];
    const ctx = new Proxy(
      {},
      {
        get:
          (_t, prop) =>
          (...a: unknown[]) => {
            ops.push([prop, ...a]);
            return prop === 'createLinearGradient'
              ? { addColorStop: (o: number, c: string) => ops.push(['stop', o, c]) }
              : undefined;
          },
        set: () => true,
      },
    );
    vi.stubGlobal('document', {
      createElement: () => {
        const cv = { width: 0, height: 0, getContext: () => ctx };
        canvases.push(cv);
        return cv;
      },
    });
  });

  it('78 karo, 8 sütun, karo adımı px + 4; her karo kendi alanına kırpılır', () => {
    const { P } = createPlantAtlas(40, ART);
    expect(P).toBe(44);
    expect([canvases[0]?.width, canvases[0]?.height]).toEqual([44 * PLANT_COLS, 44 * 10]);
    expect(ops.filter((o) => o[0] === 'clip')).toHaveLength(PLANT_TILES);
  });

  it('görselden çizilenler: her renk için kendi çiçeği ve tomurcuğu, 16 yaprak', () => {
    createPlantAtlas(40, ART);
    const drawn = ops.filter((o) => o[0] === 'drawImage').map((o) => (o[1] as { name: string }).name);
    expect(drawn).toHaveLength(30);
    for (const t of [1, 2, 3, 4, 5, 6, 7]) {
      expect(drawn).toContain(`cicek-${t}`);
      expect(drawn).toContain(`tomurcuk-${t}`);
    }
    expect(drawn.filter((n) => n.startsWith('yaprak'))).toHaveLength(16);
  });

  it('sivri uç çizimle, sap renklerinde (bağlantısız + 4 yön)', () => {
    createPlantAtlas(40, ART);
    const stops = ops.filter((o) => o[0] === 'stop');
    expect(stops.filter((o) => o[2] === STEM_COLORS.shine)).toHaveLength(5);
    expect(stops.every((o) => (Object.values(STEM_COLORS) as unknown[]).includes(o[2]))).toBe(true);
  });

  it('Image yoksa ya da bir parça yüklenemezse null', async () => {
    vi.stubGlobal('Image', undefined);
    await expect(loadPlantArt()).resolves.toBeNull();
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(v: string) {
          queueMicrotask(() => (v.includes('yaprak2') ? this.onerror?.() : this.onload?.()));
        }
      },
    );
    await expect(loadPlantArt()).resolves.toBeNull();
  });
});

describe('NS4-34: görünümde hücre bitki katmanları', () => {
  it('kilitli parça, aktif parça ve önizleme bitkili; gri ve bitkisiz hücrede gizli', async () => {
    const { stubCanvasDom, createView } = await import('../helpers/pixiView');
    stubCanvasDom();
    const { createGame, clearBoard, idx } = await import('../helpers/gameHelpers');
    const g = createGame(4);
    const { view } = await createView(g);
    view.plantArt = ART;
    view.layout(view.L);
    expect(view.plantTex).toHaveLength(PLANT_TILES);
    clearBoard(g);
    const k = idx(3, 21);
    g.board[k] = 6;
    g.plant[k] = PLANTS[6][0][0] ?? 0; // J'nin çiçekli ucu
    g.board[idx(4, 21)] = 8; // gri bulutçuk
    g.plant[idx(4, 21)] = LINK.left;
    g.boardVer++;
    view.syncAll();
    const cell = (x: number) => view.cells[(21 - 2) * 10 + x];
    const [stem, bloom] = (cell(3)?.children ?? []) as { visible: boolean }[];
    expect([stem?.visible, bloom?.visible]).toEqual([true, true]);
    expect((cell(4)?.children ?? []).every((c) => !c.visible)).toBe(true);
    // aktif parça ve sıradaki önizlemesi
    expect(view.active.filter((a) => a.visible).every((a) => a.children[0]?.visible)).toBe(true);
    expect(view.nextS[0]?.every((s) => s.children[0]?.visible)).toBe(true);
    // oyun sonu: yığın griye dönünce bitki kalkar
    view.onGameOver();
    for (let t = 0; t < 2000; t += 16) view.update(16);
    expect((cell(3)?.children ?? []).every((c) => !c.visible)).toBe(true);
  });
});
