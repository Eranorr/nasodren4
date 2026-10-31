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

/** İşaretin o anki ölçek çarpanı ve alpha'sı (t ms). Reduced motion: sabit (1, 1). */
export function coreMarkPulse(t: number, reduced: boolean): { readonly scale: number; readonly alpha: number } {
  if (reduced) return { scale: 1, alpha: 1 };
  const k = 0.5 - 0.5 * Math.cos((t / CORE_FX.period) * Math.PI * 2);
  return { scale: 1 - CORE_FX.pulse + 2 * CORE_FX.pulse * k, alpha: CORE_FX.alphaMin + (1 - CORE_FX.alphaMin) * k };
}
