/* =====================================================================
   NS4-18: skor ve takma ad doğrulama kuralları (tek kaynak).
   Hem tarayıcı (src/leaderboard) hem Supabase Edge Function (submit-score)
   bu dosyayı kullanır; içe aktarma yoktur, yalnızca standart JS (Deno ve
   tarayıcıda aynı çalışır). Sınırlar oyunun sabitlerinden türetilir
   (src/config/gameConfig.ts; tutarlılık testle denetlenir).

   ÖNEMLİ: Bu kontroller makullük (sanity) sınırıdır, hile önleme değildir.
   Oyunda seed/replay kaydı olmadığından sunucu skoru yeniden üretemez;
   değiştirilmiş bir istemci sınırlar içinde kalan sahte skor gönderebilir.
   ===================================================================== */

/** Takma ad uzunluğu (Unicode kod noktası, boşluk temizlendikten sonra). */
export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;

/** Oyun sabitleri (src/config/gameConfig.ts ile aynı olmalı; tests/leaderboard testleri denetler). */
export const GAME_RULES = {
  maxLevel: 20,
  linesPerLevel: 10,
  /** Bir temizleme animasyonu (sn) ve tek seferde en çok satır. */
  lineClearSeconds: 0.3,
  maxLinesPerClear: 4,
  /** Sıklamen ×2 çarpanı ve tek kullanımlık drenajın satır başı bonusu (150 × satır × seviye, en çok 20 satır). */
  cycMult: 2,
  cycBonusPerRow: 150,
  cycMaxRows: 20,
  /** NS4-24: Hapşırık (sentetik açıcının yerine): 50 × satır × seviye, 3 üst sıra (gameConfig sneezeRows). */
  sneezeBonusPerRow: 50,
  sneezeRows: 3,
  /** NS4-27: Sinüs Odaları: oda bonusu 1000 × oda sırası × seviye, 4 oda (en çok 1000 × (1+2+3+4) × seviye). */
  roomBonus: 1000,
  rooms: 4,
  /** Hard drop: satır başına 2 puan, en çok 22 satır. */
  hardDropPerRow: 2,
  boardRows: 22,
} as const;

/** Sınır değerleri: absürt değerler reddedilir. */
export const SCORE_LIMITS = {
  maxScore: 10_000_000,
  maxLines: 5_000,
  minDurationSeconds: 1,
  maxDurationSeconds: 6 * 60 * 60,
  /** İnsan için cömert üst sınır: saniyede en çok 10 parça. */
  maxPiecesPerSecond: 10,
} as const;

export const CLIENT_VERSION_MAX = 32;

export type NicknameError = 'type' | 'short' | 'long' | 'chars';
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Boşlukları temizler: NFC, baş/son boşluk atılır, iç boşluk dizileri tek boşluğa iner. */
export function normalizeNickname(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/**
 * İzin verilen: Unicode harf ve rakam, iç kısımda tek boşluk, `-`, `_`, `.`. Harf/rakamla başlar ve biter.
 * Reddedilen: kontrol karakterleri, HTML/özel işaretler (< > & " ' / \ vb.), görünmez/biçim karakterleri
 * (sıfır genişlikli boşluk, yön işaretleri; Unicode Cf), birleşen işaretler (Mn/Me; "zalgo"), emoji.
 */
const NICK_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N} _.-]*[\p{L}\p{N}])?$/u;
const FORBIDDEN_RE = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{M}]/u;

export function validateNickname(raw: unknown): Result<string, NicknameError> {
  if (typeof raw !== 'string') return { ok: false, error: 'type' };
  // yalnızca normal boşluk muaf; sekme, satır sonu vb. kontrol karakteridir
  if (FORBIDDEN_RE.test(raw.replace(/ /g, ''))) return { ok: false, error: 'chars' };
  const v = normalizeNickname(raw);
  const len = [...v].length;
  if (len < NICKNAME_MIN) return { ok: false, error: 'short' };
  if (len > NICKNAME_MAX) return { ok: false, error: 'long' };
  if (!NICK_RE.test(v) || / {2}/.test(v)) return { ok: false, error: 'chars' };
  return { ok: true, value: v };
}

/** Oyunda seviye satırdan belirlenir: min(20, 1 + floor(satır / 10)). */
export function expectedLevel(lines: number): number {
  return Math.min(GAME_RULES.maxLevel, 1 + Math.floor(lines / GAME_RULES.linesPerLevel));
}

/** Satırların temizlenmesi için gereken en kısa süre (sn): her temizleme en çok 4 satır, 0,3 sn. */
export function minDurationForLines(lines: number): number {
  return Math.ceil(lines / GAME_RULES.maxLinesPerClear) * GAME_RULES.lineClearSeconds;
}

