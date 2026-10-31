/* =====================================================================
   NS4-18: submit-score Edge Function çekirdeği (Deno'ya özgü API yok).
   index.ts bunu Deno.serve ile çalıştırır; testler Node'da (Vitest) aynı
   işleyiciyi sahte veritabanı yazıcısıyla çağırır.

   Akış: CORS/Origin → yöntem (yalnızca POST) → Content-Type → gövde boyutu →
   JSON → alan doğrulama + makullük sınırları → hız sınırı → oyun kimliğinin
   tuzlu özeti → tek INSERT (benzersiz özet tekrarı engeller).
   Hata yanıtları yalnızca kısa bir kod içerir; iç ayrıntı veya secret dönmez.
   ===================================================================== */
import { validateScorePayload, type PayloadError } from '../_shared/scoreRules.ts';

/** Kabul edilen en büyük gövde (bayt). Geçerli bir gönderim ~200 bayttır. */
export const MAX_BODY_BYTES = 2048;

export interface ScoreRow {
  readonly nickname: string;
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly duration_seconds: number;
  readonly game_hash: string;
  readonly client_version: string;
  /** Kural seti (doğrulamada yalnızca güncel RULESET kabul edilir). */
  readonly ruleset: string;
}
export type InsertResult = 'ok' | 'duplicate' | 'error';

/** Hız sınırı entegrasyon noktası. Varsayılan: işlev örneği başına bellek içi kayan pencere (en iyi çaba). */
export interface RateLimiter {
  /** true: izin ver. `key` istemci adresinin tuzlu özetidir; ham adres saklanmaz. */
  allow(key: string, nowMs: number): boolean | Promise<boolean>;
}

export interface HandlerDeps {
  /** Ortam değişkeni okuyucu (Deno.env.get). */
  readonly env: (name: string) => string | undefined;
  readonly insert: (row: ScoreRow) => Promise<InsertResult>;
  readonly limiter: RateLimiter;
  readonly now?: () => number;
}

/** Bellek içi kayan pencere: anahtar başına `max` istek / `windowMs`. Soğuk başlatmada sıfırlanır. */
export function memoryRateLimiter(max = 6, windowMs = 60_000, maxKeys = 10_000): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    allow(key, now) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value as string); // en eski anahtar
      return true;
    },
  };
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** ALLOWED_ORIGINS: virgülle ayrılmış tam origin listesi. Boş/tanımsız: her origin (geliştirme). */
export function originAllowed(origin: string | null, allowed: string | undefined): boolean {
  const list = (allowed ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0 || list.includes('*')) return true;
  return origin !== null && list.includes(origin);
}

function corsHeaders(origin: string | null, allowed: string | undefined): Record<string, string> {
  const open = (allowed ?? '').trim() === '' || (allowed ?? '').includes('*');
  return {
    'Access-Control-Allow-Origin': open ? '*' : (origin ?? 'null'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export type ErrorCode =
  'method' | 'origin' | 'content_type' | 'too_large' | 'json' | 'invalid' | 'rate_limited' | 'duplicate' | 'server';
const STATUS: Record<ErrorCode, number> = {
  method: 405,
  origin: 403,
  content_type: 415,
  too_large: 413,
  json: 400,
  invalid: 422,
  rate_limited: 429,
  duplicate: 409,
  server: 500,
};

/** İstemci adresi (yalnızca hız sınırı anahtarı için, tuzlanıp özetlenir; saklanmaz). */
function clientAddress(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  return (xff ? xff.split(',')[0] : req.headers.get('cf-connecting-ip'))?.trim() || 'unknown';
}

/** Gövdeyi en çok `limit` bayt okur; aşarsa null (akış iptal edilir). */
async function readLimited(req: Request, limit: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function handleSubmit(req: Request, deps: HandlerDeps): Promise<Response> {
  const allowed = deps.env('ALLOWED_ORIGINS');
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, allowed);
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  const fail = (code: ErrorCode, extra: Record<string, unknown> = {}) =>
    json(STATUS[code], { ok: false, error: code, ...extra });

  if (!originAllowed(origin, allowed)) return fail('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail('method');
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!/^application\/json(\s*;|$)/.test(ct)) return fail('content_type');
  const text = await readLimited(req, MAX_BODY_BYTES);
  if (text === null) return fail('too_large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('json');
  }
  const v = validateScorePayload(raw);
  if (!v.ok) return fail('invalid', { field: v.error satisfies PayloadError });

  const pepper = deps.env('SCORE_HASH_PEPPER') ?? '';
  const now = (deps.now ?? Date.now)();
  const rateKey = await sha256Hex(`rate:${pepper}:${clientAddress(req)}`);
  if (!(await deps.limiter.allow(rateKey, now))) return fail('rate_limited');

  const p = v.value;
  let result: InsertResult;
  try {
    result = await deps.insert({
      nickname: p.nickname,
      score: p.score,
      lines: p.lines,
      level: p.level,
      duration_seconds: p.durationSeconds,
      game_hash: await sha256Hex(`game:${pepper}:${p.gameId}`),
      client_version: p.clientVersion,
      ruleset: p.ruleset,
    });
  } catch {
    result = 'error';
  }
  if (result === 'duplicate') return fail('duplicate');
  if (result !== 'ok') return fail('server');
  return json(201, { ok: true });
}
