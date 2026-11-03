/* =====================================================================
   SIKLAMEN ÇEKİRDEĞİ: çekirdek işareti, drenaj ışığı ve sönme görünümü.
   İşaret, çiçek hücresinin üstüne binen ince bir halka ve köşede dört
   uçlu küçük bir yıldızdır (yalnızca renge bağlı değil; koyu kontur her
   karo renginde okunur). Blok, sap ve çiçek dokularına dokunmaz.
   ===================================================================== */

export const CORE_FX = {
  /** Halka yarıçapı ve kalınlığı (hücre oranı). */
  ring: 0.43,
  width: 0.075,
  /** Nabız periyodu (ms) ve genliği (ölçek ±, alpha alt sınırı). Reduced motion: sabit. */
  period: 1100,
  pulse: 0.07,
  alphaMin: 0.7,
  /** Drenaj: hedef sıra ışığının tepe alpha'sı. */
  channelAlpha: 0.32,
  /** Aktif çekirdeğin son parçalarında tahtadaki işaretin alpha çarpanı. */
  fadeAlpha: 0.55,
  /** Yakınlık sağlanamayan çekirdeğin sönme efekti süresi (ms) ve rengi. */
  fizzleMs: 360,
  fizzleTint: 0xb8b0bc,
  tint: 0xfff1f8,
  /**
   * Tahtadaki AKTİF çekirdek: aday işaretinden büyük ve altın renkli, ayrı bir ritimle parlar; hedef sırası tahtanın
   * arkasında altın bir şeritle aydınlanır (Sıklamen gücü bu hizadan 3 sıra siler).
   */
  activeScale: 1.3,
  activePulse: 0.1,
  activeTint: 0xffd166,
  laneTint: 0xffd166,
  laneAlpha: 0.2,
  laneAlphaMin: 0.1,
} as const;

/** px × px (2 px kenar boşluğu dahil değil) halka + yıldız. */
export function createCoreMarkCanvas(px: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const x = cv.getContext('2d');
  if (!x) throw new Error('Canvas 2D bağlamı oluşturulamadı');
  const c = px / 2,
    r = px * CORE_FX.ring,
    w = Math.max(1.5, px * CORE_FX.width);
  x.beginPath();
  x.arc(c, c, r, 0, Math.PI * 2);
  x.strokeStyle = 'rgba(70,10,48,.6)';
  x.lineWidth = w * 1.9;
  x.stroke();
  x.strokeStyle = 'rgba(255,248,252,.95)';
  x.lineWidth = w;
  x.stroke();
  // köşede dört uçlu yıldız (şekil ipucu)
  const sx = px * 0.8,
    sy = px * 0.2,
    s = px * 0.15,
    t = s * 0.32;
  x.beginPath();
  x.moveTo(sx, sy - s);
  x.lineTo(sx + t, sy - t);
  x.lineTo(sx + s, sy);
  x.lineTo(sx + t, sy + t);
  x.lineTo(sx, sy + s);
  x.lineTo(sx - t, sy + t);
  x.lineTo(sx - s, sy);
  x.lineTo(sx - t, sy - t);
  x.closePath();
  x.fillStyle = 'rgba(255,255,255,1)';
  x.strokeStyle = 'rgba(70,10,48,.7)';
  x.lineWidth = Math.max(1, w * 0.6);
  x.stroke();
  x.fill();
  return cv;
}

/**
 * Sinüzit Atağı: atak kaynaklı gri bulutçuğun işareti: sağ alt köşede koyu konturlu küçük bir kama (renkten bağımsız
 * şekil ipucu; hareketsiz, reduced motion'dan etkilenmez). Oda grisinde yoktur.
 */
export function createAttackMarkCanvas(px: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const x = cv.getContext('2d');
  if (!x) throw new Error('Canvas 2D bağlamı oluşturulamadı');
  const e = px * 0.9,
    s = px * 0.24,
    w = Math.max(1, px * 0.05);
  x.beginPath();
  x.moveTo(e, e - s);
  x.lineTo(e, e);
  x.lineTo(e - s, e);
  x.closePath();
  x.lineJoin = 'round';
  x.strokeStyle = 'rgba(40,12,20,.75)';
  x.lineWidth = w * 2;
  x.stroke();
  x.fillStyle = 'rgba(255,138,92,.95)';
  x.fill();
  return cv;
}

/** Aktif çekirdeğin ölçeği ve hedef şeridinin alpha'sı (t ms). Reduced motion: sabit. */
export function activeCorePulse(t: number, reduced: boolean): { readonly scale: number; readonly lane: number } {
  if (reduced) return { scale: CORE_FX.activeScale, lane: CORE_FX.laneAlpha };
  const k = 0.5 - 0.5 * Math.cos((t / CORE_FX.period) * Math.PI * 2);
  return {
    scale: CORE_FX.activeScale * (1 + CORE_FX.activePulse * k),
    lane: CORE_FX.laneAlphaMin + (CORE_FX.laneAlpha - CORE_FX.laneAlphaMin) * k,
  };
}

/** İşaretin o anki ölçek çarpanı ve alpha'sı (t ms). Reduced motion: sabit (1, 1). */
export function coreMarkPulse(t: number, reduced: boolean): { readonly scale: number; readonly alpha: number } {
  if (reduced) return { scale: 1, alpha: 1 };
  const k = 0.5 - 0.5 * Math.cos((t / CORE_FX.period) * Math.PI * 2);
  return { scale: 1 - CORE_FX.pulse + 2 * CORE_FX.pulse * k, alpha: CORE_FX.alphaMin + (1 - CORE_FX.alphaMin) * k };
}
