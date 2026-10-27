// NS4-15: blok görünümü regresyon testleri. NS4-14 blok görselleri geri alındı; bloklar NS4-13 (a700ca8) çizimiyle
// aynı olmalıdır. Node'da canvas yok: çizim komutlarını kaydeden küçük bir 2D bağlam taklidi ile atlas ölçüleri ve
// bütün çizim komut dizisinin parmak izi sabitlenir. Parmak izi değişirse blok görünümü değişmiş demektir.
// NS4-32: renkli bloklar artık sıklamen görselleri (kullanıcı onayı 2026-10-27). Jöle çizimi, görseller yüklenene
// kadar yedek olarak kalır; komutları aynı, yalnızca palet karolara uyduruldu.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLOCK_ART,
  BLOCK_IDS,
  COLORS,
  blockArtUrl,
  createBlockAtlas,
  createHappyCloudCanvas,
  createPetalCanvas,
  loadBlockArt,
  type BlockArt,
} from '../../src/rendering/textures';

type Op = readonly [name: string, ...args: unknown[]];

/** NS4-32: yayınlanan blok görselleri (yalnızca adları kullanılır). */
const SHIPPED = Object.keys(import.meta.glob('../../public/images/bloklar/*.webp')).map((f) =>
  f.replace(/^.*\/(.+)\.webp$/, '$1'),
);

/** Komut kaydedici 2D bağlam: yöntem çağrıları ve stil atamaları sırayla `ops` dizisine yazılır. */
function recorder() {
  const ops: Op[] = [];
  const grad = { addColorStop: (o: number, c: string) => void ops.push(['stop', o, c]) };
  const ctx: Record<string, unknown> = {};
  for (const m of [
    'save',
    'restore',
    'translate',
    'beginPath',
    'closePath',
    'moveTo',
    'lineTo',
    'bezierCurveTo',
    'quadraticCurveTo',
    'arc',
    'arcTo',
    'ellipse',
    'fill',
    'stroke',
    'clip',
    'fillRect',
    'setLineDash',
    'drawImage',
  ])
    ctx[m] = (...a: unknown[]) => void ops.push([m, ...a]);
  ctx['createLinearGradient'] = (...a: unknown[]) => (ops.push(['linear', ...a]), grad);
  ctx['createRadialGradient'] = (...a: unknown[]) => (ops.push(['radial', ...a]), grad);
  for (const p of [
    'fillStyle',
    'strokeStyle',
    'globalAlpha',
    'lineWidth',
    'lineCap',
    'lineJoin',
    'imageSmoothingEnabled',
    'imageSmoothingQuality',
  ])
    Object.defineProperty(ctx, p, { set: (v: unknown) => void ops.push(['set:' + p, v]), get: () => undefined });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

let canvases: { width: number; height: number; ops: Op[] }[];
beforeEach(() => {
  canvases = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const r = recorder();
      const cv = { width: 0, height: 0, ops: r.ops, getContext: () => r.ctx };
      canvases.push(cv);
      return cv;
    },
  });
});

/** Komut dizisinin kararlı parmak izi (FNV-1a, sayılar 4 ondalığa yuvarlanır). */
function fingerprint(ops: readonly Op[]): string {
  const s = JSON.stringify(ops.map((o) => o.map((a) => (typeof a === 'number' ? Math.round(a * 1e4) / 1e4 : a))));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + ':' + ops.length;
}

/**
 * a700ca8 çiziminin parmak izleri. NS4-21: gri bloğa yüz eklendiği için parmak izi renkli 7 sütunun
 * (1-7; 8. sütundan önceki bütün komutlar) üzerinden alınır. Tam atlas 432 → 432 + yüz komutları.
 * NS4-32: yedek jöle çizimi; komutlar (379) aynı, yalnızca NS4-32 paleti (a700ca8: f32c5079 / 8d5515c2 / f8db8392).
 */
const PINNED: readonly (readonly [number, string])[] = [
  [36, '95795c25:379'],
  [64, '1250f48c:379'],
  [104, '00ee1e62:379'],
];
/** 8. sütunun (gri tıkanıklık) ilk translate komutundan önceki komutlar. */
function colorPrefix(ops: readonly Op[], px: number): readonly Op[] {
  const cut = ops.findIndex((o) => o[0] === 'translate' && o[1] === 7 * (px + 4) + 2);
  return ops.slice(0, cut);
}

