/* =====================================================================
   Edge Function veritabanı erişimi (PostgREST, service role). Yalnızca Deno
   giriş dosyaları (index.ts) kullanır. Service role anahtarı function
   ortamındadır (Supabase otomatik verir); tarayıcıya gönderilmez, yanıtlarda
   yer almaz.
   ===================================================================== */
import type { RateLimiter } from './http.ts';

export interface Db {
  /** PostgREST isteği (service role). */
  rest(path: string, init?: RequestInit): Promise<Response>;
  /** RPC çağrısı; hata durumunda istisna. */
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>;
  readonly limiter: RateLimiter;
}

export function createDb(url: string, serviceKey: string): Db {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  const rest = (path: string, init: RequestInit = {}) =>
    fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!url || !serviceKey) throw new Error('config');
    const res = await rest(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    // void dönen fonksiyonlar (ör. tetris_room_leave) gövdesiz 204 yanıtı verir
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }
  return {
    rest,
    rpc,
    // sabit pencere sayacı (public.tetris_rate_hit): bütün işlev örnekleri aynı sayacı görür
    limiter: {
      allow: (key, bucket, max, windowSeconds) =>
        rpc<boolean>('tetris_rate_hit', { p_key: key, p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds }),
    },
  };
}
