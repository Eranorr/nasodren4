// Game olay adları ve payload tipleri. Olay adları ve payload alanları çalışma davranışının
// parçasıdır; değiştirilmemelidir. Payload'ı olmayan olaylar `void` ile işaretlenir.
import type { GameOverReason, PendingClearKind, TSpinKind } from './game';

/** Temizleme/drenaj işlemi (satırlar küçükten büyüğe sıralı tahta satır indeksleri). */
export interface PendingClear {
  readonly kind: PendingClearKind;
  readonly rows: readonly number[];
  /** 'flush' (sıklamen çekirdeği drenajı): akan gri bulutçuklar (tahta indeksi; rows boştur). */
  readonly cells?: readonly number[];
  /** 'collapse': drenajdan sonra inen renkli hücreler ([eski, yeni] tahta indeksi; tahta zaten günceldir). */
  readonly moves?: readonly (readonly [number, number])[];
}

export interface ScoredEvent {
  readonly n: number;
  readonly tspin: TSpinKind;
  readonly b2b: boolean;
  readonly combo: number;
  readonly pts: number;
}

export type PowerDoneEvent =
  { readonly kind: 'cyc'; readonly n: number } | { readonly kind: 'sneeze'; readonly n: number };

/** NS4-27: oda olayları (room: ROOMS indeksi; ROOMS.length = Serbest nefes). */
export interface RoomStartEvent {
  readonly room: number;
  /** Odadaki gri bulutçuk sayısı (Serbest nefeste 0). */
  readonly gray: number;
}
export interface RoomClearEvent {
  readonly room: number;
  readonly bonus: number;
}

/** NS4-22: Tam Ferahlık: satır temizlemesi tahtayı tamamen boşalttı (scored'dan sonra, clearstart'tan önce yayılır). */
export interface AllClearEvent {
  readonly lines: number;
  readonly bonus: number;
}

/**
 * Sıklamen çekirdeği: 'seen' çekirdekli parça kuyruktan ilk kez geldi; 'activated' kilitte yakın gri vardı (hedef sıra ve
 * çekirdek sütunu, tahta koordinatı); 'fizzled' yakın gri yoktu; 'expired' ömrü doldu; 'triggered' satır temizlemesi
 * tetikledi; 'drained' drenaj (ve varsa çökme) bitti (akan gri ve inen renkli hücre sayısı).
 */
export type CoreEvent =
  | { readonly kind: 'seen' | 'fizzled' | 'expired' | 'triggered' }
  | { readonly kind: 'activated'; readonly row: number; readonly col: number }
  | { readonly kind: 'drained'; readonly cells: number; readonly moved: number };

export interface GameEvents {
  spawn: void;
  move: void;
  rotate: void;
  hold: void;
  /** Kilitlenen 4 hücrenin tahta indeksleri. */
  lock: readonly number[];
  /** Hard drop mesafesi (satır). */
  harddrop: number;
  levelup: number;
  gameover: GameOverReason;
  clearstart: PendingClear;
  clearend: PendingClear;
  scored: ScoredEvent;
  powerdone: PowerDoneEvent;
  roomstart: RoomStartEvent;
  roomclear: RoomClearEvent;
  allclear: AllClearEvent;
  core: CoreEvent;
}

export type GameEventName = keyof GameEvents;
/** Payload'ı olmayan olaylar argümansız emit edilir ve dinlenir. */
export type GameEventArgs<K extends GameEventName> = [GameEvents[K]] extends [void] ? [] : [payload: GameEvents[K]];
export type GameEventListener<K extends GameEventName> = (...args: GameEventArgs<K>) => void;
