# NS4-24 · Sentetik açıcı ve rebound yerine "Hapşırık!"

Yeniden tasarım planının Faz B maddesi, kullanıcı isteğiyle öne alındı (Faz A'daki NS4-21'den önce). Amaç: sentetik ve bitkisel ürünler arasındaki örtük karşılaştırmayı oyundan tamamen çıkarmak (NS4-19 denetimi risk #3, #4, #5'in oyun mekaniği kısmı) ve yerine her yaşa uygun, komik, ceza içermeyen bir güç koymak.

## 1. Kaldırılanlar

- **Sentetik açıcı** (en alttaki 3 satır), **rebound** (2. kullanımdan itibaren 40 sn × kullanım, yerçekimi ×1,5) ve **alttan çöp satırı** (10 sn'de bir, tek delikli). `addGarbage`, `reboundT`, `garbageT`, `synUses`, `useSyn`, `canSyn`, `garbage` olayı, `'garbage'` oyun sonu nedeni.
- Görünür metinler: buton ("Sentetik açıcı", "Hızlı ama geri tepebilir", "Hızlı rahatlama", "Tekrarı rebound yapar", "Rebound riski", "Rebound sürüyor"), Rebound rozeti ve sayacı, popup'lar ("Rebound", "Sık kullanım tıkanıklığı geri getirdi", "3 satır açıldı", "Tekrarlarsan geri tepebilir"), dekonjestan toast'u, Nasıl oynanır maddesi, "Doğal yol — Sentetik açıcısız 5. seviye" rozeti.
- `REBOUND_FX`, `GARBAGE_FX`, `View.onRebound/onGarbage`, `LINE_FX.syn`; `Sound.syn/warn/garbage`; `HAPTIC.syn/rebound/garbage`.

**Korunan:** `tip.duration` sağlık ipucu (dekonjestan sprey kullanım süresi) genel bilgi olarak yerinde; medikal onay listesinde kalır. Hücre tipi 8 (gri tıkanıklık) oyun sonu griye dönüşü ve testler için durur.

## 2. Hapşırık kuralları (`src/game/Game.ts`, `CFG`)

| Kural             | Değer                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------- |
| Kullanılabilirlik | şarj dolu **ve** tıkanıklık ≥ %35 (sıklamenle aynı eşik)                              |
| Etki              | yığının **en üstteki** `sneezeRows` = 3 dolu sırası savrulur (tehlikedeki üst kısım)  |
| Puan              | 50 × savrulan sıra × seviye (eski sentetik bonusuyla aynı; sunucu sınırı değişmedi)   |
| Şarj              | oyun başında dolu; kullanınca 0; her kilitlenen parça +1, `sneezePieces` = 20'de dolu |
| Süre              | `sneezeMs` = 650 ms (oyun bu sürede durur; ilk %45 hazırlık, sonra patlama)           |
| Ceza              | yok (hızlanma, çöp, oyun sonu nedeni yok)                                             |

Yeni API: `sneezeCharge()`, `canSneeze()`, `useSneeze()`, `topNonEmptyRows(n)`, alanlar `sneezeUses`, `sneezePieces`. Olay: `powerdone { kind: 'sneeze', n }`.

## 3. His

- **Görsel** (`GameView`, `SNEEZE_FX`): "ha… ha…" — savrulacak hücreler iki kez şişer (parçacık yok); "HAPŞU" — sarsıntı, sıcak sarı ışıma, sarı/pembe/turkuaz/beyaz konfeti; hücreler dönerek, küçülerek yukarı uçar. Islak hiçbir öğe yok. Reduced motion: sarsıntı, ışıma ve konfeti azaltılır, süre aynı.
- **Ses** (`Sound.sneeze`): iki yükselen nefes + ton, geniş gürültü patlaması ve tok darbe, neşeli "boing" ve parıltılar; müzik kısa süre kısılır.
- **Titreşim**: `[8, 140, 10, 200, 40]` (ha… ha… HAPŞU).
- **Metin**: popup "HAPŞUU! / Çok yaşa!"; yeniden dolunca toast "Burnun yine kaşınıyor… Hapşırık hazır!" (ilk açılış sıklamen duyurusuyla aynı karede olduğundan o toast'u ezmez).
- **Buton**: `#btn-sneeze` — durumlar `locked` / `ready` / `charging` ("Burun kaşınıyor…", kısa etiket "Doluyor"); alt kenarda şarj çubuğu (`#sneeze-fill`, %5 adım), dolarken yüzde erişilebilir adda okunur. Renk `--color-sneeze` (#e8a317): tehlike kırmızısından ve sıklamenden ≥ 30° ton farkı (testli).
- **Rozet**: `hapsu` "Çok yaşa! — Bir oyunda 3 hapşırık" (`dogal` yerine; kayıtlı eski kimlik `normalizeMeta` ile atılır).

## 4. Analitik ve sunucu

- `synthetic_available` → `sneeze_available`; `rebound_started` kaldırıldı; `powerup_use.kind: 'hapsirik'` (+`uses`); `game_over.syn_uses` → `sneeze_uses`; `badge.id: 'hapsu'`. Dış etiket yöneticisinde (GTM vb.) bu adlar güncellenmeli.
- `supabase/functions/_shared/scoreRules.ts`: `synBonusPerRow/synRows` → `sneezeBonusPerRow/sneezeRows` (değerler aynı, sınır formülü aynı). Edge Function yeniden dağıtılmalı; veritabanı şeması değişmedi.

## 5. Testler

`tests/game/powers.test.ts` (hapşırık kuralları), `events`, `board`, `constants`, `effects` (hazırlık → patlama → temizlik, reduced motion), `sound`, `audio-haptics`, `feedback-wiring`, `hud`, `hud-states` (şarj yüzdesi ve çubuk), `powerups` (toast, rozet), `session`, `theme` (ton ayrımı), `content-safety` (görünür metinde sentetik/rebound/açıcı yok; dekonjestan yalnızca sağlık ipucunda; iğrenç/ıslak dil yok), `analytics`.

## 6. Doğrulama

- `npm run check`: typecheck, lint, format, 664 test, build.
- Headless Edge (1366×768, 390×844): hazır → hazırlık → patlama (popup + konfeti) → "Doluyor" ekran görüntüleri; 11 sıralık yığın 8'e indi, +150 puan.
- **Test edilemedi:** ses ve titreşimin gerçek cihazda his testi.
