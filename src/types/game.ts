// Oyun motoru domain tipleri (NS4-04). Yalnızca derleme zamanında vardır; runtime değerleri
// (tahtadaki sayılar, durum dizeleri) NS4-01 davranış referansıyla aynıdır.

/** Tetrominolar: 1 I, 2 O, 3 T, 4 S, 5 Z, 6 J, 7 L. */
export type TetrominoType = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** Tıkanıklık (inflamasyon) hücresi: oyun sonu griye dönen yığın ve testler. NS4-24: rebound çöpü kaldırıldı. */
export type GarbageCell = 8;
/** Dokusu ve rengi olan her hücre değeri. */
export type BlockId = TetrominoType | GarbageCell;
/** Tahta (Uint8Array) hücresi: 0 boş. */
export type CellValue = 0 | BlockId;
/** Aktif / bekletilen parça: 0 = yok. */
export type PieceSlot = TetrominoType | 0;

export type RotationState = 0 | 1 | 2 | 3;
/** Tek adım: yatay hareket (-1 sol, 1 sağ) veya rotasyon yönü (-1 CCW, 1 CW). */
export type Step = 1 | -1;
export type RotationDirection = Step;
/** SRS geçiş anahtarı ('01' = 0'dan 1'e). */
export type RotationTransition = '01' | '10' | '12' | '21' | '23' | '32' | '30' | '03';

/** [x, y] hücre ofseti (şekil) veya tekme ofseti. */
export type Offset = readonly [x: number, y: number];
export type PieceShape = readonly [Offset, Offset, Offset, Offset];
export type PieceRotations = readonly [PieceShape, PieceShape, PieceShape, PieceShape];
export type KickTable = Readonly<Record<RotationTransition, readonly Offset[]>>;

/** Game.state: 'idle' yalnızca sayfa açılışında, ilk start() öncesindedir. */
export type GameState = 'idle' | 'play' | 'clearing' | 'draining' | 'over';
export type GameOverReason = 'blockout' | 'lockout' | 'overlap';
/** 'lines' satır temizleme, 'cyc' sıklamen özütü, 'sneeze' hapşırık (NS4-24: 'syn' sentetik açıcı yerine). */
export type PendingClearKind = 'lines' | 'cyc' | 'sneeze' | 'room';
export type PowerupKind = Exclude<PendingClearKind, 'lines' | 'room'>;
/** 0 yok, 1 mini, 2 tam T-spin. */
export type TSpinKind = 0 | 1 | 2;
