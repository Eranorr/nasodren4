/* =====================================================================
   tetris-submit-score Edge Function çekirdeği (Deno'ya özgü API yok).
   index.ts bunu Deno.serve ile çalıştırır; testler Node'da (Vitest) aynı
   işleyiciyi sahte veritabanıyla çağırır.

   Akış: CORS/Origin → yöntem (yalnızca POST) → Content-Type → gövde boyutu →
   JSON → alan doğrulama + makullük sınırları + kural seti → hız sınırı →
   oyun kimliğinin tuzlu özeti → tek INSERT (benzersiz özet tekrarı engeller)
   → tablodaki sıra. Hata yanıtları yalnızca kısa bir kod içerir.

   Tarayıcı tabloya yazamaz (anon/authenticated yetkisi yok); yazma yalnızca
   bu işlevin service role bağlantısıyla yapılır.

   SINIR: Oyunda sunucunun yeniden oynatabileceği seed/replay kaydı yoktur.
   Buradaki kontroller makullük sınırıdır, hile önleme değildir: değiştirilmiş
   bir istemci sınırlar içinde kalan sahte skor gönderebilir.
   ===================================================================== */
import { validateScorePayload } from '../_shared/scoreRules.ts';
import { clientAddress, readJsonRequest, sha256Hex, type RateLimiter } from '../_shared/http.ts';

/** Kabul edilen en büyük gövde (bayt). Geçerli bir gönderim ~250 bayttır. */
export const MAX_BODY_BYTES = 2048;
/** Hız sınırı: adres başına dakikada 6, saatte 60 gönderim. */
export const RATE = { minute: 6, hour: 60 } as const;

export interface ScoreRow {
  readonly name: string;
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly duration_seconds: number;
  readonly game_hash: string;
  readonly client_version: string;
  readonly ruleset: string;
}
export type InsertResult = { readonly status: 'ok'; readonly id: number } | { readonly status: 'duplicate' | 'error' };

export interface SubmitDeps {
  /** Ortam değişkeni okuyucu (Deno.env.get). */
  readonly env: (name: string) => string | undefined;
  readonly insert: (row: ScoreRow) => Promise<InsertResult>;
  /** Kural setinde sıra: daha yüksek skorlar + eşit skorda önce kaydedilenler + 1 (bilinmiyorsa null). */
  readonly rank: (ruleset: string, score: number, id: number) => Promise<number | null>;
  readonly limiter: RateLimiter;
}

export async function handleSubmit(req: Request, deps: SubmitDeps): Promise<Response> {
  const r = await readJsonRequest(req, deps.env('ALLOWED_ORIGINS'), MAX_BODY_BYTES);
  if (r instanceof Response) return r;
  const { body, reply } = r;
  const v = validateScorePayload(body);
  if (!v.ok) return reply.fail('invalid');

  const pepper = deps.env('SCORE_HASH_PEPPER') ?? '';
  const ip = await sha256Hex(`rate:${pepper}:${clientAddress(req)}`);
  try {
    if (
      !(await deps.limiter.allow(ip, 'submit-m', RATE.minute, 60)) ||
      !(await deps.limiter.allow(ip, 'submit-h', RATE.hour, 3600))
    )
      return reply.fail('rate_limited');
  } catch {
    return reply.fail('server');
  }

  const p = v.value;
  let result: InsertResult;
  try {
    result = await deps.insert({
      name: p.nickname,
      score: p.score,
      lines: p.lines,
      level: p.level,
      duration_seconds: p.durationSeconds,
      game_hash: await sha256Hex(`game:${pepper}:${p.gameId}`),
      client_version: p.clientVersion,
      ruleset: p.ruleset,
    });
  } catch {
    result = { status: 'error' };
  }
  if (result.status === 'duplicate') return reply.fail('duplicate');
  if (result.status !== 'ok') return reply.fail('server');
  let rank: number | null = null;
  try {
    rank = await deps.rank(p.ruleset, p.score, result.id);
  } catch {
    /* sıra bilinmiyor; skor kaydedildi */
  }
  return reply.ok(201, { ok: true, id: result.id, rank });
}
