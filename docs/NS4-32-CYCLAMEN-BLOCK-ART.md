# NS4-32 · Sıklamen blok görselleri

Kullanıcı isteği (2026-10-27): renkli tetromino blokları kullanıcının hazırladığı sıklamen karo görselleriyle çizilsin. Göz yormaması için bir ayar yapılsın. Bu, "renkli bloklar değişmez" kuralına kullanıcının açık onayıyla yapılan istisnadır.

## 1. Dosyalar

- **Kaynak** (yayınlanmaz): `art/bloklar/siklamen-blok-*.png`. Altı görsel var, her biri 1254 px ve 1,4 MB.
- **Oyunda kullanılan**: `public/images/bloklar/<ad>.webp`. Yedi görsel, her biri 256 px ve yaklaşık 14 KB; toplam yaklaşık 100 KB (önceden 8,6 MB).
- **Hazırlama**: `python tools/blocks/prepare_blocks.py` (Pillow ve numpy gerekir).
  - Karonun opak sınırına kırpar ve 256 px'e küçültür.
  - "Göz yormasın" ayarını uygular.
  - I parçası için görsel yoktu: yeşil karonun zemini ve kenarı turkuaza döndürülür, yapraklar korunur.

| Parça | Kimlik | Görsel  | `COLORS` (hayalet çerçevesi, damla) |
| ----- | ------ | ------- | ----------------------------------- |
| I     | 1      | turkuaz | `#5cc9c4`                           |
| O     | 2      | sari    | `#ffcf5a`                           |
| T     | 3      | fusya   | `#e44d97`                           |
| S     | 4      | yesil   | `#7cc47e`                           |
| Z     | 5      | pembe   | `#f4869f`                           |
| J     | 6      | mor     | `#b45cf2`                           |
| L     | 7      | seftali | `#f9a184`                           |

## 2. "Göz yormasın" ayarı

`CALM` (`tools/blocks/prepare_blocks.py`) değerleri:

| Ayar       | Değer | Etkisi                                                                                 |
| ---------- | ----- | -------------------------------------------------------------------------------------- |
| saturation | 0,88  | Fuşya ve mor gibi çok doygun renkler biraz kısılır.                                    |
| contrast   | 0,86  | Renkler karonun kendi ortalamasına yaklaşır; koyu yaprak ile açık zemin farkı yumuşar. |
| brightness | 0,95  | Koyu tahtada parlama azalır.                                                           |

1 değeri ayarı kapatır. Değeri değiştirdikten sonra betik yeniden çalıştırılır. 0,80 / 0,82 / 0,93 de denendi; bu değerlerde karolar soluk ve gri kaldı.

Ayar, görsellere önceden işlenir; çalışma anında yapılmaz. Böylece her tarayıcıda aynı görünür ve oyunda ek maliyeti yoktur. Ayrıca karolar hücrenin %3'ü kadar içeriden çizilir, aralarında ince bir boşluk kalır.

## 3. Kod

- `src/rendering/textures.ts`:
  - `BLOCK_ART`, `blockArtUrl`, `loadBlockArt`;
  - `createBlockAtlas(px, art)`: `art` varsa 1–7 görselle çizilir, gri blok (8) ve hayaletler değişmez.
- `src/rendering/GameView.ts`: kurulumda görselleri yükler, gelince atlası yeniden kurar. Görseller yüklenene kadar ya da yüklenemezse eski jöle çizimi yedek olarak görünür; jöle çizimi de yeni paleti kullanır.

## 4. Testler

`tests/rendering/textures.test.ts`:

- jöle parmak izleri yeni paletle yeniden sabitlendi (komut sayısı aynı, 379);
- yeni testler: yedi görsel dosyası yayınlanıyor; 1–7 `drawImage` ile, paylı ve yumuşak örneklemeyle çiziliyor; gri blok yüzlü kalıyor; hayaletler etkilenmiyor; görsel yüklenemezse `null` dönüyor.

`npm run check` temiz (746 test). Headless Edge'de görseller yükleniyor ve tahtada da sıradaki kutusunda da çiziliyor.

## 5. Açık konular

- **Ayırt edilebilirlik:** pembe (Z) ile şeftali (L) birbirine yakın, turkuaz (I) ile yeşil (S) de öyle. Cihazda bakılmalı. Gerekirse görsellerden biri daha belirgin bir renkle değiştirilebilir.
- **I parçası:** turkuaz karo üretildi. Kullanıcı gerçek bir turkuaz görsel verirse `art/bloklar/` klasörüne eklenir; `SOURCES` güncellenip betik yeniden çalıştırılır.
