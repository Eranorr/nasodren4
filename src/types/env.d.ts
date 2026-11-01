// Vite ortam değişkenleri (yalnızca VITE_ önekliler pakete girer). Ayrıntı: .env.local.example
interface ImportMetaEnv {
  /** Supabase proje URL'si (https://<ref>.supabase.co). Boşsa global skor ve çok oyunculu kapalıdır. */
  readonly VITE_SUPABASE_URL?: string;
  /** Publishable (sb_publishable_…) anahtar; tarayıcıya gömülmesi güvenlidir. Service role / secret ASLA. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Geçici uyumluluk (eski ad); yalnızca PUBLISHABLE tanımlı değilse okunur. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
