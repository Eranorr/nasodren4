/* =====================================================================
   NS4-33: organik sinüs duvarları. Tahtanın kenarlarında, blokların
   arkasında (#board-bg içinde SVG) yumuşak duvarlar; her odanın kendi
   şekli var. Oda açıldıkça (Game.roomOpenness) duvarlar geri çekilir.
   Birim hücredir (viewBox 0 0 COLS VIS). Renk ve parıltı CSS'tedir.
   ===================================================================== */
import { COLS, ROOMS, VIS } from '../config/gameConfig';
import { svg } from './dom';

type Side = 'left' | 'right' | 'top' | 'bottom';
/** Kenardan içeri kabarık: `at` kenar boyunca konum, `size` en çok derinlik, `span` yarı genişlik (hücre). */
export interface Bulge {
  readonly side: Side;
  readonly at: number;
  readonly size: number;
  readonly span: number;
}
/** Köşe yuvarlaklığı (yarıçap, hücre): sol üst, sağ üst, sağ alt, sol alt. */
export interface WallShape {
  readonly corners: readonly [number, number, number, number];
  readonly bulges: readonly Bulge[];
}

/**
 * Oda şekilleri (ROOMS sırasıyla; son eleman Serbest nefes). Üst kenarın ortası sinüs ağzıdır: orada kabarık yok.
 * - Yanak: geniş, yuvarlak mağara; tabanı derin.
 * - Gözler arası (etmoid): petek gibi küçük, sık kıvrımlar.
 * - Alın: üstü kubbe, alta doğru huni gibi daralır.
 * - Kafa tabanı (sfenoid): derin kutu, tabanında orta sırt (kıvrımlar üst yarıda: alt yarı başta gri sıralarla dolu).
 */
export const WALLS: Readonly<Record<(typeof ROOMS)[number]['id'] | 'free', WallShape>> = {
  yanak: {
    corners: [1.6, 1.6, 2.8, 2.8],
    bulges: [
      { side: 'left', at: 3.5, size: 0.4, span: 2 },
      { side: 'left', at: 11, size: 0.95, span: 4.5 },
      { side: 'right', at: 9.5, size: 0.85, span: 4 },
      { side: 'bottom', at: 5, size: 0.4, span: 2.5 },
    ],
  },
  etmoid: {
    corners: [1.1, 1.1, 1.1, 1.1],
    bulges: [
      ...[3, 7, 11, 15].map((at) => ({ side: 'left' as const, at, size: 0.62, span: 1.8 })),
      ...[5, 9, 13, 17].map((at) => ({ side: 'right' as const, at, size: 0.62, span: 1.8 })),
    ],
  },
  alin: {
    corners: [3.2, 3.2, 1.2, 1.2],
    bulges: [
      { side: 'left', at: 6, size: 0.3, span: 2 },
      { side: 'right', at: 6, size: 0.3, span: 2 },
      { side: 'left', at: 15, size: 0.9, span: 4.5 },
      { side: 'right', at: 15, size: 0.9, span: 4.5 },
    ],
  },
  sfenoid: {
    corners: [1.4, 1.4, 1.8, 1.8],
    bulges: [
      { side: 'bottom', at: 5, size: 0.8, span: 1.8 },
      { side: 'left', at: 7, size: 0.75, span: 3 },
      { side: 'right', at: 4.5, size: 0.7, span: 3 },
    ],
  },
  free: { corners: [1, 1, 1, 1], bulges: [] },
};

/** Duvarın her yerde kalan ince payı (hücre) ve arka katmanın ön katmana göre derinliği. */
export const WALL_BASE = 0.06;
export const WALL_BACK = 1.25;
/** Açık sinüste kalan pay: kabarıklar %12'ye, köşeler %35'e çekilir. */
const REST_BULGE = 0.12,
  REST_CORNER = 0.35;
/** Gösterilen açıklık hedefe bu zaman sabitiyle (sn) yaklaşır. */
export const WALL_TAU = 0.45;
const STEP = 0.25;

const LEN: Readonly<Record<Side, number>> = { left: VIS, right: VIS, top: COLS, bottom: COLS };

/** Kenardaki derinlik (hücre). `k` kabarık çarpanı: 1 tıkalı, REST_BULGE açık. */
export function wallInset(shape: WallShape, side: Side, u: number, k: number): number {
  let d = WALL_BASE;
  for (const b of shape.bulges) {
    if (b.side !== side) continue;
    const x = Math.abs(u - b.at) / b.span;
    if (x < 1) d += b.size * k * 0.5 * (1 + Math.cos(Math.PI * x));
  }
  return d;
}

const n2 = (v: number) => String(Math.round(v * 100) / 100);
const poly = (pts: readonly (readonly [number, number])[]) =>
  'M' + pts.map(([x, y]) => `${n2(x)} ${n2(y)}`).join('L') + 'Z';

