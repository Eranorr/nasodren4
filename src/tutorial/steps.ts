/* =====================================================================
   İLK OYUN ÖĞRETİCİSİ: adımlar ve kısa yönlendirme metinleri (NS4-12)
   Metinler "Nasıl oynanır" ekranındaki kontrol anlatımlarıyla aynı dili
   kullanır. Güçlendiriciler burada öğretilmez (mevcut toast + buton durumları).
   ===================================================================== */

/** Sıralı öğretici adımları; her biri tek bir eylemle tamamlanır. */
export const TUTORIAL_STEPS = ['move', 'rotate', 'soft', 'hard', 'hold', 'clear'] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

/** Anlatımın hangi kontrol tipine göre gösterileceği (son kullanılan girişe göre değişir). */
export type InputMode = 'keyboard' | 'touch';

export interface StepCopy {
  readonly title: string;
  readonly keyboard: string;
  readonly touch: string;
}

export const STEP_COPY: Readonly<Record<TutorialStep, StepCopy>> = {
  move: {
    title: 'Kaydır',
    keyboard: '← → ile bloğu sağa ya da sola kaydır.',
    touch: 'Tahtada sağa-sola sürükle: bloğu kaydır.',
  },
  rotate: { title: 'Döndür', keyboard: '↑ veya X ile döndür (Z: ters yön).', touch: 'Tahtaya kısa dokun: blok döner.' },
  soft: {
    title: 'Yavaş indir',
    keyboard: '↓ tuşunu basılı tut: blok yavaşça iner.',
    touch: 'Aşağı doğru yavaşça sürükle.',
  },
  hard: {
    title: 'Anında bırak',
    keyboard: 'Boşluk tuşu: blok anında yerine iner.',
    touch: 'Aşağı hızlıca fırlat: blok anında iner.',
  },
  hold: {
    title: 'Beklet',
    keyboard: 'C veya Shift: bloğu sonraya beklet.',
    touch: 'Yukarı fırlat ya da Beklet’e dokun.',
  },
  clear: {
    title: 'Satır temizle',
    keyboard: 'Bir satırı baştan sona doldur: satır silinir, puan kazanırsın.',
    touch: 'Bir satırı baştan sona doldur: satır silinir, puan kazanırsın.',
  },
};

/** Döndürme adımında aktif blok kare (O) ise: O dönmez, ilerlemek için sonraki blok beklenir. */
export const ROTATE_O_NOTE = 'Kare blok dönmez; sonraki blokla dene.';

/** Öğretici tamamlandığında gösterilen kısa toast. */
export const TUTORIAL_DONE_TEXT = 'Öğretici tamamlandı. İyi oyunlar!';
