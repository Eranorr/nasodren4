/* =====================================================================
   Çok oyunculu ileti protokolü (Realtime Broadcast, olay adı 'msg').
   Her ileti imzalı bir zarftır:
     { v, room, round, player, seq, type, payload, sig }
   - v: protokol sürümü; room: oda kimliği; round: tur kimliği (her turda yeni);
     player: gönderen üye; seq: gönderenin artan sıra numarası;
     type: start | st | fin | away; payload: türe özgü alanlar.
   - sig: gönderenin oda anahtarıyla (sunucuya kayıtlı açık anahtar) imza.
   Doğrulama: boyut sınırı, tam alan kümesi (fazla/eksik alan reddedilir),
   bilinmeyen tür yok, sayısal aralıklar. İmza, sıra ve tur denetimi net.ts'te.
   ===================================================================== */
import { COLS, VIS } from '../config/gameConfig';
import { GAME_RULES, SCORE_LIMITS } from '../../supabase/functions/_shared/scoreRules.ts';
import { SIG_RE } from '../../supabase/functions/_shared/sign.ts';

export const PROTOCOL_VERSION = 1;
/** Zarfın en büyük JSON boyutu (karakter). Canlı durum ~450 karakterdir. */
export const MAX_ENVELOPE_CHARS = 1024;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BOARD_RE = new RegExp(`^[0-8]{${VIS * COLS}}$`);
/** Tur öncesi (lobide) gönderilen iletilerin tur kimliği. */
export const NO_ROUND = '';

export interface StartPayload {
  /** Tur sırası (gösterim). */
  readonly n: number;
  readonly seed: number;
  /** Geri sayım (ms). */
  readonly in: number;
  /** Turu oynayan üyeler (katılış sırasıyla). */
  readonly ids: readonly string[];
}
export interface StatePayload {
  /** Görünür tahta + düşen parça (VIS×COLS hücre, '0'..'8'). */
  readonly b: string;
  readonly s: number;
  readonly l: number;
  readonly lv: number;
  /** Oda (0..4; 4 = serbest nefes). */
  readonly r: number;
}
export interface FinPayload {
  readonly s: number;
  readonly l: number;
  readonly lv: number;
}
export interface AwayPayload {
  readonly on: boolean;
}
export interface Payloads {
  readonly start: StartPayload;
  readonly st: StatePayload;
  readonly fin: FinPayload;
  readonly away: AwayPayload;
}
export type EventType = keyof Payloads;

export type Envelope<T extends EventType = EventType> = {
  [K in T]: {
    readonly v: typeof PROTOCOL_VERSION;
    readonly room: string;
    readonly round: string;
    readonly player: string;
    readonly seq: number;
    readonly type: K;
    readonly payload: Payloads[K];
    readonly sig: string;
  };
}[T];
export type Unsigned<T extends EventType = EventType> = T extends EventType ? Omit<Envelope<T>, 'sig'> : never;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const exact = (o: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(o).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
const int = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Yükü şemaya göre doğrular; geçerliyse kanonik (alan sırası sabit) kopyasını döner. */
export function validatePayload<T extends EventType>(type: T, raw: unknown): Payloads[T] | null;
export function validatePayload(type: EventType, raw: unknown): Payloads[EventType] | null {
  if (!isObj(raw)) return null;
  switch (type) {
    case 'start': {
      if (!exact(raw, ['n', 'seed', 'in', 'ids'])) return null;
      const ids = raw['ids'];
      if (!int(raw['n'], 1, 9999) || !int(raw['seed'], 0, 2 ** 31 - 1) || !int(raw['in'], 0, 10000)) return null;
      if (!Array.isArray(ids) || ids.length < 2 || ids.length > 3) return null;
      if (!ids.every((x) => typeof x === 'string' && UUID_RE.test(x)) || new Set(ids).size !== ids.length) return null;
      return { n: raw['n'], seed: raw['seed'], in: raw['in'], ids: ids as string[] };
    }
    case 'st': {
      if (!exact(raw, ['b', 's', 'l', 'lv', 'r'])) return null;
      const b = raw['b'];
      if (typeof b !== 'string' || !BOARD_RE.test(b)) return null;
      if (!int(raw['s'], 0, SCORE_LIMITS.maxScore) || !int(raw['l'], 0, SCORE_LIMITS.maxLines)) return null;
      if (!int(raw['lv'], 1, GAME_RULES.maxLevel) || !int(raw['r'], 0, GAME_RULES.rooms)) return null;
      return { b, s: raw['s'], l: raw['l'], lv: raw['lv'], r: raw['r'] };
    }
    case 'fin': {
      if (!exact(raw, ['s', 'l', 'lv'])) return null;
      if (!int(raw['s'], 0, SCORE_LIMITS.maxScore) || !int(raw['l'], 0, SCORE_LIMITS.maxLines)) return null;
      if (!int(raw['lv'], 1, GAME_RULES.maxLevel)) return null;
      return { s: raw['s'], l: raw['l'], lv: raw['lv'] };
    }
    case 'away':
      if (!exact(raw, ['on']) || typeof raw['on'] !== 'boolean') return null;
      return { on: raw['on'] };
  }
}

const TYPES: readonly EventType[] = ['start', 'st', 'fin', 'away'];

/** Ham Broadcast yükünü doğrular (boyut, alanlar, türler); imza burada denetlenmez. */
export function parseEnvelope(raw: unknown): Envelope | null {
  if (!isObj(raw)) return null;
  let size: number;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return null;
  }
  if (size > MAX_ENVELOPE_CHARS) return null;
  if (!exact(raw, ['v', 'room', 'round', 'player', 'seq', 'type', 'payload', 'sig'])) return null;
  const { v, room, round, player, seq, type, sig } = raw;
  if (v !== PROTOCOL_VERSION || typeof type !== 'string' || !TYPES.includes(type as EventType)) return null;
  if (typeof room !== 'string' || !UUID_RE.test(room) || typeof player !== 'string' || !UUID_RE.test(player))
    return null;
  if (typeof round !== 'string' || (round !== NO_ROUND && !UUID_RE.test(round))) return null;
  if (!int(seq, 1, Number.MAX_SAFE_INTEGER) || typeof sig !== 'string' || !SIG_RE.test(sig)) return null;
  const payload = validatePayload(type as EventType, raw['payload']);
  if (!payload) return null;
  // alanlar yukarıda tek tek doğrulandı; tür / yük eşleşmesi validatePayload(type) ile sağlanır
  const env: unknown = { v, room, round, player, seq, type, payload, sig };
  return env as Envelope;
}

/** İmzalanan metin: alan sırası sabit, yük kanonik. */
export function signedText(e: Unsigned): string {
  const p = validatePayload(e.type, e.payload);
  return JSON.stringify([e.v, e.room, e.round, e.player, e.seq, e.type, p]);
}
