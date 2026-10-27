/* =====================================================================
   İÇERİK: Sinüs Odaları metinleri (NS4-27)
   Oda yapısı (sıra/boşluk) config/gameConfig.ts ROOMS'tadır; burada yalnızca
   görünür adlar. Anatomi adları sağlık ipucundaki (tip.paranasal) adlarla
   aynıdır; tedavi iddiası içermez.
   ===================================================================== */
import { ROOMS, type RoomId } from '../config/gameConfig';

export const ROOM_TEXT: Readonly<Record<RoomId, { readonly name: string; readonly short: string }>> = {
  yanak: { name: 'Yanak sinüsü', short: 'Yanak' },
  etmoid: { name: 'Gözler arası sinüs', short: 'Gözler arası' },
  alin: { name: 'Alın sinüsü', short: 'Alın' },
  sfenoid: { name: 'Kafa tabanı sinüsü', short: 'Kafa tabanı' },
};
/** Son odadan sonraki sonsuz mod. */
export const FREE_NAME = 'Serbest nefes';
/** NS4-30: hedef, neyin yapılacağını söyler (parlayan boşluklar = hava kanalı). */
export const ROOM_GOAL = 'Parlayan boşlukları doldur, bulutçukları uçur';
/** NS4-30: oyunda ilk bulutçuk uçunca (1. odada, oyun başına bir kez). */
export const CLOUD_HINT = 'Bulutçuk uçtu! Hepsini uçur, sinüs açılsın.';
export const ROOM_CLEAR = 'Sinüs açıldı!';
export const ALL_CLEAR = 'Bütün sinüsler açık!';
/** NS4-31: son odanın açılış kartında "sıradaki" yerine. */
export const ROOM_NEXT_FINAL = 'Sırada: final';
export const FREE_GOAL = 'Rekor için nefes almaya devam et';

/** Oda indeksi → { ad, kısa ad }; ROOMS.length ve ötesi Serbest nefes. */
export function roomText(i: number): { readonly name: string; readonly short: string } {
  const def = ROOMS[i];
  return def ? ROOM_TEXT[def.id] : { name: FREE_NAME, short: FREE_NAME };
}
/** NS4-30: açıklık oranı (0..1) → tam sayı yüzde (aşağı yuvarlanır: son bulutçuk uçmadan %100 görünmez). */
export function openPercent(openness: number): number {
  return Math.floor(Math.min(1, Math.max(0, openness)) * 100 + 1e-9);
}
/** HUD etiketi: "1/4 · Yanak" ya da "Serbest nefes". */
export function roomLabel(i: number): string {
  return i < ROOMS.length ? `${i + 1}/${ROOMS.length} · ${roomText(i).short}` : FREE_NAME;
}
