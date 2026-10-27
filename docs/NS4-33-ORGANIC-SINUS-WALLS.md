# NS4-33 · Organik sinüs duvarları

Kullanıcı isteği (2026-10-27): bölümlerde "sinüsün içindeyiz ve sinüsü açıyoruz" hissi verilsin. Önerilen dört yön (buğu açılır, sinüs ağzı açılır, organik oda duvarları, odaya yolculuk) arasından **organik oda duvarları** seçildi. Diğer üçü ileride yeniden önerilebilir.

## 1. Ne görünür

- Tahtanın kenarlarında, blokların **arkasında** yumuşak, iki katmanlı duvarlar var: derin bir arka kıvrım ve açık bir ön duvar. Renkleri odanın tonundan (`--color-rim`) türetilir, kenarlarında hafif bir parıltı olur.
- Her odanın kendi şekli var:

  | Oda           | Şekil                                                                    |
  | ------------- | ------------------------------------------------------------------------ |
  | Yanak         | Geniş, yuvarlak mağara. Yanlarda büyük kabarıklar, taban köşeleri derin. |
  | Gözler arası  | Petek gibi sık, küçük kıvrımlar; iki yanda karşılıklı kaydırılmış.       |
  | Alın          | Üstü kubbe, alta doğru huni gibi daralır.                                |
  | Kafa tabanı   | Derin kutu, tabanda orta sırt. Kıvrımlar üst yarıda.                     |
  | Serbest nefes | Yalnızca hafif yuvarlak köşeler (açık sinüs).                            |

- **Açıldıkça geri çekilir:** duvarın derinliği açıklık yüzdesine (`Game.roomOpenness`) bağlıdır.
  - %0'da kabarıklar tam boydadır (en çok yaklaşık 1 hücre).
  - %100'de kabarıklar %12'ye, köşeler %35'e çekilir.
  - Değişim yaklaşık 0,45 sn'lik zaman sabitiyle süzülerek olur.
  - Yeni oda başlarken duvarlar o odanın tıkalı hâline doğru kapanır.
- **Sinüs ağzı** (üst kenarın ortası) hiçbir odada kapanmaz.
- **Izgara** artık duvarların üstündedir. Duvar kenar hücreye taşsa da hücre çizgileri görünür kalır, oyuncu o hücreyi kapalı sanmaz.

## 2. Kod

- `src/ui/sinusWalls.ts`:
  - `WALLS`: oda şekilleri; kabarıklar `side / at / size / span` ile, köşeler yarıçapla tanımlanır.
  - `wallInset`, `wallPolygons`, `wallPath`: dört kenar bandı ve dört köşe dolgusu üretir. Birim hücredir.
  - `syncWalls`, `resetWalls`, `setWallsReducedMotion`.
- `index.html`: `#board-bg` içinde `#sinus-walls` SVG (`viewBox 0 0 10 20`, `aria-hidden`), `#walls-back` ve `#walls-front` yolları.
- `src/styles.css`:
  - `.sinus-walls`, `.wall-back`, `.wall-front`;
  - ızgara `#board-bg::before` katmanına taşındı (`--cell`), ostium `z-index: 2`;
  - `#board-bg` `isolation: isolate` aldı, böylece katmanlar Pixi tuvalinin altında kalır.
- `src/ui/hud.ts`: `updateHud` her karede `syncWalls` çağırır. Yol yalnızca görünür bir değişimde yeniden yazılır. `applyHudLayout` artık `--cell` yazar.
- `src/ui/dom.ts`: SVG öğeleri için `svg(id)`.
- `src/app/bootstrap.ts`: "Hareketi azalt" açıksa duvarlar süzülmeden yeni duruma geçer.

## 3. Testler

- `tests/ui/walls.test.ts` (22 test):
  - her oda için ayrı şekil;
  - bütün alt yollar aynı yönde (dolguda delik açılmaz);
  - sinüs ağzı açık; kabarıklar 1 hücreyi geçmez ve en az 0,5 hücre belirgin;
  - açılınca geri çekilme; süzülme ve hedefe varış;
  - değişiklik yokken yeniden yazım yok; oda değişimi; hareketi azalt;
  - HUD bağlantısı (1. odadan 2. odaya geçiş); işaretleme; renkler yalnızca token.
- `tests/ui/atmosphere.test.ts`: ızgara testi `::before` ve `--cell` için güncellendi.
- `tests/helpers/fakeDom.ts`: `FakeSvg`; `SVGElement` artık `FakeSvg`.

`npm run check` temiz (768 test). Headless Edge'de 390×844 boyutunda dört oda %0 ve %80 açıklıkta, Serbest nefes de ayrıca görüntülendi.

## 4. Açık konular

- Duvarların dozunu cihazda değerlendirmek gerekiyor. Ayar `WALLS` içindeki `size` değerleri ve `.wall-*` opaklığı ile yapılır.
- Seçilmeyen yönler (buğu açılır, sinüs ağzı açılır, odaya yolculuk) duvarlarla birlikte çalışabilir. Hepsi aynı açıklık değerine bağlanabilir.
