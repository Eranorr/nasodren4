# NS4-34 · Parça başına tek sıklamen

Kullanıcı isteği (2026-10-27): blokların üzerinde, yılan oyunundaki gibi sarmal biçimde tek bir çiçek olsun. İki yorum önerildi: "her blokta sarmal çiçek" ve "parça başına tek çiçek". Kullanıcı **parça başına tek çiçek** seçeneğini seçti. Kaynak görseller yılan oyunundan: `art/yilan/` (`bas`, `yaprak1/2`, `tomurcuk/2`, `kuyruk`, `sap`, `yilan.json`).

## 1. Ne görünür

- Her tetromino tek bir sıklamen bitkisidir. Sap 4 bloğun içinden geçer ve dik köşelerde çeyrek çemberle kıvrılır. Gövdede bir yaprak var; bir ucunda açmış çiçek, diğer uçlarda tomurcuk ya da sivri sap ucu var.
- **Çiçek ve tomurcuk parçanın rengindedir.** Renkler kullanıcının blok karolarındaki çiçeklerden ölçüldü: sarıda krem, fuşyada koyu fuşya, yeşil ve turkuazda beyaz-pembe, pembede sıcak pembe, morda mor, şeftalide açık pembe.
- **Karolar artık düz jöledir.** Karonun üzerindeki çiçek silindi; renk, kenar ve parlaklık aynı kaldı.
- Çiçek, bağlantının tersine bakar; parça döndükçe bitki de döner. Sıradaki ve beklet kutularında da bitki görünür. Hayalet parçada bitki yoktur.
- **Satır silinince** silinen sıraya uzanan sap kopar:
  - bağını kaybeden yaprak ucta yaprak olarak kalır;
  - kesilen çiçek tek başına kalır;
  - kayan hücreler yeni komşularına bağlanmaz.
- Oyun sonunda yığın griye dönerken bitkiler kalkar. Gri bulutçuklarda bitki yoktur.

| Parça | Bitki                                                          |
| ----- | -------------------------------------------------------------- |
| I     | sivri uç, yaprak, düz sap, çiçek                               |
| O     | sap U çizer: bir üst köşede çiçek, diğerinde tomurcuk; yaprak  |
| T     | ortada çatal: uçta çiçek, bir kolda yaprak, diğerinde tomurcuk |
| S, Z  | iki kıvrım: bir uçta çiçek, diğerinde sivri uç; yaprak         |
| J, L  | köşede kıvrılır: çiçek kısa kolun ucunda, sivri uç uzun kolda  |

## 2. Görseller

- `tools/blocks/prepare_blocks.py`: karolardan çiçeği siler. Bitki altı karoda da aynı yerde olduğu için ortak bir maske çıkarılır, gölge halesiyle birlikte genişletilir ve maskenin içi çevredeki zeminden harmonik dolgu ile doldurulur. Ek bağımlılık: scipy.
- `tools/blocks/prepare_plants.py`: yılan parçalarını "dik" hâle getirir.
  - Çapa görselin ortasına alınır, uç yukarıya döndürülür; çapadan uca uzaklık 128 px'tir.
  - Yapraklarda yılandaki çapa yaprağın ortasındaydı. Blokta yaprağın damarların birleştiği noktadan tutturulması gerekiyor, bu yüzden nokta görsel üzerinde ölçüldü.
  - Çiçek ve tomurcuğun pembe tonları parça rengine taşınır; sarı başçık ve yeşil çanak değişmez.
  - Bloklarla aynı "göz yormasın" ayarı uygulanır.
- `public/images/bitki/`: 7 çiçek, 7 tomurcuk, 2 yaprak ve kuyruk; toplam yaklaşık 200 KB. Karolar yaklaşık 76 KB.
- Sap çizimle üretilir. Renkler yılanın sap kesitinden (`sap.png`) alınıp aynı ayardan geçirildi. Katmanlar: gölge ve koyu dış çizgi, gövde, sol üstten ışık alan açık şerit ve parıltı.

## 3. Kod

- `src/game/plants.ts`:
  - hücre başına bir bayt: bit 0–3 sap bağlantıları, bit 4–6 rol (sap, çiçek, yaprak, tomurcuk, sivri uç);
  - `DESIGN`: döndürmesiz tasarım;
  - `PLANTS[tip][rot]`: SRS döndürme merkezleriyle döndürülüp `SHAPES` sırasına hizalanır.
- `src/game/Game.ts`: `plant` dizisi.
  - `lock` bitkiyi yazar.
  - `removeRows` önce silinen sıraya uzanan bağları keser, sonra tahtayla birlikte kaydırır.
  - `reset` ve `enterRoom` diziyi temizler.
  - Tahtayı değiştiren başka yol yok: güçler (hapşırık, sıklamen) de `removeRows` kullanır.
- `src/rendering/plants.ts`: tek atlas, 62 karo, blok karosuyla aynı boyutta.
  - Sap karoları: 16 bağlantı × (düz, yapraklı, sivri uç). Çiçek ve tomurcuk düz sap karosunu kullanır.
  - Çiçek karoları: 7 renk × (çiçek, tomurcuk), dik çizilir.
  - `stemIndex`, `bloomIndex`, `bloomRotation`, `leafPlace`, `loadPlantArt`.
- `src/rendering/GameView.ts`:
  - Tahta, aktif parça ve önizleme sprite'larının her birine iki çocuk sprite eklenir (sap ve çiçek, `withPlant` ve `setPlant`). Çocuklar hücrenin konum, ölçek, döndürme ve saydamlığını izler; böylece satır silme, hapşırık savrulması ve oturma yaylanması bitkiyi kendiliğinden taşır.
  - İki atlas tek çizim grubunda kalır.
  - Bitki görselleri yüklenemezse bloklar bitkisiz (düz karo) görünür.
- `src/rendering/textures.ts`: ortak `loadImage`.
- `.prettierignore`: `art/` (kullanıcının kaynak dosyaları).

## 4. Testler

- `tests/game/plants.test.ts`:
  - her tip ve dönüşte: bağlar karşılıklı, bitki tek parça (3 bağ), tek çiçek; uç rolleri yalnızca tek bağlantılı hücrelerde;
  - T'nin çiçeği dönüşle döner;
  - kilitlenince yazım, satır silinince kopma, yeni oyun ve oda girişinde temizlik;
  - 400 hamlelik rastgele oyunda hiçbir sap boş hücreye ya da başka parçaya bağlanmaz.
- `tests/rendering/plants.test.ts`:
  - karo dizinleri, çiçek yönü, yaprak yeri;
  - yayınlanan dosyalar; atlas boyutu, kırpma ve çizilen parça sayıları; yükleme hatası;
  - görünümde: kilitli parça, aktif parça ve önizleme bitkili; gri hücrede ve oyun sonunda bitki yok.

`npm run check` temiz (789 test). Headless Edge'de 390×844 boyutunda her tip birkaç dönüşte, bir de satır silindikten sonra görüntülendi.

## 5. Açık konular

- **Boyut:** çiçek hücreye sığan en büyük boyda (genişliği yüksekliğinin yaklaşık 2 katı). Daha iri çiçek için komşu hücreye taşması gerekir; bu da ayrı bir katman ister.
- **Telefonda bakılmalı:** hücre yaklaşık 36 CSS px olduğunda çiçeğin ve yaprağın okunabilirliği.
- Ayarlar: ölçüler `PLANT` (`src/rendering/plants.ts`), renkler `FLOWER` (`tools/blocks/prepare_plants.py`), tasarım `DESIGN` (`src/game/plants.ts`).
