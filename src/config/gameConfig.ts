/* =====================================================================
   CONFIG: tahta boyutları ve oyun ayarları
   NS4-03: main.ts'ten taşındı; değerler değişmedi. NS4-04: `as const` +
   `satisfies GameConfig` şemayı derleme zamanında denetler (çalışma anı
   nesnesi aynı; salt-okunurluk yalnızca tip düzeyindedir).
   NS4-24: sentetik açıcı ve rebound kaldırıldı; yerine Hapşırık (sneeze*).
   ===================================================================== */
export const COLS = 10,
  ROWS = 22,
  HIDDEN = 2,
  VIS = 20;

export interface GameConfig {
  /** Kilitlenme gecikmesi (ms) ve en fazla hareket sıfırlaması. */
  readonly lockDelay: number;
  readonly maxLockResets: number;
  /** Temizleme animasyon süreleri (ms). */
  readonly lineClearMs: number;
  readonly drainMs: number;
  readonly softDropFactor: number;
  readonly maxLevel: number;
  readonly linesPerLevel: number;
  /** Güçlerin açıldığı tıkanıklık oranı (0..1). */
  readonly powerThreshold: number;
  readonly cycMultMs: number;
  readonly cycMult: number;
  /** NS4-24: Hapşırık: yeniden dolması için kilitlenen parça sayısı, savrulan üst sıra sayısı ve animasyon (ms). */
  readonly sneezePieces: number;
  readonly sneezeRows: number;
  readonly sneezeMs: number;
  /** NS4-27: oda temizleme bonusu (× oda sırası (1..) × seviye) ve "Sinüs açıldı" geçiş süresi (ms). */
  readonly roomBonus: number;
  readonly roomClearMs: number;
  /** CTA hedef URL'si (UTM parametreleri analytics/cta.ts'te eklenir). */
  readonly cta: string;
}

export const CFG = {
  lockDelay: 500,
  maxLockResets: 15,
  lineClearMs: 300,
  drainMs: 800,
  softDropFactor: 20,
  maxLevel: 20,
  linesPerLevel: 10,
  powerThreshold: 0.35, // tıkanıklık oranı: destekler bu seviyede açılır
  cycMultMs: 30000,
  cycMult: 2,
  sneezePieces: 20,
  sneezeRows: 3,
  sneezeMs: 650,
  roomBonus: 1000,
  roomClearMs: 1400,
  cta: 'https://www.yasasinsaglik.com/',
} as const satisfies GameConfig;

/** NS4-27: sinüs odası kimlikleri (görünür adlar content/rooms.ts'te). */
export type RoomId = 'yanak' | 'etmoid' | 'alin' | 'sfenoid';
export interface RoomDef {
  readonly id: RoomId;
  /** Oda başında alttan dolu gelen gri bulutçuk sırası (tıkanıklık = rows / VIS). */
  readonly rows: number;
  /** Sıra başına en çok boşluk (1..maxHoles; rastgele sütunlar). */
  readonly maxHoles: number;
}
/**
 * NS4-27: Sinüs Odaları. Oyun sırayla bu odalardan geçer; geçme şartı odadaki bütün gri bulutçukları temizlemek.
 * Son odadan sonra "Serbest nefes" (sonsuz maraton; room === ROOMS.length).
 */
export const ROOMS = [
  { id: 'yanak', rows: 4, maxHoles: 3 },
  { id: 'etmoid', rows: 6, maxHoles: 3 },
  { id: 'alin', rows: 8, maxHoles: 2 },
  { id: 'sfenoid', rows: 10, maxHoles: 2 },
] as const satisfies readonly RoomDef[];