describe('blok atlası NS4-13 (a700ca8) görünümünde', () => {
  it.each([
    [12, 1],
    [18, 2],
    [32, 1],
    [32, 2],
    [52, 2],
    [56, 2],
  ])('hücre %i px, DPR %i: 8 sütun × 2 satır (blok + hayalet), karo adımı px + 4', (cell, dpr) => {
    const px = Math.max(8, Math.round(cell * dpr)); // GameView.buildTextures ile aynı
    const { atlas, P } = createBlockAtlas(px);
    expect(P).toBe(px + 4);
    expect([atlas.width, atlas.height]).toEqual([P * BLOCK_IDS.length, P * 2]);
    expect(canvases).toHaveLength(1);
  });

  it('NS4-14 eklemeleri yok: kesik kenar, kırpma/tarama, üçüncü satır', () => {
    createBlockAtlas(64);
    const ops = canvases[0]?.ops ?? [];
    expect(ops.some((o) => o[0] === 'setLineDash')).toBe(false);
    expect(ops.some((o) => o[0] === 'clip')).toBe(false);
    const rows = new Set(ops.filter((o) => o[0] === 'translate').map((o) => o[2]));
    expect([...rows].sort((a, b) => Number(a) - Number(b))).toEqual([2, 68 + 2]); // satır 0 ve 1 (P = 68)
  });

  it.each(PINNED)('renkli blokların çizim komutlarının parmak izi sabit (px %i)', (px, expected) => {
    createBlockAtlas(px);
    expect(fingerprint(colorPrefix(canvases[0]?.ops ?? [], px))).toBe(expected);
  });

  it('NS4-21: yüz yalnızca gri blok karosunda (hayalet ve renkli bloklarda yok); 8. sütun 54 + yüz komutu', () => {
    createBlockAtlas(64);
    const ops = canvases[0]?.ops ?? [];
    const pre = colorPrefix(ops, 64);
    const col8 = ops.slice(pre.length);
    // yüz mürekkebi yalnızca 8. sütunda ve blok satırında (hayalet satırına geçmeden önce)
    const ink = (o: Op) => o[0].startsWith('set:') && o[1] === 'rgba(38,44,62,.72)';
    expect(pre.some(ink)).toBe(false);
    const ghostStart = col8.findIndex((o, i) => i > 0 && o[0] === 'translate');
    expect(col8.slice(0, ghostStart).some(ink)).toBe(true);
    expect(col8.slice(ghostStart).some(ink)).toBe(false);
    expect(ops.length).toBeGreaterThan(432);
  });

  it('NS4-32 blok paleti (sıklamen karolarına uyar; gri değişmedi)', () => {
    expect(COLORS).toEqual({
      1: '#5cc9c4',
      2: '#ffcf5a',
      3: '#e44d97',
      4: '#7cc47e',
      5: '#f4869f',
      6: '#b45cf2',
      7: '#f9a184',
      8: '#8e93a6',
    });
  });

  it('NS4-27: gülümseyen bulutçuk karosu: gri bloğun aynı çizimi + gülümseme ve yanaklar', () => {
    createBlockAtlas(64);
    createHappyCloudCanvas(64);
    const [atlas, happy] = canvases;
    expect([happy?.width, happy?.height]).toEqual([68, 68]);
    const ops = happy?.ops ?? [];
    // gri blok çizimi atlasın 8. sütunuyla aynı (translate ve yüz hariç)
    const col8 = (atlas?.ops ?? []).slice(colorPrefix(atlas?.ops ?? [], 64).length);
    // atlas öneki 8. sütunun translate komutunda kesilir (save önekte kalır); tek karo save + translate ile başlar
    const blockOf = (o: readonly Op[], skip: number) =>
      o.slice(
        skip,
        o.findIndex((x) => x[1] === 'rgba(38,44,62,.72)'),
      );
    expect(fingerprint(blockOf(ops, 2))).toBe(fingerprint(blockOf(col8, 1))); // ±0 farkı yuvarlamayla gider
    expect(ops.some((o) => o[0] === 'set:fillStyle' && o[1] === 'rgba(255,140,190,.5)')).toBe(true);
  });
});

