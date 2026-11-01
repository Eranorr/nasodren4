/* =====================================================================
   Supabase istemcisi (yalnızca çok oyunculu Realtime). SDK ilk yüklemede
   gelmez: "Çok oyunculu" ilk kez açılınca dinamik import ile ayrı bir parça
   olarak yüklenir. Skor tablosu SDK kullanmaz (leaderboard/globalClient.ts).
   Yapılandırma yoksa ya da parça yüklenemezse null: tek oyunculu oyun ve
   yerel skorlar etkilenmez.
   ===================================================================== */
import type { SupabaseClient } from '@supabase/supabase-js';
import { leaderboardConfig } from './leaderboard/config';

export const SUPABASE_OK = leaderboardConfig !== null;
if (!SUPABASE_OK && import.meta.env.DEV)
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY yok: skor tablosu yerel, çok oyunculu kapalı.',
  );

let pending: Promise<SupabaseClient | null> | null = null;
/** İstemciyi bir kez yükler; başarısızsa sonraki çağrı yeniden dener. */
export function loadSupabase(): Promise<SupabaseClient | null> {
  const cfg = leaderboardConfig;
  if (!cfg) return Promise.resolve(null);
  pending ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(cfg.url, cfg.key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } },
      }),
    )
    .catch(() => {
      pending = null;
      return null;
    });
  return pending;
}
