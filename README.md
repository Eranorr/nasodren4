# Ferah Nefes · Sinüs Bulmacası

Tarayıcıda oynanan, kısa süreli, Tetris benzeri bir bulmaca oyunu (advergame). Oyun alanı bir sinüs boşluğunu, düşen bloklar biriken tıkanıklığı temsil eder; satır temizlemek drenaj anlamına gelir.

Oyun içi metinler `index.html`, `src/content/` ve `src/ui/` içinde; CTA bağlantısı `src/config/gameConfig.ts` ve `src/analytics/cta.ts` içindedir. Sağlıkla ilgili içerik yalnızca oradan yönetilir; bu README sağlık bilgisi içermez.

## Teknoloji yığını

| Katman             | Kullanılan                                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| Build / dev server | [Vite](https://vite.dev/) 8.3.4                                             |
| Dil                | TypeScript 7.0.2 (`strict`)                                                 |
| Render             | [PixiJS](https://pixijs.com/) **7.4.2** (npm paketi, sürüm bilerek sabit)   |
| UI                 | Framework'süz HTML + CSS (DOM overlay'leri)                                 |
| Ses                | Web Audio API (sentezlenmiş; ses dosyası yok)                               |
| Kalıcılık          | `localStorage` (`fn_settings`, `fn_meta`, `fn_scores`, `fn_nickname`)       |
| Global skor        | Supabase (RPC + Edge Function; çok oyunculu: Realtime, SDK tembel yüklenir) |
| Fontlar            | Google Fonts (Fredoka, Nunito)                                              |

Runtime bağımlılıkları `pixi.js` ve `@supabase/supabase-js`'tir. Tüm sürümler `package.json` içinde tam sürüm olarak sabitlenmiştir.

## Skor tablosu ve çok oyunculu (Supabase)

Sitedeki bütün oyunlar tek bir Supabase projesini paylaşır; bu oyunun öneki `tetris`. Tarayıcı tablolara yazamaz:

- skor gönderimi `tetris-submit-score` Edge Function'ından geçer;
- okuma `tetris_get_leaderboard` RPC'si iledir;
- çok oyunculu oda üyeliği `tetris-room` Edge Function'ındadır;
- oyun iletileri imzalıdır.

Kurulum, tehdit modeli ve sınırlar: `docs/MULTIPLAYER.md`. Çok oyunculu istemci otoriteli bir eğlence modudur ve kalıcı rekabetçi sonuç üretmez; global skor doğrulaması tam anti-cheat değildir. **Yayın öncesi:** canlı site adresi belli olunca Edge Function secret'ı `ALLOWED_ORIGINS` güncellenmelidir. Migration'lar: `supabase/migrations/`. Panel için tek dosya paketleri: `node tools/bundle-functions.mjs`.

Değerler (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) `.env.production` dosyasındadır; yerelde `.env.local.example` → `.env.local`. Değerler yoksa oyun ve yerel skor listesi çalışır, global sekme "çevrimdışı" görünür ve "Çok oyunculu" gizlenir.

## Gereksinimler

- **Node.js** `^20.19.0` veya `>=22.12.0` (Vite 8 gereksinimi; geliştirme Node 22.17 ile yapıldı)
- **npm** (Node ile gelen; `package-lock.json` npm ile üretildi)

## Kurulum

```bash
npm install
```

`npm install`, `postinstall` adımında ESLint araç zincirini (`tools/eslint/`) de kurar.

## Komutlar

| Komut               | Açıklama                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run dev`       | Vite development server (varsayılan `http://localhost:5173`)             |
| `npm run typecheck` | TypeScript kontrolü (`tsc --noEmit`, çıktı üretmez)                      |
| `npm run build`     | Production build, çıktı `dist/` klasörüne                                |
| `npm run preview`   | `dist/` çıktısının yerel önizlemesi (varsayılan `http://localhost:4173`) |

### Kalite kontrolleri

| Komut                  | Açıklama                                                      |
| ---------------------- | ------------------------------------------------------------- |
| `npm run typecheck`    | TypeScript (strict + ek katılık seçenekleri)                  |
| `npm run lint`         | ESLint (type-aware, `typescript-eslint`); `lint:fix` düzeltir |
| `npm run format:check` | Prettier biçim kontrolü; `format` biçimlendirir               |
| `npm test`             | Oyun motoru testleri (Vitest, tek sefer); `test:watch` izler  |
| `npm run check`        | Sırayla typecheck → lint → format:check → test → build        |

ESLint araç zinciri `tools/eslint/` altında kendi `package.json`'ıyla durur: `typescript-eslint` henüz TypeScript 7'yi desteklemediği için lint parser'ı oradaki TypeScript 6.0.3'ü kullanır; projenin derleyicisi kökteki TypeScript 7.0.2'dir (bkz. `docs/NS4-04-TYPE-SAFETY-AND-QUALITY.md`).

`dist/` ve `node_modules/` Git'e eklenmez.

Development ortamında hata ayıklama için `window.__fn = { game, view, app }` erişilebilir. Production build'de bu global bulunmaz.

## Dizin yapısı

```
.
├── index.html            # Vite giriş belgesi (DOM, ekranlar, inline SVG ikonlar)
├── src/
│   ├── main.ts           # Giriş: CSS + bootstrap()
│   ├── styles.css        # Tüm stiller
│   ├── app/              # bootstrap, lifecycle (durum geçişleri), oyun olayı bağlantıları
│   ├── game/             # Saf oyun motoru (Game) ve parça/SRS verileri
│   ├── rendering/        # PixiJS görünümü, dokular, layout hesabı
│   ├── input/            # Klavye, dokunmatik jestler, HUD butonları
│   ├── audio/            # Web Audio ses ve müzik
│   ├── haptics/          # Titreşim desenleri
│   ├── storage/          # localStorage (fn_settings, fn_meta)
│   ├── analytics/        # Analitik olayları ve CTA/UTM
│   ├── ui/               # DOM: HUD, ekranlar, bildirimler, rozetler, ayarlar paneli
│   ├── content/          # İpuçları ve rozet metinleri
│   ├── config/           # Tahta boyutları ve oyun ayarları
│   └── types/            # Paylaşılan TypeScript tipleri
├── public/
│   └── favicon.svg       # Olduğu gibi dist/ köküne kopyalanır
├── legacy/
│   └── Ferah Nefes · Sinüs Bulmacası.html   # Orijinal tek dosyalı prototip (değiştirilmedi)
├── docs/                 # NS4 görev raporları
├── tools/eslint/         # ESLint araç zinciri (yalnızca development)
├── eslint.config.js      # tools/eslint/eslint.config.js'i yeniden export eder
├── .prettierrc.json      # Prettier ayarları (.prettierignore: legacy, eski raporlar)
├── vite.config.ts        # base: './' (bkz. "Dağıtım")
├── tsconfig.json
└── package.json
```

## Legacy prototip

`legacy/Ferah Nefes · Sinüs Bulmacası.html` dosyası, Vite'a geçişten önceki tek dosyalı sürümdür. Davranış karşılaştırması ve denetim için **içeriği değiştirilmeden** saklanır (SHA-256 `bd358624…d03cb`, LF/CRLF dönüşümü öncesi Git blob `cb7068d`).

Bu dosya production build'e dahil edilmez. PixiJS'i CDN'den yüklediği için tek başına açılabilir.

## Durum ve kapsam notları

- **Yerel yüksek skor** mevcuttur (`fn_meta.best`).
- **Global yüksek skor tablosu henüz kurulmadı.** Ayrı bir görevde ele alınacak; şu an backend veya API yok.
- **Nihai dağıtım (hosting) hedefi henüz belirlenmedi.** `vite.config.ts` içinde `base: './'` kullanılıyor; bu sayede `dist/` hem alan adı kökünde hem bir alt dizinde çalışır. Hosting seçildiğinde bu karar yeniden doğrulanmalıdır.
- Tek, sabit görsel tema kullanılır; sistem açık/koyu tercihi görünümü değiştirmez. Tasarım tokenları `src/styles.css` başındadır (bkz. `docs/NS4-08-SINGLE-THEME-DESIGN-SYSTEM.md`).

## Dokümantasyon

- `docs/NS4-01-*`: Kaynak envanteri, davranış referansı, Vite risk analizi
- `docs/NS4-02-VITE-MIGRATION.md`: Geçişte alınan kararlar
- `docs/NS4-02-VERIFICATION.md`: Doğrulama sonuçları
- `docs/NS4-03-MODULAR-ARCHITECTURE.md`: Modül yapısı, sınırlar ve bağımlılık yönü
- `docs/NS4-04-TYPE-SAFETY-AND-QUALITY.md`: Tip güvenliği, ESLint/Prettier ve kalite komutları
