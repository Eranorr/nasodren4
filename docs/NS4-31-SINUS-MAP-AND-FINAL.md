# NS4-31 · Sinüs haritası ve final

Kullanıcı geri bildirimi (2026-10-26): "Oynanış hep böyle düz ilerliyor." Seçilen yön: oyuna başı, ortası ve sonu olan bir yay kazandırmak. Odalar arasında ilerleme haritası, dördüncü odadan sonra da bir final.

## 1. Oda açılış kartı (sinüs haritası)

- Oda açılınca eski "Sinüs açıldı!" popup'ının yerine tahtanın alt yarısında bir kart çıkar:
  - "Sinüs açıldı!" ve "Yanak sinüsü ferahladı · +1.000";
  - yüz silüeti: açılmış sinüsler turkuaz; şimdi açılan büyüyerek turkuaza döner; sıradaki sıklamen pembesiyle nabız atar; kalanlar basınç leylağında;
  - "Sıradaki: Gözler arası sinüs". Son odada "Sırada: final".
- Kart dokunmayı engellemez ve `aria-live="polite"` ile duyurulur. Sıradaki odaya girilince (`roomstart`) kapanır; ana menüde ve yeni oyunda da temizlenir.
- Kart okunabilsin diye geçiş süresi uzadı: `CFG.roomClearMs` 1,4 sn → **2,4 sn**. Müzik süzgeci geçiş boyunca açık kalır: `OPEN_HOLD.room` 2,8 sn.
- Harita `index.html`'de satır içi SVG olarak iki kopya: kart için `#rmap`, final için `#fmap`. Durum kapsayıcının `data-yanak` / `data-etmoid` / `data-alin` / `data-sfenoid` niteliklerine yazılır (`ui/sinusMap.ts`); renk ve hareket CSS'tedir, renkler token.
- Reduced motion: kart kaymaz, sinüsler zıplamaz, yalnızca renk değişir.

## 2. Final

- Dördüncü oda açılınca geçişin sonunda oyun durur ve **final ekranı** açılır (`scr-final`):
  - dört sinüsü de açık harita;
  - "Bütün sinüsler açık!";
  - puan ve drenaj;
  - **Serbest nefese devam** / **Bitir**.
- Final ekranında müzik sürer. Ekranı yalnızca seçim kapatır: Escape/P, sekme değişimi ya da `resume()` kapatamaz.
- **Serbest nefese devam**: oyun sürer, "Serbest nefes / Rekor için nefes almaya devam et" popup'ı çıkar.
- **Bitir**: oyun sonu (`GameOverReason 'complete'`).
  - Başlık "Sinüslerin tamamen tıkandı" yerine "Bütün sinüsler açık!" olur.
  - Yığın griye dönmez, üzgün ses ve titreşim çalmaz; kısa bir seviye akoru çalar.
  - Skor yerel tabloya her zamanki gibi yazılır, global gönderim aynı.
- Analitik:
  - yeni `final_choice { choice: 'continue' | 'finish', dur_s }`;
  - `game_over.reason` artık `'complete'` değerini de alabilir.

## 3. Kod

- `src/ui/sinusMap.ts`: `mapStates`, `renderMap`, `showRoomMap`, `hideRoomMap`, `renderFinal`.
- `src/app/events.ts`:
  - `roomclear` → kart (eski popup'ın yerine);
  - `roomstart` → kart kapanır; Serbest nefese girilirse `lifecycle.showFinal()`.
- `src/app/lifecycle.ts`: `showFinal`, `continueFree`, `finish`; `complete` oyun sonu.
- `src/ui/screens.ts`: `OVER_TITLE`, `renderGameOver({ complete })`, `ScreenId 'scr-final'`.
- `src/app/bootstrap.ts`: `#b-free`, `#b-finish`.
- `src/ui/hud.ts`: kartın yerleşimi; oturum temizliği.
- `index.html`: `#room-map`, `#scr-final`, `#o-title`.
- `src/styles.css`: kart, harita durumları, final.
- Geliştirme: `__fn.ui.roomMap(oda)` (kartı geçiş süresi kadar gösterir) ve `__fn.ui.final()` (Serbest nefese geçip final ekranını açar).

## 4. Testler

- `tests/ui/rooms.test.ts`:
  - kartın içeriği ve harita durumları (1., 2. ve son oda);
  - kartın kapanması;
  - final ekranı;
  - seçim dışında kapanmaması;
  - devam ve bitir akışları, başlık.
- `tests/analytics/events.test.ts`: `final_choice` ve `reason: 'complete'`.
- `tests/content/content-safety.test.ts`: ekran listesi ve envanter.
- `tests/audio/sound.test.ts`: süzgeç geçiş boyunca açık.
- Envanter yardımcısı: SVG kapanışı Prettier'ın böldüğü `</svg\n>` biçimini de tanıyor. Yeni SVG'ler oyun sonu metnini yanlışlıkla siliyordu; test bunu yakaladı.

## 5. Doğrulama

- `npm run check`: typecheck, lint, format, 741 test, build.
- Headless Edge (390×844, 1366×768):
  - 1. oda: parlayan kanal ve "%0 açık";
  - kısmi temizlemede "%55 açık" ve ipucu;
  - oda kartı ve harita;
  - son oda kartı, final ekranı ve "Bitir" sonrası "Bütün sinüsler açık!" oyun sonu;
  - konsol hatası yok.

## 6. Açık konular

- Odalara özgü kurallar ve oda başına süre/parça sınırı + yıldız şimdilik yapılmadı (kullanıcı seçmedi).
- Final metinleri ("Bütün sinüsler açık!", "Serbest nefeste rekorunu büyütebilir…", "Sırada: final") medikal/hukuki inceleme listesine eklenmeli.
- Ulaşılan oda henüz skor tablosunda gösterilmiyor (yol haritası 4. bölüm).
