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

export interface PowerDoneEvent {
  readonly kind: 'sneeze';
  readonly n: number;
}

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
  | { readonly kind: 'drained'; readonly cells: number; readonly moved: number; readonly power: boolean };

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
  /** Sıklamen gücü kullanıldı: aktif çekirdek vardı (hizasından) ya da yoktu (en alttaki gri sıralar). */
  cyclamen: { readonly core: boolean };
  /** Sinüzit Atağı tetiklendi (satır eklenmeden önce; taşma olursa ardından gameover gelir). */
  attackstart: void;
  /** Sinüzit Atağı satırı eklendi (alttan gelen satırın boşluk sütunu, alt bölgeye dağılan gri sayısı). */
  attack: { readonly hole: number; readonly scattered: number };
  /** Atak grisi içeren tam satırlar silindi (puansız; satır sayısı ve içlerindeki atak grisi). */
  attackline: { readonly rows: number; readonly cells: number };
  /** Spray kullanıldı (silinecek atak grisi indeksleri). */
  spray: { readonly cells: readonly number[] };
  /** Spray durumu değişti: doluyor, hazır ya da dolu ama hedefsiz (atak grisi yok). */
  spraystate: 'charging' | 'ready' | 'notarget';
}

export type GameEventName = keyof GameEvents;
/** Payload'ı olmayan olaylar argümansız emit edilir ve dinlenir. */
export type GameEventArgs<K extends GameEventName> = [GameEvents[K]] extends [void] ? [] : [payload: GameEvents[K]];
export type GameEventListener<K extends GameEventName> = (...args: GameEventArgs<K>) => void;
