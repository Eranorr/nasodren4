/* =====================================================================
   tetris-submit-score Edge Function giriş noktası (Deno / Supabase).
   Secret'lar yalnızca function ortamındadır:
   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: Supabase tarafından otomatik verilir.
   - SCORE_HASH_PEPPER: panelde Edge Functions → Secrets (oyun kimliği ve hız sınırı özetleri için tuz).
   - ALLOWED_ORIGINS: virgülle ayrılmış izinli origin listesi (ör. https://site.pages.dev,http://localhost:5173).
   Kurulum: docs/MULTIPLAYER.md
   ===================================================================== */
import { createDb } from '../_shared/db.ts';
import { handleSubmit, type InsertResult, type ScoreRow } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

const db = createDb(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

/** Tek satır INSERT. 409 = benzersiz game_hash ihlali (aynı oyun ikinci kez). */
async function insert(row: ScoreRow): Promise<InsertResult> {
  const res = await db.rest('tetris_scores?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (res.status === 409) return { status: 'duplicate' };
  if (res.status !== 201) return { status: 'error' };
  const rows = (await res.json()) as { id?: unknown }[];
  const id = rows[0]?.id;
  return typeof id === 'number' ? { status: 'ok', id } : { status: 'error' };
}

const rank = (ruleset: string, score: number, id: number) =>
  db.rpc<number | null>('tetris_score_rank', { p_ruleset: ruleset, p_score: score, p_id: id });

Deno.serve((req) => handleSubmit(req, { env: (k) => Deno.env.get(k), insert, rank, limiter: db.limiter }));
