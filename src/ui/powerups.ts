/* =====================================================================
   GÜÇLENDİRİCİ BUTON DURUMLARI (NS4-07)
   Sıklamen ve hapşırık butonlarının durumu Game'den türetilir; kural
   hesaplamaz, yalnızca okur. Durum `data-state` ve alt metin olarak gösterilir.
   Açılma eşiği, süreler ve şarj kuralları Game/CFG'dedir; burada değişmez.
   NS4-24: sentetik açıcı (rebound riski) yerine hapşırık (yeniden dolar).
   ===================================================================== */
import type { Game } from '../game/Game';

/** locked: eşik altı · ready: kullanılabilir · used: kullanıldı · active: ×2 etkisi sürüyor */
export type CycState = 'locked' | 'ready' | 'used' | 'active';
/** locked: eşik altı (şarj dolu) · ready: kullanılabilir · charging: kullanıldı, yeniden doluyor */
export type SneezeState = 'locked' | 'ready' | 'charging';

/** Kısa buton yardımcı metinleri (oyun durumu; sağlık içeriği değildir). */
export const CYC_TEXT: Readonly<Record<CycState, string>> = {
  locked: 'Tıkanıklık %35’te açılır',
  ready: 'Hazır · oyunda 1 kez',
  used: 'Bu oyunda kullanıldı',
  active: 'Kullanıldı · ×2 etkin',
};
export const SNEEZE_TEXT: Readonly<Record<SneezeState, string>> = {
  locked: 'Tıkanıklık %35’te açılır',
  ready: 'Hazır · üstü savurur',
  charging: 'Burun kaşınıyor…',
};

/** NS4-10: dar (compact) düzende alt metin yerine gösterilen kısa durum etiketleri. */
export const CYC_SHORT: Readonly<Record<CycState, string>> = {
  locked: 'Kilitli',
  ready: 'Hazır',
  used: 'Kullanıldı',
  active: '×2 etkin',
};
export const SNEEZE_SHORT: Readonly<Record<SneezeState, string>> = {
  locked: 'Kilitli',
  ready: 'Hazır',
  charging: 'Doluyor',
};
/** Erişilebilir ad öneki (buton adı; durum metni eklenir). */
export const CYC_NAME = 'Sıklamen özütü';
export const SNEEZE_NAME = 'Hapşırık';

/** `playing` değilse (oyun sonu) süren etkiler gösterilmez; HUD rozetleriyle aynı kural. */
export function cycState(g: Game, playing: boolean): CycState {
  if (g.cycUsed) return playing && g.multT > 0 ? 'active' : 'used';
  return g.canCyc() ? 'ready' : 'locked';
}

export function sneezeState(g: Game): SneezeState {
  if (g.sneezeCharge() < 1) return 'charging';
  return g.canSneeze() ? 'ready' : 'locked';
}

/** Şarj yüzdesi (0..100, 5'lik adım): "Doluyor" durumunda butonun dolum çubuğu. */
export function sneezePercent(g: Game): number {
  return Math.round(g.sneezeCharge() * 20) * 5;
}
