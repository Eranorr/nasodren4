/* =====================================================================
   NS4-15: geri bildirim efektlerinin tarifleri (saf veri, PixiJS yok).
   GameView bu değerlerle mevcut parçacık havuzunu, satır flaşlarını ve
   Texture.WHITE katmanlarını sürer. Yeni doku, varlık veya bağımlılık yoktur;
   blok dokularına dokunulmaz. Mekanik süreler (CFG) burada değiştirilmez.
   ===================================================================== */
import type { ScoredEvent } from '../types/events';

/** Satır temizlemenin görsel dili: normal drenaj, Tetris (Ozmotik etki), T-spin (Nörorefleks etki). */
export type ClearFlavor = 'drain' | 'osmotic' | 'neuro';

/** `scored` olayından temizleme dili. T-spin satır temizlemesi Nörorefleks, dört satır Ozmotik, diğerleri drenaj. */
export function flavorOf(e: Pick<ScoredEvent, 'n' | 'tspin'>): ClearFlavor {
  if (e.tspin && e.n > 0) return 'neuro';
  if (e.n === 4) return 'osmotic';
  return 'drain';
}

/** Reduced motion altında sarsıntı ve parçacık çarpanları (durumlar/mesajlar ve mekanik süreler aynı kalır). */
export const REDUCED = { shake: 0.25, particles: 0.3, glow: 0.6 } as const;

export interface MotionScale {
  readonly shake: number;
  readonly particles: number;
  readonly glow: number;
  /** Titreşimli (çok vuruşlu) flaş ve uyarılar; reduced motion altında tek, yumuşak vuruş. */
  readonly flicker: boolean;
}
export function motionScale(reduced: boolean): MotionScale {
  return reduced ? { ...REDUCED, flicker: false } : { shake: 1, particles: 1, glow: 1, flicker: true };
}

/** Satır temizleme tarifleri. Parçacık sayıları hücre başınadır; sarsıntı 0..1. */
export interface LineRecipe {
  /** Satır flaşı rengi. */
  readonly flash: number;
  /** Sıçrayan damla (hücre başına) ve aşağı süzülen damla (hücre başına). */
  readonly splash: number;
  readonly drip: number;
  /** Yatay kıvılcım çizgisi (hücre başına; Nörorefleks). */
  readonly streak: number;
  /** Flaşın satır yüksekliğine göre büyümesi (Ozmotik açılma). */
  readonly bloom: number;
  readonly shake: number;
  /** Tahta üzerine tek vuruşluk yumuşak renk (yoksa 0). */
  readonly glow: number;
  readonly glowPeak: number;
}
export const LINE_FX: Readonly<Record<ClearFlavor, LineRecipe>> = {
  drain: { flash: 0xe8fdff, splash: 2, drip: 1, streak: 0, bloom: 0, shake: 0, glow: 0, glowPeak: 0 },
  osmotic: { flash: 0xc8fbff, splash: 3, drip: 1, streak: 0, bloom: 0.9, shake: 0.5, glow: 0x3fd2de, glowPeak: 0.22 },
  neuro: { flash: 0xeadcff, splash: 0, drip: 1, streak: 2, bloom: 0, shake: 0.3, glow: 0xb48cff, glowPeak: 0.14 },
};

/** Nörorefleks kıvılcım rengi sırası (mor / pembe / beyaz) ve T merkezinden radyal patlama sayısı. */
export const NEURO_TINTS = [0xc9a8ff, 0xff8fd8, 0xffffff] as const;
export const NEURO_BURST = 12;
/** Ozmotik damla renkleri: blok rengi, beyaz, turkuaz. */
export const OSMOTIC_TINT = 0x3fd2de;
/** Sıklamen: çözünme parçacık renkleri (pembe / turkuaz) ve ×2 başlangıç vuruşu. */
export const CYC_TINTS = [0xff9ccc, 0x5fe6d6] as const;
export const CYC_DONE = { glow: 0xff79bd, peak: 0.24, dur: 460, rise: 16 } as const;

/** Tahta üstü vuruşlu uyarılar (süreler ms; mekanikten bağımsız, yalnızca görsel). */
export interface GlowRecipe {
  readonly tint: number;
  readonly peak: number;
  readonly dur: number;
  readonly beats: number;
  readonly shake: number;
}
/**
 * NS4-24: Hapşırık: önce tahta iki kez "nefes alır" (anticipation, ilk `windup` oranı; hücreler titrer),
 * sonra savrulan hücreler yukarı uçar ve renkli konfeti (hücre başına `confetti`) saçılır. Islak hiçbir şey yok.
 */
export const SNEEZE_FX = {
  windup: 0.45,
  shake: 0.45,
  confetti: 2,
  flash: 0xfff4d6,
  tints: [0xffd166, 0xff9ccc, 0x5fe6d6, 0xffffff],
  glow: 0xffe3a3,
  glowPeak: 0.2,
} as const;

/**
 * NS4-21: hava akışı: tahtanın boş alanında, yığının yüzeyinden sinüs ağzına (yukarı) süzülen soluk zerrecikler.
 * Blokların arkasında, kendi küçük havuzunda (`count`); toz gibi değil ışık kabarcığı gibi görünsün diye ADD karışımı. Sinüs tıkandıkça seyrelir ve yavaşlar; tam tıkanıklıkta durur.
 * Hızlar hücre/sn, ömür ms, boyut hücre oranı.
 */
export const AIRFLOW = {
  count: 28,
  rate: 7,
  alpha: 0.6,
  life: [1400, 2400],
  speed: [1.4, 2.4],
  size: [0.2, 0.36],
  tints: [0xe8fffc, 0xbff6ef, 0xffd9ea],
} as const;
/** Saniyede doğan zerrecik (tıkanıklık 0 → AIRFLOW.rate, 1 → 0; tıkandıkça hızla seyrelir). */
export function airflowRate(congestion: number): number {
  const open = 1 - Math.min(1, Math.max(0, congestion));
  return AIRFLOW.rate * open * open;
}
/** Yükselme hızı çarpanı (açıkken 1, tıkalıyken 0,35). */
export function airflowSpeed(congestion: number): number {
  return 0.35 + 0.65 * (1 - Math.min(1, Math.max(0, congestion)));
}

/**
 * NS4-27: "Sinüs açıldı": serin turkuaz tek vuruş, alttan bütün genişlikte yükselen kabarcıklar; geçiş boyunca
 * kalan hücreler hafifçe yükselip söner (yeni oda tahtası geçiş sonunda gelir).
 */
export const ROOM_FX = { glow: 0x7ff0e0, peak: 0.3, dur: 900, bubbles: 40, shake: 0.2 } as const;

/** Vuruşlu ışıma eğrisi: p ∈ [0,1], `beats` kez yükselip söner, sona doğru zayıflar. p ≥ 1 → 0. */
export function glowAlpha(p: number, peak: number, beats: number): number {
  if (p >= 1 || p < 0) return 0;
  return peak * Math.abs(Math.sin(Math.PI * beats * p)) * (1 - 0.45 * p);
}

/** Parçacık bütçesi: kesirli payı biriktirerek tamsayı adet verir (reduced motion'da da deterministik). */
export class Budget {
  private acc = 0;
  take(n: number, ratio: number): number {
    this.acc += n * ratio;
    const k = Math.floor(this.acc + 1e-9);
    this.acc -= k;
    return k;
  }
  reset() {
    this.acc = 0;
  }
}
