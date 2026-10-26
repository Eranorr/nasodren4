/* =====================================================================
   TEXTURES: blok renkleri ve canvas 2D ile çizilen dokular
   NS4-03: View.buildTextures() içindeki çizim kodu saf fonksiyonlara
   ayrıldı (çizim komutları değişmedi). PIXI texture oluşturma ve eski
   texture'ları yok etme sırası View.buildTextures() içinde kalır.
   NS4-21: yalnızca gri tıkanıklık bloğuna (8) somurtkan, sevimli bir yüz
   eklendi; renkli tetromino blokları (1-7) ve hayaletler değişmedi.
   ===================================================================== */
import type { BlockId } from '../types/game';

/** Atlas sütun sırası (Object.keys(COLORS) ile aynı: 1..8 artan). */
export const BLOCK_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly BlockId[];

export const COLORS: Readonly<Record<BlockId, string>> = {
  1: '#3fd2de',
  2: '#ffcf5a',
  3: '#e44d97',
  4: '#55d08a',
  5: '#ff7868',
  6: '#5d8bff',
  7: '#ffa14a',
  8: '#8e93a6',
};

function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(h: string, amt: number) {
  const [r, g, b] = hexToRgb(h);
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Yeni canvas için 2D bağlam. Tarayıcı vermezse açık hata (orijinalde ilk kullanımda TypeError oluşurdu). */
function context2d(cv: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D bağlamı oluşturulamadı');
  return ctx;
}

/** Her BlockId için bir değer üretir; `i` atlas sütunudur (BLOCK_IDS sırası). */
export function blockRecord<V>(make: (id: BlockId, i: number) => V): Record<BlockId, V> {
  return {
    1: make(1, 0),
    2: make(2, 1),
    3: make(3, 2),
    4: make(4, 3),
    5: make(5, 4),
    6: make(6, 5),
    7: make(7, 6),
    8: make(8, 7),
  };
}

/** NS4-21: tıkanıklık bulutçuğunun yüzü (yalnızca blok karosu 8; hayalete çizilmez). */
export const FACE_ID = 8 as const satisfies BlockId;
const FACE_INK = 'rgba(38,44,62,.72)';

/**
 * Bulutçuk yüzü: iki yuvarlak göz (küçük parlak noktalı) ve ağız. `sad`: aşağı kıvrık (tıkanık);
 * `happy` (NS4-27, temizlenirken): gülümseme ve pembe yanaklar. Ölçüler px ile orantılıdır.
 */
function drawFace(x: CanvasRenderingContext2D, px: number, mood: 'sad' | 'happy' = 'sad') {
  const r = Math.max(1, px * 0.06);
  x.fillStyle = FACE_INK;
  for (const ex of [0.36, 0.64]) {
    x.beginPath();
    x.arc(px * ex, px * 0.5, r, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = 'rgba(255,255,255,.85)';
  for (const ex of [0.36, 0.64]) {
    x.beginPath();
    x.arc(px * ex - r * 0.35, px * 0.5 - r * 0.35, r * 0.38, 0, Math.PI * 2);
    x.fill();
  }
  x.strokeStyle = FACE_INK;
  x.lineWidth = Math.max(1, px * 0.05);
  x.lineCap = 'round';
  x.beginPath();
  if (mood === 'sad') x.arc(px * 0.5, px * 0.8, px * 0.12, Math.PI * 1.2, Math.PI * 1.8);
  else x.arc(px * 0.5, px * 0.6, px * 0.13, Math.PI * 0.2, Math.PI * 0.8);
  x.stroke();
  if (mood === 'happy') {
    x.fillStyle = 'rgba(255,140,190,.5)';
    for (const ex of [0.24, 0.76]) {
      x.beginPath();
      x.ellipse(px * ex, px * 0.66, px * 0.07, px * 0.045, 0, 0, Math.PI * 2);
      x.fill();
    }
  }
}

/** Parlak jöle blok karosu (atlas ve tek karo aynı çizimi kullanır; NS4-15 parmak izi korunur). */
function drawBlock(x: CanvasRenderingContext2D, c: string, px: number) {
  const ins = px * 0.045,
    r = px * 0.26,
    w = px - ins * 2;
  let g = x.createLinearGradient(0, 0, 0, px);
  g.addColorStop(0, shade(c, 0.28));
  g.addColorStop(0.55, c);
  g.addColorStop(1, shade(c, -0.22));
  rr(x, ins, ins, w, w, r);
  x.fillStyle = g;
  x.fill();
  x.lineWidth = Math.max(1, px * 0.035);
  x.strokeStyle = shade(c, -0.32);
  x.globalAlpha = 0.55;
  x.stroke();
  x.globalAlpha = 1;
  g = x.createRadialGradient(px * 0.34, px * 0.3, 0, px * 0.34, px * 0.3, px * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  rr(x, ins, ins, w, w, r);
  x.fillStyle = g;
  x.fill();
  x.fillStyle = 'rgba(255,255,255,.75)';
  x.beginPath();
  x.ellipse(px * 0.3, px * 0.24, px * 0.11, px * 0.06, -0.5, 0, Math.PI * 2);
  x.fill();
}

/** NS4-27: gülümseyen gri bulutçuk karosu (temizlenirken uçan hücreler). Boyut px + 4, karo (2, 2)'de. */
export function createHappyCloudCanvas(px: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px + 4;
  const x = context2d(cv);
  x.save();
  x.translate(2, 2);
  drawBlock(x, COLORS[FACE_ID], px);
  drawFace(x, px, 'happy');
  x.restore();
  return cv;
}

/** Tek atlas: 8 blok + 8 hayalet karo -> tahtanın tamamı tek draw call. `P` karo adımıdır. */
export function createBlockAtlas(px: number): { atlas: HTMLCanvasElement; P: number } {
  const P = px + 4,
    keys = BLOCK_IDS;
  const atlas = document.createElement('canvas');
  atlas.width = P * keys.length;
  atlas.height = P * 2;
  const x = context2d(atlas);
  keys.forEach((k, i) => {
    const c = COLORS[k],
      ox = i * P + 2;
    x.save();
    x.translate(ox, 2);
    drawBlock(x, c, px);
    if (k === FACE_ID) drawFace(x, px);
    x.restore();
    x.save();
    x.translate(ox, P + 2);
    rr(x, px * 0.09, px * 0.09, px * 0.82, px * 0.82, px * 0.24);
    x.fillStyle = c;
    x.globalAlpha = 0.14;
    x.fill();
    x.globalAlpha = 0.7;
    x.lineWidth = Math.max(1.5, px * 0.06);
    x.strokeStyle = c;
    x.stroke();
    x.restore();
  });
  return { atlas, P };
}

/** damlacık */
export function createDropCanvas(cell: number, res: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const ds = Math.max(8, Math.round(cell * 0.5 * res));
  cv.width = cv.height = ds;
  const y = context2d(cv);
  const g = y.createRadialGradient(ds * 0.42, ds * 0.4, 0, ds / 2, ds / 2, ds / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  y.fillStyle = g;
  y.fillRect(0, 0, ds, ds);
  return cv;
}

/** sıvı dalga dokusu (yatay döşenir) */
export function createWaveCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const x = context2d(cv);
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,170,210,.95)');
  g.addColorStop(0.25, 'rgba(230,77,151,.75)');
  g.addColorStop(1, 'rgba(53,216,200,.55)');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(0, 128);
  for (let i = 0; i <= 256; i += 4) x.lineTo(i, 6 + Math.sin((i / 256) * Math.PI * 4) * 3);
  x.lineTo(256, 128);
  x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.8)';
  x.lineWidth = 1.5;
  x.beginPath();
  for (let i = 0; i <= 256; i += 4) {
    const yy = 6 + Math.sin((i / 256) * Math.PI * 4) * 3;
    if (i) x.lineTo(i, yy);
    else x.moveTo(i, yy);
  }
  x.stroke();
  return cv;
}