/**
 * Duvar alt yolları: dört kenar bandı ve dört köşe dolgusu. Hepsi ekranda saat yönünde (nonzero dolguda birleşir,
 * birbirini delmez). `scale`: derinlik çarpanı (arka katman için WALL_BACK).
 */
export function wallPolygons(shape: WallShape, open: number, scale = 1): [number, number][][] {
  const o = Math.min(1, Math.max(0, open));
  const kb = REST_BULGE + (1 - REST_BULGE) * (1 - o),
    kc = REST_CORNER + (1 - REST_CORNER) * (1 - o);
  const d = (side: Side, u: number) => wallInset(shape, side, u, kb) * scale;
  const W = COLS,
    H = VIS,
    out: [number, number][][] = [];
  const samples = (side: Side) => {
    const r: number[] = [];
    for (let u = 0; u < LEN[side]; u += STEP) r.push(u);
    r.push(LEN[side]);
    return r;
  };
  // kenar bantları (dış köşeler tahtanın 1 hücre dışında; SVG kırpar)
  out.push([[-1, -1], ...samples('left').map((y): [number, number] => [d('left', y), y]), [-1, H + 1]]);
  out.push([
    [-1, -1],
    [W + 1, -1],
    ...samples('top')
      .reverse()
      .map((x): [number, number] => [x, d('top', x)]),
  ]);
  out.push([
    [W + 1, -1],
    [W + 1, H + 1],
    ...samples('right')
      .reverse()
      .map((y): [number, number] => [W - d('right', y), y]),
  ]);
  out.push([[W + 1, H + 1], [-1, H + 1], ...samples('bottom').map((x): [number, number] => [x, H - d('bottom', x)])]);
  // köşe dolguları: köşe ile çeyrek çember arası (sol üst, sağ üst, sağ alt, sol alt)
  const cs: [number, number, number, number][] = [
    [0, 0, 1, 1],
    [W, 0, -1, 1],
    [W, H, -1, -1],
    [0, H, 1, -1],
  ];
  cs.forEach(([cx, cy, sx, sy], i) => {
    const R = (shape.corners[i] ?? 0) * kc * scale;
    if (R <= 0) return;
    const pts: [number, number][] = [[cx, cy]];
    for (let j = 0; j <= 8; j++) {
      const a = (Math.PI / 2) * (j / 8); // köşeden uzak uçtan uca: (R,0) → (0,R)
      pts.push([cx + sx * (R - R * Math.sin(a)), cy + sy * (R - R * Math.cos(a))]);
    }
    if (sx * sy < 0) pts.reverse(); // ayna köşelerde yönü koru
    out.push(pts);
  });
  return out;
}

export function wallPath(shape: WallShape, open: number, scale = 1): string {
  return wallPolygons(shape, open, scale).map(poly).join('');
}

/** Oda sırası → şekil. Serbest nefes (ROOMS.length ve sonrası) ve oda akışı kapalıyken 'free'. */
export function wallShape(room: number): WallShape {
  const r = ROOMS[room];
  return r ? WALLS[r.id] : WALLS.free;
}

/** shown: gösterilen açıklık (her karede ilerler); written: yola en son yazılan değer (-1: henüz yok). */
const walls = { room: -1, shown: -1, written: -1, t: 0, reduced: false };
/** Yol yalnızca bu kadar değişince yeniden yazılır (hedefe varış her zaman yazılır). */
const WRITE_STEP = 0.004;

/** "Hareketi azalt": duvarlar süzülmeden yeni duruma geçer. */
export function setWallsReducedMotion(reduced: boolean): void {
  walls.reduced = reduced;
}

/** Yeni oyunda ilk kare hedefe doğrudan oturur. */
export function resetWalls(): void {
  walls.room = walls.shown = walls.written = -1;
}

/**
 * Her HUD karesinde çağrılır. Gösterilen açıklık hedefe yumuşakça yaklaşır; yol yalnızca görünür bir değişimde
 * yeniden yazılır. Oda değişince şekil değişir ve yeni oda tıkalı hâline doğru kapanır.
 */
export function syncWalls(room: number, open: number, now = performance.now()): void {
  const dt = Math.min(0.1, Math.max(0, (now - walls.t) / 1000));
  walls.t = now;
  const roomChanged = room !== walls.room;
  walls.room = room;
  if (walls.shown < 0 || walls.reduced) walls.shown = open;
  else walls.shown += (open - walls.shown) * (1 - Math.exp(-dt / WALL_TAU));
  if (Math.abs(walls.shown - open) < 0.002) walls.shown = open;
  const shown = walls.shown;
  if (!roomChanged && shown === walls.written) return;
  if (!roomChanged && shown !== open && Math.abs(shown - walls.written) < WRITE_STEP) return;
  walls.written = shown;
  const shape = wallShape(room);
  svg('walls-back').setAttribute('d', wallPath(shape, shown, WALL_BACK));
  svg('walls-front').setAttribute('d', wallPath(shape, shown));
}
