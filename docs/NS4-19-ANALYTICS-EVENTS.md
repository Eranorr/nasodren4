# NS4-19 · Analitik olayları

> **NS4-24 notu:** sentetik açıcı ve rebound kaldırıldı. `synthetic_available` → `sneeze_available`; `rebound_started` kaldırıldı; `powerup_use.kind` `'sentetik'` → `'hapsirik'`; `game_over.syn_uses` → `sneeze_uses`; `game_over.reason` artık `'garbage'` içermez; `badge.id` `'dogal'` → `'hapsu'`. Ayrıntı: `docs/NS4-24-SNEEZE-POWER.md`.

Oyun hunisi kişisel veri toplamadan ölçülebilir hale getirildi.

- Olaylar tiplidir (`src/types/analytics.ts`); gönderim `src/analytics/analytics.ts` üzerindendir.
- Üçüncü taraf script, çerez, consent banner'ı veya yeni localStorage kaydı **yoktur**.

## 1. Gönderim davranışı

| Ortam       | `window.dataLayer` dizisi var | Yok                                          |
| ----------- | ----------------------------- | -------------------------------------------- |
| Production  | olay diziye itilir            | **hiçbir şey yapılmaz** (console'a yazılmaz) |
| Development | olay diziye itilir            | `console.debug('[track]', kayıt)`            |

- `dataLayer`'ı oyun oluşturmaz; sayfayı yerleştiren taraf sağlarsa kullanılır.
- Dizi değilse (ör. başka bir nesne) yok sayılır.

**Kayıt biçimi:** `{ event: 'fn_<ad>', t, sid, seq, ...payload }`

| Alan  | Açıklama                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t`   | `Date.now()`                                                                                                                                                                                                              |
| `sid` | Oturum kimliği: sayfa yüklemesi başına bellekte `Math.random` ile üretilen 8 karakter. Kriptografik değildir, cihaz parmak izi değildir, saklanmaz; yenilemede değişir. Kullanıcıyı siteler veya günler arasında izlemez. |
| `seq` | Oturumdaki olay sırası (1, 2, …)                                                                                                                                                                                          |

## 2. Gizlilik kuralları

- Payload'larda yalnızca sayılar, boolean'lar ve sabit kod değerleri bulunur; serbest metin yoktur.
- Analitiğe hiçbir zaman yazılmaz:
  - takma ad;
  - Supabase URL'si veya anahtarı;
  - IP, user-agent, cihaz bilgisi;
  - oyun kimliği;
  - global skor gönderim gövdesi.
- Hata olayları yalnızca önceden tanımlı kısa bir kod taşır (`SubmitFailCode`); sunucu mesajı taşınmaz.
- Skor yalnızca gerçekten gereken olaylarda bulunur: `game_over` (mevcut) ve oyun sonu CTA'sı (mevcut).
- Testler bu kuralları denetler: tam akışta takma ad, anahtar, URL, user-agent, gövde alanı ve oyun kimliği aranır; şema dışı alan hata sayılır (`tests/analytics/events.test.ts`). Tarayıcıda da aynı denetim yapıldı.

## 3. Olaylar

### Mevcut (korunan) olaylar

| Olay          | Ne zaman                                            | Payload                                                                          |
| ------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `game_start`  | her yeni oyun (Oyna, Tekrar oyna, Öğreticiyle oyna) | `best`                                                                           |
| `powerup_use` | sıklamen / sentetik kullanıldı                      | `kind`, `level`, `congestion` \| `uses`                                          |
| `level_up`    | seviye arttı                                        | `level`                                                                          |
| `badge`       | rozet ilk kez kazanıldı                             | `id`                                                                             |
| `game_over`   | oyun bitti (bir kez)                                | `reason`, `score`, `level`, `lines`, `dur_s`, `cyc_used`, `syn_uses`, `tetrises` |
| `cta_click`   | sağlık rehberi CTA'sı tıklandı                      | `placement` + **NS4-19:** `state`; oyun sonunda `score`, molada `level`          |

`cta_click` dışındaki mevcut payload'lar değişmedi. `cta_click`'e görevin istediği oyun durumu bağlamı eklendi: `state`, oyun sonunda `score`, molada `level`. Yerleşim değerleri aynıdır.

### Yeni olaylar

| Olay                      | Ne zaman (bir kez)                                           | Payload                                                                                                 |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `game_loaded`             | sayfa ve oyun hazır (sayfa yüklemesi başına)                 | `global_scores` (env var mı), `tutorial_done`                                                           |
| `tutorial_started`        | öğretici bir oyunda açıldı                                   | `step` (1 tabanlı), `resumed`, `mode` (`keyboard`/`touch`)                                              |
| `tutorial_step`           | bir adım tamamlandı                                          | `step`, `id` (`move`…`clear`)                                                                           |
| `tutorial_completed`      | son adım bitti                                               | `via` (`clear`: satır temizleme, `ack`: Tamam)                                                          |
| `tutorial_skipped`        | Atla (açık öğreticide)                                       | `step`                                                                                                  |
| `first_drain`             | oyundaki ilk satır temizleme                                 | `lines`, `level`, `dur_s`                                                                               |
| `cyclamen_available`      | sıklamen ilk kez kullanılabilir (oyun başına)                | `level`, `congestion`                                                                                   |
| `synthetic_available`     | sentetik ilk kez kullanılabilir (oyun başına)                | `level`, `congestion`                                                                                   |
| `rebound_started`         | sentetiğin tekrar kullanımı rebound başlattı (her seferinde) | `uses`, `level`                                                                                         |
| `replay_clicked`          | oyun sonu “Tekrar oyna” (`game_start`'tan hemen önce)        | —                                                                                                       |
| `leaderboard_opened`      | ana menü “Skorlar”                                           | —                                                                                                       |
| `leaderboard_tab_changed` | kullanıcı sekme değiştirdi (açılıştaki varsayılan sayılmaz)  | `tab`                                                                                                   |
| `leaderboard_refreshed`   | Yenile / Tekrar dene                                         | `action` (`refresh`/`retry`)                                                                            |
| `score_submit_started`    | “Global tabloya gönder” (her deneme)                         | —                                                                                                       |
| `score_submit_succeeded`  | gönderim kabul edildi                                        | —                                                                                                       |
| `score_submit_failed`     | deneme başarısız                                             | `code`: `nickname`, `duplicate`, `rejected`, `rate_limited`, `offline`, `timeout`, `server`, `disabled` |

Her `score_submit_started` için tam olarak bir sonuç olayı gelir (`succeeded` veya `failed`). Geçersiz takma ad ağa gitmez ve `failed/nickname` olarak sayılır.

**Olayların kaynağı:**

| Olaylar              | Dosya                                                  |
| -------------------- | ------------------------------------------------------ |
| Oyun ve güç olayları | `src/app/events.ts`                                    |
| Kullanılabilirlik    | `src/ui/hud.ts`                                        |
| Öğretici             | `src/tutorial/Tutorial.ts` (`track` dışarıdan verilir) |
| Skor ekranı          | `src/ui/scoresView.ts`                                 |
| Gönderim             | `src/ui/submitScore.ts`                                |
| Arayüz tıklamaları   | `src/analytics/funnel.ts`                              |
| `game_loaded`        | `src/app/bootstrap.ts`                                 |

## 4. Huni

| Adım                             | Olay                                                                        |
| -------------------------------- | --------------------------------------------------------------------------- |
| Oyun yüklendi                    | `game_loaded`                                                               |
| Oyun başladı                     | `game_start` (ilk oyunda öğretici: `tutorial_*`)                            |
| İlk drenaj                       | `first_drain`                                                               |
| Güçlendirici açıldı / kullanıldı | `cyclamen_available`, `synthetic_available` → `powerup_use`                 |
| Rebound başladı                  | `rebound_started`                                                           |
| Oyun bitti                       | `game_over`                                                                 |
| Tekrar oynandı                   | `replay_clicked` → `game_start`                                             |
| Skor ekranı açıldı               | `leaderboard_opened` (→ `leaderboard_tab_changed`, `leaderboard_refreshed`) |
| Global skor gönderimi denendi    | `score_submit_started` → `succeeded` / `failed`                             |
| Sağlık CTA'sı tıklandı           | `cta_click`                                                                 |

Aynı oturumdaki olaylar `sid` ve `seq` ile sıralanabilir.

## 5. CTA

- Yerleşimler değişmedi: `pause_menu` (Mola) ve `game_over` (Oyun sonu).
- URL `https://www.yasasinsaglik.com/` ve UTM değerleri değişmedi: `utm_source=ferah_nefes_oyun`, `utm_medium=advergame`, `utm_campaign=sinus_bulmaca`, `utm_content=<yerleşim>`.
- Bağlantılar yeni sekmede açılır (`target="_blank" rel="noopener"`).
- Analitik dinleyicisi `preventDefault` çağırmaz; tıklama gezinmeyi engellemez (test ve tarayıcıda doğrulandı).

## 6. Consent sınırı ve sonraki adım

Bu görevde bilerek yapılmayanlar:

- GA4 / GTM / başka analitik script'i eklenmedi;
- çerez banner'ı ve Google Consent Mode entegrasyonu yok;
- yeni çerez veya localStorage kaydı yok.

**Gerçek bir analitik etiketi eklenmeden önce consent/CMP gerekir:**

- KVKK / GDPR ve ePrivacy kapsamında açık rıza ve aydınlatma metni hazırlanmalı.
- Etiket ancak kullanıcı rıza verdikten sonra yüklenmeli (ör. Consent Mode v2 + CMP).
- `dataLayer` hedefi ve saklama süreleri belirlenmeli.
- Oturum kimliği yalnızca bellekte kalmalı; kalıcı istemci kimliği rıza olmadan üretilmemeli.
- Olay şeması (bu doküman) etiket yapılandırmasında aynen kullanılmalı; yeni alan eklenecekse gizlilik kuralları (bölüm 2) yeniden değerlendirilmeli.

## 7. Doğrulama

- **Birim testleri:** `tests/analytics/events.test.ts` (13 test).
  - `dataLayer` var/yok; development/production console davranışı;
  - oturum kimliği (storage/çerez yok, kriptografik değil); üçüncü taraf script yok;
  - huni olayları doğru anda bir kez: ilk drenaj, kullanılabilirlik, rebound, Tekrar oyna, Skorlar, CTA (gezinme engellenmez);
  - öğretici: başla, adımlar, tamamla, Atla, sürdürme, Tamam;
  - skor tablosu ve gönderim olayları ile hata kodları;
  - şema doğrulaması ve takma ad/gövde sızıntısı yok;
  - her olayın kaynakta gönderildiği.
- **Tarayıcı probu** (Playwright + Chromium 153), 21/21:
  - production, `dataLayer` yok: tam akışta console tamamen sessiz; `dataLayer` oluşturulmuyor; analitik storage/çerez yok.
  - production, `dataLayer` var: `game_loaded` bir kez; klavyeyle öğretici (başla → 6 adım → tamamla); `game_start` / `game_over` bir kez; iki CTA (yerleşim + durum, sayfa gezinmedi); `replay_clicked → game_start`; skor ekranı olayları; console sessiz; tek `sid`, artan `seq`.
  - dev + mock backend: ilk drenaj, kullanılabilirlik, 3 güç kullanımı, rebound; gönderim sırası: başla/başarısız(nickname) → başla/başarısız(server) → başla/başarılı; skor ekranı olayları; takma ad, anahtar ve gövde sızıntısı yok.
