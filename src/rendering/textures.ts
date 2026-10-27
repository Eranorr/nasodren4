/* =====================================================================
   TEXTURES: blok renkleri ve canvas 2D ile çizilen dokular
   NS4-03: View.buildTextures() içindeki çizim kodu saf fonksiyonlara
   ayrıldı (çizim komutları değişmedi). PIXI texture oluşturma ve eski
   texture'ları yok etme sırası View.buildTextures() içinde kalır.
   NS4-21: yalnızca gri tıkanıklık bloğuna (8) somurtkan, sevimli bir yüz
   eklendi; renkli tetromino blokları (1-7) ve hayaletler değişmedi.
   NS4-32: renkli bloklar (1-7) kullanıcının sıklamen karo görselleriyle
   çizilir (kullanıcı onayı 2026-10-27). Görseller yüklenene kadar eski
   jöle çizimi yedek olarak kalır. Gri blok ve hayaletler değişmedi.
   ===================================================================== */
import type { BlockId, TetrominoType } from '../types/game';

/** Atlas sütun sırası (Object.keys(COLORS) ile aynı: 1..8 artan). */
export const BLOCK_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly BlockId[];

/** NS4-32: 1-7 sıklamen karolarının kenar rengine yakın (hayalet çerçevesi, sıçrayan damla tint'i). */
export const COLORS: Readonly<Record<BlockId, string>> = {
  1: '#5cc9c4',
  2: '#ffcf5a',
  3: '#e44d97',
  4: '#7cc47e',
  5: '#f4869f',
  6: '#b45cf2',
  7: '#f9a184',
  8: '#8e93a6',
};

/**
 * NS4-32: sıklamen blok görselleri, `public/images/bloklar/<ad>.webp`. Kaynak `art/bloklar/`; kırpma, küçültme ve
 * "göz yormasın" ayarı (doygunluk, kontrast, parlaklık) `tools/blocks/prepare_blocks.py` ile yapılır. I için görsel
 * yoktu: turkuaz karo yeşil karodan üretilir. NS4-34: karolar çiçeksizdir (düz jöle); parça başına tek sıklamen
 * üstlerine ayrı katmanda çizilir (rendering/plants.ts).
 */
export const BLOCK_ART: Readonly<Record<TetrominoType, string>> = {
  1: 'turkuaz',
  2: 'sari',
  3: 'fusya',
  4: 'yesil',
  5: 'pembe',
  6: 'mor',
  7: 'seftali',
};
export type BlockArt = Readonly<Record<TetrominoType, CanvasImageSource>>;
const TETROMINO_IDS = [1, 2, 3, 4, 5, 6, 7] as const satisfies readonly TetrominoType[];
/** Görsel karonun hücre içindeki payı (px oranı): komşu karolar arasında ince bir aralık kalır. */
const ART_INSET = 0.03;

export function blockArtUrl(id: TetrominoType): string {
  return `${import.meta.env.BASE_URL}images/bloklar/${BLOCK_ART[id]}.webp`;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = url;
  });
}

/** Yedi görseli yükler. Biri bile yüklenemezse (veya ortamda Image yoksa) null: jöle çizimi kalır. */
export function loadBlockArt(): Promise<BlockArt | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return Promise.all(TETROMINO_IDS.map((id) => loadImage(blockArtUrl(id)))).then(
    ([i, o, t, s, z, j, l]) => ({ 1: i, 2: o, 3: t, 4: s, 5: z, 6: j, 7: l }),
    () => null,
  );
}

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

/**
 * NS4-22: sıklamen yaprağı (beyaz; renk tint ile). Uzun, ucu yuvarlak; dar tabanı daha koyu (sıklamenin "gözü"),
 * ortasında ince açık damar. Boyut: yükseklik px, genişlik px / 2.
 */
export function createPetalCanvas(px: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const h = Math.max(12, Math.round(px)),
    w = Math.max(6, Math.round(h / 2));
  cv.width = w;
  cv.height = h;
  const x = context2d(cv);
  const g = x.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, 'rgba(150,150,150,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,.9)');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(w / 2, h);
  x.bezierCurveTo(w * 0.05, h * 0.7, -w * 0.05, h * 0.2, w * 0.38, h * 0.04);
  x.quadraticCurveTo(w / 2, 0, w * 0.62, h * 0.04);
  x.bezierCurveTo(w * 1.05, h * 0.2, w * 0.95, h * 0.7, w / 2, h);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.6)';
  x.lineWidth = Math.max(1, w * 0.06);
  x.beginPath();
  x.moveTo(w / 2, h * 0.9);
  x.quadraticCurveTo(w * 0.46, h * 0.5, w / 2, h * 0.15);
  x.stroke();
  return cv;
}

/** NS4-32: görsel karo, küçültmede yumuşak örnekleme ile. */
function drawArt(x: CanvasRenderingContext2D, img: CanvasImageSource, px: number) {
  const ins = px * ART_INSET;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, ins, ins, px - ins * 2, px - ins * 2);
}

/**
 * Tek atlas: 8 blok + 8 hayalet karo -> tahtanın tamamı tek draw call. `P` karo adımıdır.
 * NS4-32: `art` verilirse 1-7 görsel karodur; yoksa jöle çizimi.
 */
export function createBlockAtlas(px: number, art: BlockArt | null = null): { atlas: HTMLCanvasElement; P: number } {
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
    if (k !== FACE_ID && art) drawArt(x, art[k], px);
    else drawBlock(x, c, px);
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

/**
 * NS4-37: sıklamen özütü sıvısının renk geçişi (dikey; yatayda esnetilir, yüzey dalgası GameView'de maskeyle çizilir).
 * Üstte açık sıklamen pembesi, ortada sıklamen, dipte turkuaz. Eski 256×128 döşenen dalga dokusu esnetilince
 * testere dişi gibi görünüyordu.
 */
export function createLiquidCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 256;
  const x = context2d(cv);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,196,224,.96)');
  g.addColorStop(0.08, 'rgba(250,130,186,.9)');
  g.addColorStop(0.45, 'rgba(222,78,152,.78)');
  g.addColorStop(1, 'rgba(70,196,198,.62)');
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 256);
  return cv;
}
