# NS4-18 · Supabase kurulumu (global skor tablosu)

> **Geçersiz:** Bu belgedeki NS4-18 kurulumu (`leaderboard_scores`, `submit-score`) canlıya hiç uygulanmadı ve kaldırıldı. Güncel kurulum: `docs/MULTIPLAYER.md` ve `supabase/migrations/` (önek `tetris`).

Bu rehberdeki adımları proje sahibinin yapması gerekir. Bu depoda gerçek bir Supabase projesine migration uygulanmadı ve function deploy edilmedi: bu makinede Supabase CLI ve doğrulanmış bir proje bağlantısı yoktu.

Kurulum yapılana kadar oyun ve cihazdaki yerel skor tablosu tam çalışır; global sekme ve gönderim "Global tablo çevrimdışı" görünür.

## Neler kurulacak

| Parça                    | Dosya                                                       | Görevi                                                                        |
| ------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Tablo + okuma fonksiyonu | `supabase/migrations/20261018000000_ns4_18_leaderboard.sql` | `leaderboard_scores` (RLS açık, politika yok), `get_leaderboard(limit_count)` |
| Edge Function            | `supabase/functions/submit-score/`                          | skor gönderimi (doğrulama, tekrar engeli, hız sınırı)                         |
| Function ayarı           | `supabase/config.toml`                                      | `verify_jwt = false` (hesap yok; function kendi doğrulamasını yapar)          |
| Frontend ortamı          | `.env.example` → `.env.local`                               | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`                          |

## 1. Proje ve CLI

1. <https://supabase.com/dashboard> üzerinde bir proje oluşturun. Proje ref'ini not edin (`https://<ref>.supabase.co`).
2. Supabase CLI'yı kurun (ör. `npm i -g supabase` veya `npx supabase …`), sonra:

   ```bash
   supabase login
   supabase link --project-ref <ref>
   ```

## 2. Veritabanı

```bash
supabase db push
```

Bu komut migration'ı uygular:

- `leaderboard_scores` tablosu ile kısıtlarını ve sıralama indexini oluşturur;
- RLS'yi etkinleştirip zorunlu kılar; politika eklemez;
- `anon` ve `authenticated` için tablo yetkilerini geri alır;
- `get_leaderboard` fonksiyonunu oluşturup `anon`'a yalnızca çalıştırma yetkisi verir.

Alternatif: SQL dosyasının içeriğini Dashboard → SQL Editor'da çalıştırabilirsiniz.

## 3. Function secret'ları

```bash
supabase secrets set SCORE_HASH_PEPPER=<en-az-32-karakter-rastgele-değer>
# isteğe bağlı: yalnızca oyunun yayınlandığı origin(ler)den kabul et
supabase secrets set ALLOWED_ORIGINS=https://oyun.example.com
```

- `SCORE_HASH_PEPPER`: oyun kimliğinin ve hız sınırı anahtarının özetlenmesinde kullanılan tuz. Rastgele üretin (ör. `openssl rand -hex 32`) ve hiçbir yere commit etmeyin. Sonradan değiştirilirse eski oyunların tekrar kontrolü yeni özetlerle eşleşmez.
- `ALLOWED_ORIGINS`: boşsa her origin kabul edilir (geliştirme). Yayında oyunun tam origin'i (şema + alan adı + gerekiyorsa port) yazılmalıdır.
- `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` function ortamında Supabase tarafından otomatik sağlanır. **Service role anahtarı hiçbir zaman `.env.local`'a, frontend'e veya depoya konmaz.**

## 4. Edge Function

```bash
supabase functions deploy submit-score
```

`supabase/config.toml` içindeki `verify_jwt = false` uygulanır. CLI bunu uygulamazsa `--no-verify-jwt` bayrağını ekleyin.

## 5. Frontend ortamı

Dashboard → Project Settings → API Keys bölümünden **publishable** anahtarı (`sb_publishable_…`) alın. Eski projelerde `anon` anahtarı da çalışır.

```bash
cp .env.example .env.local
# .env.local:
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

- Dev sunucusunu yeniden başlatın (`npm run dev`). Production için bu iki değişkeni build ortamında tanımlayıp `npm run build` çalıştırın.
- `.env.local` Git'e eklenmez.
- Uygulama `sb_secret_…` veya service role JWT'si verilirse bunu reddeder ve global skoru kapalı tutar.

## 6. Doğrulama

```bash
# okuma (boş tabloda [] döner)
curl "https://<ref>.supabase.co/rest/v1/rpc/get_leaderboard?limit_count=10" -H "apikey: <publishable>"

# tabloya doğrudan erişim reddedilmeli (RLS / yetki yok)
curl "https://<ref>.supabase.co/rest/v1/leaderboard_scores" -H "apikey: <publishable>"

# geçersiz gönderim 422 dönmeli
curl -X POST "https://<ref>.supabase.co/functions/v1/submit-score" \
  -H "Content-Type: application/json" -H "apikey: <publishable>" -d '{"score":-1}'
```

Ardından oyunda bir oyun bitirin:

1. Takma ad yazıp “Global tabloya gönder”e basın.
2. Ana menü → Skorlar → Global'de skorun göründüğünü kontrol edin.
3. Aynı oyunu ikinci kez göndermenin mümkün olmadığını doğrulayın; sunucu 409 döner.

## 7. Bakım ve geri alma

- Uygunsuz takma ad veya şüpheli skor: Dashboard → Table Editor ya da SQL ile satırı silin, ör. `delete from public.leaderboard_scores where id = …;`.
- Hız sınırı function örneği başına bellek içidir (en iyi çaba). Daha güçlü bir sınır için `handler.ts` içindeki `RateLimiter` arayüzüne paylaşılan bir depo (ör. bir tablo veya KV) bağlanabilir.
- **Geri alma** (bütün global veriyi siler):

  ```sql
  drop function if exists public.get_leaderboard(integer);
  drop table if exists public.leaderboard_scores;
  ```

  ```bash
  supabase functions delete submit-score
  ```

  Frontend'de `.env.local` değerlerini silmek global özelliği kapatır; yerel tablo çalışmaya devam eder.
