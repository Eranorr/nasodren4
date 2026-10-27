/* =====================================================================
   NS4-34: blok bitkisi dokuları. Parça başına tek sıklamen (bkz.
   game/plants.ts); bu modül her hücrenin bitki katmanını çizer:
   - sap atlası: 16 bağlantı × 4 tür (düz sap, yapraklı, sivri uç, çiçek
     sapı). Sap katmanlı çizgi olarak çizilir; dik köşelerde çeyrek çember
     (sarmal). Sivri uç da çizilir.
   - çiçek atlası: her parça rengi için açmış çiçek ve tomurcuk, dik
     çizilir; görünüm sprite'ı bağlantının tersine döndürür.
   NS4-36: çiçek, tomurcuk ve yapraklar kullanıcının sıklamen blok
   karolarından (tools/blocks/prepare_plants.py): her rengin kendi karo
   çiçeği, tomurcuk onun kapalı hâli, karodaki iki kalp yaprak; sap
   karodaki bordo sabın renklerinde. Parçalarda çapa görselin ortasında,
   uç yukarıda, çapadan uca = yükseklik / 2.
   ===================================================================== */
import { LINK, ROLE, plantLinks, plantRole } from '../game/plants';
import type { TetrominoType } from '../types/game';
import { BLOCK_ART, loadImage } from './textures';

export type PlantImage = CanvasImageSource & { readonly width: number; readonly height: number };
export interface PlantArt {
  readonly flower: Readonly<Record<TetrominoType, PlantImage>>;
  readonly bud: Readonly<Record<TetrominoType, PlantImage>>;
  readonly leaves: readonly [PlantImage, PlantImage];
}

/** Ölçüler hücre oranıdır. Uç uzunlukları çapadan uca. */
export const PLANT = {
  /** NS4-36: karodaki gibi ince sap */
  stem: 0.13,
  /** çiçek ve tomurcuk sapın kenardan bu kadar içerideki ucuna oturur; çiçek oradan hücreyi boydan doldurur */
  stub: 0.16,
  flower: 0.74,
  bud: 0.56,
  leaf: 0.5,
  tail: 0.72,
} as const;
/** NS4-36: karodaki bordo sabın kesitinden, blok "göz yormasın" ayarıyla: dış çizgi, gövde, açık, parıltı. */
export const STEM_COLORS = { edge: '#470e13', body: '#72232c', light: '#913840', shine: '#b3666d' } as const;
const SHADOW = 'rgba(0,0,0,.28)';

const TETROMINO_IDS = [1, 2, 3, 4, 5, 6, 7] as const satisfies readonly TetrominoType[];
/** Sap atlası 4 × 16 karo, ardından 7 × (çiçek, tomurcuk). */
export const STEM_TILES = 64;
export const PLANT_TILES = STEM_TILES + TETROMINO_IDS.length * 2;
export const PLANT_COLS = 8;

/** [bit, dx, dy]: yukarı, sağ, aşağı, sol. */
const DIRS = [
  [LINK.up, 0, -1],
  [LINK.right, 1, 0],
  [LINK.down, 0, 1],
  [LINK.left, -1, 0],
] as const;
const on = (links: number) => DIRS.filter((d) => links & d[0]);

/** Atlas karosu: sap çizimi rolüne göre (çiçek ve tomurcuk kısa çiçek sapını kullanır, üstüne çiçek karosu gelir). */
export function stemIndex(code: number): number {
  const r = plantRole(code);
  const slot = r === ROLE.leaf ? 1 : r === ROLE.tail ? 2 : r === ROLE.head || r === ROLE.bud ? 3 : 0;
  return slot * 16 + plantLinks(code);
}

/** Çiçek karosu yalnızca çiçek ve tomurcuk rolünde; yoksa -1. */
export function bloomIndex(type: TetrominoType, code: number): number {
  const r = plantRole(code);
  if (r !== ROLE.head && r !== ROLE.bud) return -1;
  return STEM_TILES + (type - 1) * 2 + (r === ROLE.bud ? 1 : 0);
}

/** Çiçek dik çizilir; tek bağlantıda bağlantının tersine bakar (bağlantısızsa yukarı). Radyan. */
export function bloomRotation(code: number): number {
  const d = on(plantLinks(code));
  if (d.length !== 1) return 0;
  const [, dx, dy] = d[0];
  return Math.atan2(-dy, -dx) + Math.PI / 2;
}

/**
 * Sap orta çizgisi: dik köşede çeyrek çember, diğerlerinde merkezden kenar ortalarına; bağlantısızsa düğüm.
 * `stub`: çiçek sapı: yalnızca bağlantı kenarından PLANT.stub kadar içeri (çiçeğin dibine).
 */