/**
 * Cömert puan üst sınırı (oyunun puan kurallarından; ulaşılması fiilen imkânsız en kötü durum).
 * Satır başına en yüksek taban T-spin tekli (800) × seviye × art arda 1,5 × sıklamen 2; kombo terimi en çok
 * 50 × kombo × seviye × 2 her temizlemede; parça başına T-spin (satırsız, 400) + hard drop + hapşırık bonusu (gerçekte 20 parçada bir;
 * cömert kalsın diye her parçada sayılır);
 * tek seferlik sıklamen drenajı; dört oda bonusu (NS4-27). Seviye son seviyedir (seviye yalnızca artar).
 */
export function maxPlausibleScore(lines: number, level: number, durationSeconds: number): number {
  const R = GAME_RULES;
  const pieces = Math.ceil(durationSeconds * SCORE_LIMITS.maxPiecesPerSecond);
  const linePts = lines * 800 * level * 1.5 * R.cycMult;
  const comboPts = ((50 * level * lines * (lines + 1)) / 2) * R.cycMult;
  const piecePts =
    pieces * (400 * level * R.cycMult + R.hardDropPerRow * R.boardRows + R.sneezeBonusPerRow * R.sneezeRows * level);
  const cycPts = R.cycBonusPerRow * R.cycMaxRows * level;
  const roomPts = ((R.roomBonus * R.rooms * (R.rooms + 1)) / 2) * level;
  return Math.min(SCORE_LIMITS.maxScore, Math.floor(linePts + comboPts + piecePts + cycPts + roomPts));
}

/** Global gönderim gövdesi (istemci → Edge Function). */
export interface ScorePayload {
  /** Oyun başına istemcide üretilen rastgele UUID (tekrar gönderimi engeller; sunucuda tuzlu özeti saklanır). */
  readonly gameId: string;
  readonly nickname: string;
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly durationSeconds: number;
  readonly clientVersion: string;
}
export type PayloadError =
  | 'body'
  | 'fields'
  | 'gameId'
  | 'nickname'
  | 'score'
  | 'lines'
  | 'level'
  | 'durationSeconds'
  | 'clientVersion'
  | 'implausible';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION_RE = /^[a-z0-9][a-z0-9._-]*$/;
const FIELDS = ['gameId', 'nickname', 'score', 'lines', 'level', 'durationSeconds', 'clientVersion'] as const;

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Gövdeyi tam olarak doğrular: beklenmeyen alan yok, tamsayılar sonlu ve aralıkta, seviye satırla tutarlı. */
export function validateScorePayload(raw: unknown): Result<ScorePayload, PayloadError> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'body' };
  const keys = Object.keys(raw);
  if (keys.length !== FIELDS.length || !FIELDS.every((k) => keys.includes(k))) return { ok: false, error: 'fields' };
  const r = raw as Record<(typeof FIELDS)[number], unknown>;
  if (typeof r.gameId !== 'string' || !UUID_RE.test(r.gameId)) return { ok: false, error: 'gameId' };
  const nick = validateNickname(r.nickname);
  if (!nick.ok) return { ok: false, error: 'nickname' };
  if (!isInt(r.score, 0, SCORE_LIMITS.maxScore)) return { ok: false, error: 'score' };
  if (!isInt(r.lines, 0, SCORE_LIMITS.maxLines)) return { ok: false, error: 'lines' };
  if (!isInt(r.level, 1, GAME_RULES.maxLevel)) return { ok: false, error: 'level' };
  if (!isInt(r.durationSeconds, SCORE_LIMITS.minDurationSeconds, SCORE_LIMITS.maxDurationSeconds))
    return { ok: false, error: 'durationSeconds' };
  if (
    typeof r.clientVersion !== 'string' ||
    r.clientVersion.length > CLIENT_VERSION_MAX ||
    !VERSION_RE.test(r.clientVersion)
  )
    return { ok: false, error: 'clientVersion' };
  if (
    r.level !== expectedLevel(r.lines) ||
    r.durationSeconds < minDurationForLines(r.lines) ||
    r.score > maxPlausibleScore(r.lines, r.level, r.durationSeconds)
  )
    return { ok: false, error: 'implausible' };
  return {
    ok: true,
    value: {
      gameId: r.gameId,
      nickname: nick.value,
      score: r.score,
      lines: r.lines,
      level: r.level,
      durationSeconds: r.durationSeconds,
      clientVersion: r.clientVersion,
    },
  };
}
