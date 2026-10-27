// Analitik olay adları, payload'ları ve CTA yerleşimleri. Gönderimde olay adına 'fn_' öneki eklenir.
// Bu değerler raporlama sözleşmesinin parçasıdır: mevcut olayların alanları çıkarılmamalı, adı değiştirilmemelidir.
// NS4-19: huni olayları eklendi; cta_click'e oyun durumu bağlamı eklendi (yerleşim değerleri aynı).
// GİZLİLİK: hiçbir payload takma ad, anahtar, URL, IP, user-agent veya başka kişisel/serbest metin taşımaz;
// yalnızca sayılar, boolean'lar ve aşağıda tanımlı sabit kod değerleri kullanılır.
import type { AppState } from './app';
import type { BadgeId } from './content';
import type { GameOverReason } from './game';
import type { InputMode, TutorialStep } from '../tutorial/steps';

/** utm_content değeri olarak kullanılır. */
export type CtaPlacement = 'game_over' | 'pause_menu';

/** Payload'ı olmayan olaylar. */
export type NoPayload = Record<string, never>;

/** Global skor gönderimi başarısızlık kodları (kısa, önceden tanımlı; sunucu mesajı taşınmaz). */
export type SubmitFailCode =
  'nickname' | 'duplicate' | 'rejected' | 'rate_limited' | 'offline' | 'timeout' | 'server' | 'disabled';

export type LeaderboardTab = 'local' | 'global';

export interface AnalyticsPayloads {
  // ---- NS4-01..NS4-18 (korunur) ----
  game_start: { best: number };
  powerup_use:
    { kind: 'siklamen'; level: number; congestion: number } | { kind: 'hapsirik'; uses: number; level: number };
  level_up: { level: number };
  badge: { id: BadgeId };
  game_over: {
    reason: GameOverReason;
    score: number;
    level: number;
    lines: number;
    dur_s: number;
    cyc_used: boolean;
    sneeze_uses: number;
    rooms_cleared: number;
    tetrises: number;
    /** NS4-22: Tam Ferahlık sayısı. */
    all_clears: number;
  };
  cta_click:
    | { placement: 'game_over'; score: number; state: AppState }
    | { placement: 'pause_menu'; level: number; state: AppState };

  // ---- NS4-19: huni ----
  /** Sayfa ve oyun hazır (bir kez / sayfa yüklemesi). */
  game_loaded: { global_scores: boolean; tutorial_done: boolean };
  tutorial_started: { step: number; resumed: boolean; mode: InputMode };
  /** Bir öğretici adımı tamamlandı (1 tabanlı sıra). */
  tutorial_step: { step: number; id: TutorialStep };
  tutorial_completed: { via: 'clear' | 'ack' };
  tutorial_skipped: { step: number };
  /** Oyundaki ilk satır temizleme (oyun başına bir kez). */
  first_drain: { lines: number; level: number; dur_s: number };
  /** Güçlendirici ilk kez kullanılabilir oldu (oyun başına bir kez). */
  cyclamen_available: { level: number; congestion: number };
  /** NS4-24: sentetik açıcı (synthetic_available, rebound_started) yerine hapşırık. */
  sneeze_available: { level: number; congestion: number };
  /** NS4-27: odaya girildi (room: 0 tabanlı; ROOMS.length = Serbest nefes) ve oda açıldı. */
  room_start: { room: number; gray: number };
  room_clear: { room: number; level: number; dur_s: number; bonus: number };
  /** NS4-31: dört sinüs açıldı; final ekranında seçim (Serbest nefese devam / bitir). */
  final_choice: { choice: 'continue' | 'finish'; dur_s: number };
  /** NS4-22: Tam Ferahlık: satır temizlemesi tahtayı tamamen boşalttı. */
  all_clear: { lines: number; level: number; bonus: number };
  /** Oyun sonu "Tekrar oyna". */
  replay_clicked: NoPayload;
  leaderboard_opened: NoPayload;
  leaderboard_tab_changed: { tab: LeaderboardTab };
  leaderboard_refreshed: { action: 'refresh' | 'retry' };
  score_submit_started: NoPayload;
  score_submit_succeeded: NoPayload;
  score_submit_failed: { code: SubmitFailCode };
}

export type AnalyticsEvent = keyof AnalyticsPayloads;

/**
 * dataLayer'a gönderilen kayıt. `sid`: sayfa yüklemesi başına bellekte üretilen, kriptografik olmayan kısa
 * oturum kimliği (saklanmaz; yenilemede değişir). `seq`: oturumdaki olay sırası.
 */
export type AnalyticsRecord<K extends AnalyticsEvent = AnalyticsEvent> = {
  event: `fn_${K}`;
  t: number;
  sid: string;
  seq: number;
} & AnalyticsPayloads[K];
