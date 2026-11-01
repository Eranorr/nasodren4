/* =====================================================================
   Edge Function ortak HTTP katmanı (Deno'ya özgü API yok; Vitest'te de çalışır).
   CORS/Origin → yöntem → Content-Type → gövde boyutu → JSON. Hata yanıtları
   yalnızca kısa bir kod içerir; iç ayrıntı, yığın izi veya secret dönmez.
   ===================================================================== */

export type ErrorCode =
  | 'method'
  | 'origin'
  | 'content_type'
  | 'too_large'
  | 'json'
  | 'invalid'
  | 'rate_limited'
  | 'duplicate'
  | 'not_found'
  | 'full'
  | 'forbidden'
  | 'server';
const STATUS: Readonly<Record<ErrorCode, number>> = {
  method: 405,
  origin: 403,
  content_type: 415,
  too_large: 413,
  json: 400,
  invalid: 422,
  rate_limited: 429,
  duplicate: 409,
  not_found: 404,
  full: 409,
  forbidden: 403,
  server: 500,
};

/**
 * Hız sınırı. `key` istemci adresinin tuzlu özetidir (ham adres saklanmaz). Kalıcı uygulama veritabanındaki
 * sabit pencere sayacıdır (public.tetris_rate_hit); testlerde bellek içi.
 */
export interface RateLimiter {
  allow(key: string, bucket: string, max: number, windowSeconds: number): Promise<boolean>;
}

/** Bellek içi sabit pencere (testler; tek işlev örneği). */
export function memoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number>();
  return {
    allow(key, bucket, max, windowSeconds) {
      const w = Math.floor(now() / 1000 / windowSeconds);
      const k = `${bucket}:${key}:${w}`;
      const n = (hits.get(k) ?? 0) + 1;
      hits.set(k, n);
      if (hits.size > 10_000) hits.delete(hits.keys().next().value as string);
      return Promise.resolve(n <= max);
    },
  };
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** ALLOWED_ORIGINS: virgülle ayrılmış tam origin listesi. Boş/tanımsız: her origin (yalnızca geliştirme). */
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

/** İstemci adresi (yalnızca hız sınırı anahtarı için; tuzlanıp özetlenir, saklanmaz). */
export function clientAddress(req: Request): string {
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

export interface Reply {
  readonly ok: (status: number, body: Record<string, unknown>) => Response;
  readonly fail: (code: ErrorCode) => Response;
}

/**
 * Ortak giriş: origin, OPTIONS, POST, JSON gövde (en çok `maxBytes`). Geçerse gövde ve yanıt üreticileri,
 * geçmezse hazır hata yanıtı döner.
 */
export async function readJsonRequest(
  req: Request,
  allowed: string | undefined,
  maxBytes: number,
): Promise<{ readonly body: unknown; readonly reply: Reply } | Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, allowed);
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  const reply: Reply = { ok: json, fail: (code) => json(STATUS[code], { ok: false, error: code }) };
  if (!originAllowed(origin, allowed)) return reply.fail('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply.fail('method');
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!/^application\/json(\s*;|$)/.test(ct)) return reply.fail('content_type');
  const text = await readLimited(req, maxBytes);
  if (text === null) return reply.fail('too_large');
  try {
    return { body: JSON.parse(text) as unknown, reply };
  } catch {
    return reply.fail('json');
  }
}
