/* =====================================================================
   İÇERİK: rozet tanımları (kimlik → ad, açıklama)
   NS4-03: main.ts'ten birebir taşındı. Kimlikler fn_meta.badges içinde
   saklandığı için değiştirilmemelidir; sıra oyun sonu listesinin sırasıdır.
   ===================================================================== */
import type { BadgeDefinition, BadgeId } from '../types/content';

/** Oyun sonu listesinin sırası (BADGES anahtarlarıyla aynı sıra). */
export const BADGE_IDS = ['ozmotik', 'noro', 'akis', 'hapsu', 'derin'] as const satisfies readonly BadgeId[];

// Record<BadgeId, …>: her kimlik tam bir kez tanımlı olmalı (derleme zamanında denetlenir).
export const BADGES: Readonly<Record<BadgeId, BadgeDefinition>> = {
  ozmotik: { id: 'ozmotik', name: 'Ozmotik usta', desc: 'İlk 4 satırlık drenaj' },
  noro: { id: 'noro', name: 'Nörorefleks uzmanı', desc: 'İlk T-spin temizliği' },
  akis: { id: 'akis', name: 'Akış hali', desc: '5\u2019li kombo' },
  // NS4-24: 'dogal' (Sentetik açıcısız 5. seviye) kaldırıldı; kayıtlı eski kimlik normalizeMeta ile atılır
  hapsu: { id: 'hapsu', name: 'Çok yaşa!', desc: 'Bir oyunda 3 hapşırık' },
  derin: { id: 'derin', name: 'Derin nefes', desc: 'Toplam 100 satır drenaj' },
};