function stemPath(x: CanvasRenderingContext2D, links: number, px: number, stub = false) {
  const c = px / 2,
    d = on(links);
  x.beginPath();
  if (stub) {
    for (const [, dx, dy] of d) {
      x.moveTo(c + dx * c, c + dy * c);
      x.lineTo(c + dx * (c - px * PLANT.stub), c + dy * (c - px * PLANT.stub));
    }
    return;
  }
  if (d.length === 2 && d[0][1] * d[1][1] + d[0][2] * d[1][2] === 0) {
    const kx = c + c * (d[0][1] + d[1][1]),
      ky = c + c * (d[0][2] + d[1][2]);
    const a0 = Math.atan2(c * d[0][2] + c - ky, c * d[0][1] + c - kx),
      a1 = Math.atan2(c * d[1][2] + c - ky, c * d[1][1] + c - kx);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    x.arc(kx, ky, c, a0, a0 + da, da < 0);
  } else if (d.length === 0) {
    x.moveTo(c - px * 0.01, c);
    x.lineTo(c + px * 0.01, c);
  } else
    for (const [, dx, dy] of d) {
      x.moveTo(c, c);
      x.lineTo(c + dx * c, c + dy * c);
    }
}

/** Yuvarlak sap: gölge + koyu dış çizgi, gövde, sol üstten ışık alan açık şerit ve parıltı. */
function strokeStem(x: CanvasRenderingContext2D, links: number, px: number, stub = false) {
  const T = px * PLANT.stem;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const layer = (w: number, color: string, shift: number, shadow: boolean) => {
    x.save();
    x.translate(-T * shift, -T * shift);
    if (shadow) {
      x.shadowColor = SHADOW;
      x.shadowBlur = T * 0.6;
      x.shadowOffsetY = T * 0.25;
    }
    stemPath(x, links, px, stub);
    x.lineWidth = T * w;
    x.strokeStyle = color;
    x.stroke();
    x.restore();
  };
  layer(1, STEM_COLORS.edge, 0, true);
  layer(0.72, STEM_COLORS.body, 0, false);
  layer(0.36, STEM_COLORS.light, 0.1, false);
  layer(0.12, STEM_COLORS.shine, 0.17, false);
}

/** Dik (yukarı bakan) parçayı çapası (ax, ay) üzerinden `angle` yönüne döndürüp çizer. */
function drawPart(x: CanvasRenderingContext2D, img: PlantImage, ax: number, ay: number, angle: number, reach: number) {
  const h = reach * 2,
    w = (h * img.width) / img.height;
  x.save();
  x.shadowColor = SHADOW;
  x.shadowBlur = reach * 0.12;
  x.shadowOffsetY = reach * 0.06;
  x.translate(ax, ay);
  x.rotate(angle + Math.PI / 2);
  x.drawImage(img, -w / 2, -h / 2, w, h);
  x.restore();
}

/** Yaprağın yeri ve yönü: sapın boş tarafına (köşede bükümün dışına, çatalda eksik kola, uçta dışarı). */
export function leafPlace(links: number, px: number): readonly [x: number, y: number, angle: number] {
  const c = px / 2,
    d = on(links);
  if (d.length === 0) return [c, c, -Math.PI / 2];
  if (d.length === 1) return [c, c, Math.atan2(-d[0][2], -d[0][1])];
  if (d.length === 3) {
    const miss = DIRS.find((q) => !(links & q[0])) ?? DIRS[0];
    return [c, c, Math.atan2(miss[2], miss[1])];
  }
  if (d.length === 2 && d[0][1] * d[1][1] + d[0][2] * d[1][2] === 0) {
    const kx = c + c * (d[0][1] + d[1][1]),
      ky = c + c * (d[0][2] + d[1][2]);
    const a = Math.atan2(c - ky, c - kx);
    return [kx + c * Math.cos(a), ky + c * Math.sin(a), a];
  }
  // düz: yatayda yukarı, dikeyde sağa (hafif eğik)
  return links & LINK.left ? [c, c, -Math.PI / 2 + 0.35] : [c, c, -0.35];
}

