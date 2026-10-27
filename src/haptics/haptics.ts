/* =====================================================================
   HAPTICS (navigator.vibrate: Android Chrome. iOS Safari desteklemez.)
   NS4-03: main.ts'ten taşındı. Ayar durumu dışarıdan verilir (DOM/ayar
   nesnesine doğrudan erişim yok).
   NS4-17: desenler yorgunluk oluşturmayacak biçimde kısaltıldı. Sürekli
   hareketler (kaydırma, döndürme, yumuşak indirme) titreşim üretmez.
   NS4-24: sentetik/rebound/garbage desenleri yerine hapşırık (ha… ha… HAPŞU). Titreşim yalnızca kendi ayarına bağlıdır
   (reduced motion tercihi onu kapatmaz). navigator yoksa veya vibrate
   desteklenmiyorsa hiçbir çağrı yapılmaz.
   ===================================================================== */

/** navigator.vibrate var mı (navigator'ın olmadığı ortamlarda da güvenli). */
export function detectVibrate(nav: { vibrate?: unknown } | undefined = globalThis.navigator): boolean {
  return typeof nav?.vibrate === 'function';
}
export const canVibrate = detectVibrate();

/** Desen alanları salt-okunurdur (diziler navigator.vibrate'in beklediği VibratePattern tipindedir). */
export interface HapticPatterns {
  /** Yerçekimiyle oturma (hard drop'ta ayrıca çalınmaz, bkz. app/events.ts). */
  readonly lock: number;
  readonly hard: number;
  /** Satır temizleme: 1 / 2 / 3 / 4 (Tetris) satır. */
  readonly clear: (n: number) => number[];
  readonly over: number[];
  /** İki kısa "ha…" ve bir güçlü "HAPŞU". */
  readonly sneeze: number[];
  readonly cyc: number[];
  /** NS4-27: oda açıldı (uzun, yumuşak "ahh" dalgası). */
  readonly room: number[];
  /** NS4-22: Tam Ferahlık (yükselen üç dalga ve uzun bir rahatlama). */
  readonly allClear: number[];
}

export const HAPTIC: HapticPatterns = {
  lock: 10,
  hard: 22,
  clear: (n: number) => (n >= 4 ? [14, 36, 20, 36, 34] : n === 3 ? [12, 36, 22] : n === 2 ? [12, 40, 16] : [16]),
  over: [60, 60, 120, 80, 200],
  sneeze: [8, 140, 10, 200, 40],
  cyc: [8, 50, 10, 50, 14, 50, 20],
  room: [10, 60, 16, 60, 30],
  allClear: [12, 50, 18, 50, 26, 70, 44],
};

/** Desenin toplam süresi (ms; titreşim + aralar). */
export function patternMs(p: VibratePattern): number {
  return typeof p === 'number' ? p : p.reduce((a, b) => a + b, 0);
}

export type Buzz = (p: VibratePattern) => void;

/** `isEnabled` her çağrıda okunur (ayar panelindeki değişiklik anında geçerli olur). */
export function createBuzz(
  isEnabled: () => boolean,
  supported: boolean = canVibrate,
  nav: { vibrate?: (p: VibratePattern) => boolean } | undefined = globalThis.navigator,
): Buzz {
  return function buzz(p) {
    if (!supported || !isEnabled() || typeof nav?.vibrate !== 'function') return;
    try {
      nav.vibrate(p);
    } catch {
      /* bilinçli: desteklenmeyen/engelli titreşim yok sayılır */
    }
  };
}
