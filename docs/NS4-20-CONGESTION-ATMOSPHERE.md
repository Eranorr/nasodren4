# NS4-20 · Tıkanıklık atmosferi: tıkalı burun sesi, nefes halkası, basınç vinyeti

Yeniden tasarım planının Faz A ("His") ilk görevi. Amaç: oyuncu sinüsün tıkandığını iğrenç bir görüntü olmadan, ses ve basınç algısıyla hissetsin; drenajla birlikte "açılma" doğal olarak duyulsun.

Oyun kuralları, skor ve görünür metinler değişmedi.

## 1. Tıkalı burun sesi (`src/audio/SoundManager.ts`)

- Ses grafiği: `mus → muffle (lowpass, Q 0,9) → master`. Oynanış sesleri (`sfx`) süzülmez; geri bildirim net kalır.
- `muffleCutoff(c)`: tıkanıklık `MUFFLE_START` (0,30) altına kadar 16 kHz (açık); üstünde üstel eğriyle tam tıkanıklıkta 520 Hz'e iner.
- `Sound.setCongestion(c)` ana döngüde her karede çağrılır (`src/app/bootstrap.ts`). Oyun dışında 0 verilir. %3'ten küçük değişimler yeniden zamanlanmaz; geçiş `setTargetAtTime` (τ 0,18 sn) ile yumuşaktır.
- `unlock()` öncesi bildirilen değer saklanır, grafik kurulurken uygulanır.

## 2. Nefes halkası (`index.html` `#breath`, `src/ui/hud.ts`)

- "Nefes sv." etiketinin önünde, `aria-hidden` küçük bir halka. Görünür metin eklemez; durum zaten tıkanıklık metresi ve metinle okunur.
- `breathState(c)`: `ferah` (< 0,35, 4,2 sn derin nefes), `orta` (0,35–0,70, 2,6 sn), `tikali` (≥ 0,70, 1,3 sn sığ nefes). Eşikler güçlerin açılma ve tehlike vinyeti eşikleriyle aynıdır.
- Oyun bitince, menüde ve yeni oyunda `ferah`.

## 3. Basınç vinyeti (`#pressure`)

- Tehlike vinyetinin (`#danger`, kırmızı, ≥ 0,70) altında, buğulu leylak (`--color-pressure`) kenar gölgesi.
- `pressureLevel(c)`: 0,35'te 0, tam tıkanıklıkta 1; 0,05 adımlı (gereksiz stil yazımı yok), 0,6 sn opaklık geçişi.
- Oyun dışında 0.

## 4. Tasarım kuralları

- Yeni renkler yalnızca `:root` tokenı: `--color-pressure`, `--color-pressure-soft`, `--color-fresh-soft`. Yeşil-sarı / kahverengi "mukus" tonu yok; basınç kırmızı tehlike renginden ayrı tutuldu.
- `prefers-reduced-motion`: nefes animasyonu ve vinyet geçişi kapalı; durum renkle sürer.

## 5. Testler

- `tests/ui/atmosphere.test.ts`: eşikler, HUD durum geçişleri (oyun, oyun sonu, menü, yeni oyun), işaretleme, token kullanımı, hareketi azalt.
- `tests/audio/sound.test.ts`: kesim eğrisi, yalnızca müziğin süzülmesi, seyreltme, unlock öncesi değer. Ducking testi müzik kanalını artık süzgeç üzerinden bulur.
- `tests/helpers/fakeDom.ts`: `pressure`, `breath` öğeleri eklendi.

## 6. Doğrulama

- `npm run check`: typecheck, lint, format, 665 test, build geçti.
- Headless Edge (playwright-core 1.48.2) ile 1366×768 ve 390×844'te tıkanıklık 0 / 0,50 / 0,85 ekran görüntüleri alındı: halka `ferah → orta → tikali`, vinyet opaklığı `0 → 0,25 → 0,75`.
- **Test edilemedi:** sesin kulakla değerlendirilmesi (headless ortam). Gerçek cihazda kulaklık ve hoparlörle dinlenmeli; 520 Hz alt sınır gerekirse `MUFFLE_CLOSED_HZ` ile ayarlanır.