/** Sivri sap ucu: sapın kalınlığında başlar, sivrilerek biter; sap renkleri, kesitte soldan ışık (dik: dip 0, 0). */
function drawTail(x: CanvasRenderingContext2D, ax: number, ay: number, angle: number, len: number, T: number) {
  x.save();
  x.translate(ax, ay);
  x.rotate(angle + Math.PI / 2);
  x.beginPath();
  x.moveTo(-T / 2, 0);
  x.quadraticCurveTo(-T * 0.42, -len * 0.62, 0, -len);
  x.quadraticCurveTo(T * 0.42, -len * 0.62, T / 2, 0);
  x.closePath();
  const g = x.createLinearGradient(-T / 2, 0, T / 2, 0);
  g.addColorStop(0, STEM_COLORS.edge);
  g.addColorStop(0.22, STEM_COLORS.light);
  g.addColorStop(0.34, STEM_COLORS.shine);
  g.addColorStop(0.55, STEM_COLORS.body);
  g.addColorStop(1, STEM_COLORS.edge);
  x.shadowColor = SHADOW;
  x.shadowBlur = T * 0.6;
  x.shadowOffsetY = T * 0.25;
  x.fillStyle = g;
  x.fill();
  x.shadowColor = 'transparent';
  x.lineWidth = Math.max(1, T * 0.1);
  x.strokeStyle = STEM_COLORS.edge;
  x.stroke();
  x.restore();
}

function drawStemTile(x: CanvasRenderingContext2D, slot: number, links: number, px: number, art: PlantArt) {
  const c = px / 2,
    d = on(links);
  if (slot === 2 && d.length <= 1) {
    // sivri sap ucu: bağlantı kenarından içeri doğru (bağlantısızsa ortada, yukarı)
    const [ax, ay, ang] = d.length
      ? [c + d[0][1] * c, c + d[0][2] * c, Math.atan2(-d[0][2], -d[0][1])]
      : [c, c + px * 0.25, -Math.PI / 2];
    drawTail(x, ax, ay, ang, px * PLANT.tail * (d.length ? 1 : 0.55), px * PLANT.stem);
    return;
  }
  if (slot === 3) {
    if (d.length === 1) strokeStem(x, links, px, true);
    return;
  }
  if (links) strokeStem(x, links, px);
  if (slot === 1) {
    const [ax, ay, ang] = leafPlace(links, px);
    drawPart(x, art.leaves[links % 2], ax, ay, ang, px * PLANT.leaf);
  }
}

/** Sap ve çiçek karolarını tek atlasa çizer (karo adımı px + 4, kenarda 2 px pay; her karo kendi alanına kırpılır). */
export function createPlantAtlas(px: number, art: PlantArt): { atlas: HTMLCanvasElement; P: number } {
  const P = px + 4;
  const atlas = document.createElement('canvas');
  atlas.width = P * PLANT_COLS;
  atlas.height = P * Math.ceil(PLANT_TILES / PLANT_COLS);
  const x = atlas.getContext('2d');
  if (!x) throw new Error('Canvas 2D bağlamı oluşturulamadı');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  const tile = (i: number, draw: () => void) => {
    x.save();
    x.translate((i % PLANT_COLS) * P + 2, Math.floor(i / PLANT_COLS) * P + 2);
    x.beginPath();
    x.rect(0, 0, px, px);
    x.clip();
    draw();
    x.restore();
  };
  for (let slot = 0; slot < 4; slot++)
    for (let links = 0; links < 16; links++) tile(slot * 16 + links, () => drawStemTile(x, slot, links, px, art));
  for (const t of TETROMINO_IDS) {
    // çapa (çiçeğin dibi) sapın ucunda, hücrenin alt kenarından PLANT.stub içeride
    const ay = px * (1 - PLANT.stub);
    tile(STEM_TILES + (t - 1) * 2, () => drawPart(x, art.flower[t], px / 2, ay, -Math.PI / 2, px * PLANT.flower));
    tile(STEM_TILES + (t - 1) * 2 + 1, () => drawPart(x, art.bud[t], px / 2, ay, -Math.PI / 2, px * PLANT.bud));
  }
  return { atlas, P };
}

export function plantArtUrl(name: string): string {
  return `${import.meta.env.BASE_URL}images/bitki/${name}.webp`;
}

/** Bitki parçalarını yükler (renk adları BLOCK_ART ile aynı). Biri bile yüklenemezse null: bloklar bitkisiz kalır. */
export function loadPlantArt(): Promise<PlantArt | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  const each = (prefix: string) =>
    Promise.all(TETROMINO_IDS.map((t) => loadImage(plantArtUrl(`${prefix}-${BLOCK_ART[t]}`)))).then(
      ([i, o, t, s, z, j, l]) => ({ 1: i, 2: o, 3: t, 4: s, 5: z, 6: j, 7: l }),
    );
  return Promise.all([
    each('cicek'),
    each('tomurcuk'),
    loadImage(plantArtUrl('yaprak1')),
    loadImage(plantArtUrl('yaprak2')),
  ]).then(
    ([flower, bud, l1, l2]) => ({ flower, bud, leaves: [l1, l2] }),
    () => null,
  );
}