describe('NS4-22: sıklamen yaprağı', () => {
  it('beyaz çizilir (renk tint ile), tabanı koyu; boyut yükseklik px, genişlik yarısı', () => {
    createPetalCanvas(48);
    const [petal] = canvases;
    expect([petal?.width, petal?.height]).toEqual([24, 48]);
    const colors = (petal?.ops ?? []).filter((o) => o[0] === 'stop' || o[0].startsWith('set:')).map((o) => o.at(-1));
    for (const c of colors.filter((x): x is string => typeof x === 'string')) expect(c).toMatch(/^rgba\((\d+),\1,\1,/); // gri tonlu: tint rengini bozmaz
    expect(petal?.ops.filter((o) => o[0] === 'fill')).toHaveLength(1);
    createPetalCanvas(4);
    expect([canvases[1]?.width, canvases[1]?.height]).toEqual([6, 12]); // en küçük boyut
  });
});

describe('NS4-32: sıklamen blok görselleri', () => {
  /** Kimliği kendi sütun numarası olan sahte görseller: drawImage çağrısında hangi görselin çizildiği okunur. */
  const art = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((id) => [id, { id }])) as unknown as BlockArt;
  /** Hayalet satırının komutları (her sütunda translate(…, P + 2) ile restore arası). */
  const ghostOps = (ops: readonly Op[], P: number) => {
    let inGhost = false;
    return ops.filter((o) => {
      if (o[0] === 'translate') inGhost = o[2] === P + 2;
      return inGhost;
    });
  };

  it('her parçanın görsel dosyası var; I turkuaz, J mor', () => {
    expect(Object.keys(BLOCK_ART)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(new Set(Object.values(BLOCK_ART)).size).toBe(7);
    expect([...SHIPPED].sort()).toEqual(Object.values(BLOCK_ART).sort());
    expect(BLOCK_ART[1]).toBe('turkuaz');
    expect(BLOCK_ART[6]).toBe('mor');
    expect(blockArtUrl(3)).toBe('/images/bloklar/fusya.webp');
  });

  it('görsel varsa 1-7 sütunları görselle (paylı, yumuşak örneklemeli), gri blok jöle + yüzle çizilir', () => {
    const px = 64,
      P = px + 4;
    createBlockAtlas(px, art);
    const ops = canvases[0]?.ops ?? [];
    const draws = ops.filter((o) => o[0] === 'drawImage');
    expect(draws.map((o) => (o[1] as { id: number }).id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const ins = px * 0.03;
    for (const d of draws) expect(d.slice(2)).toEqual([ins, ins, px - ins * 2, px - ins * 2]);
    expect(ops).toContainEqual(['set:imageSmoothingQuality', 'high']);
    // renkli sütunlarda jöle gradyanı yok; gri sütunda var ve yüz mürekkebi duruyor
    const pre = colorPrefix(ops, px);
    expect(pre.some((o) => o[0] === 'linear')).toBe(false);
    const col8 = ops.slice(pre.length);
    expect(col8.some((o) => o[0] === 'linear')).toBe(true);
    expect(col8.some((o) => o[1] === 'rgba(38,44,62,.72)')).toBe(true);
    expect([canvases[0]?.width, canvases[0]?.height]).toEqual([P * 8, P * 2]);
  });

  it('hayaletler görselden etkilenmez', () => {
    createBlockAtlas(64);
    createBlockAtlas(64, art);
    const [plain, withArt] = canvases;
    expect(ghostOps(plain?.ops ?? [], 68).length).toBeGreaterThan(8 * 10); // 8 hayalet karosu yakalandı
    expect(fingerprint(ghostOps(withArt?.ops ?? [], 68))).toBe(fingerprint(ghostOps(plain?.ops ?? [], 68)));
  });

  it('Image olmayan ortamda yükleme null döner (jöle çizimi kalır)', async () => {
    vi.stubGlobal('Image', undefined);
    await expect(loadBlockArt()).resolves.toBeNull();
  });

  it('bir görsel yüklenemezse null; hepsi yüklenirse 1-7 sırasıyla', async () => {
    const make = (fail: (src: string) => boolean) =>
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(v: string) {
          queueMicrotask(() => (fail(v) ? this.onerror?.() : this.onload?.()));
          this.url = v;
        }
        url = '';
      };
    vi.stubGlobal(
      'Image',
      make((v) => v.includes('mor')),
    );
    await expect(loadBlockArt()).resolves.toBeNull();
    vi.stubGlobal(
      'Image',
      make(() => false),
    );
    const loaded = (await loadBlockArt()) as unknown as Record<number, { url: string }>;
    expect([1, 2, 3, 4, 5, 6, 7].map((id) => loaded[id]?.url)).toEqual(
      ([1, 2, 3, 4, 5, 6, 7] as const).map((id) => blockArtUrl(id)),
    );
  });
});
