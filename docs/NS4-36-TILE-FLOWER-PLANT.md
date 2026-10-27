# NS4-36 · Karo çiçeğiyle bitki

Kullanıcı geri bildirimi (2026-10-27): NS4-35'teki çizim çiçek beğenilmedi. İstek: "siklamen-blok-pembe.png gibi blok tasarımlarımızdaki çiçeği kullanalım, o çiçeğe uygun kuyruk, yaprak ve küçük tomurcuk ekleyelim." Bu görev NS4-35'in çiçeğinin yerini alıyor. NS4-34'teki parça başına tek bitki yapısı (tasarım, kopma, görünüm katmanları) aynı kaldı.

## 1. Ne görünür

- **Çiçek:** her parçanın çiçeği kendi renk karosundaki çiçektir. Pembede pembe karonun çiçeği, morda mor karonunki; turkuazda yeşil karonun beyaz-pembe çiçeği. Çiçek sapın ucuna oturur ve hücreyi boydan doldurur.
- **Tomurcuk:** aynı çiçeğin kapalı hâli. Çiçek daraltılıp uzatılarak taç yapraklarının kapanmış görünmesi sağlandı.
- **Yapraklar:** karodaki iki kalp yaprak. Karodaki gibi sivri uçlarından sapa tutturulur.
- **Sap:** karodaki ince bordo sabın renkleri ve kalınlığında (hücrenin %13'ü); kesitte soldan ışık alır. Dik köşelerde çeyrek çemberle kıvrılır.
- **Kuyruk:** bordo sapın sivrilerek biten ucu, çizimle üretilir.

## 2. Görseller (`tools/blocks/prepare_plants.py`)

- **Kaynak:** artık yılan görselleri değil, kullanıcının blok karoları (`art/bloklar/`). `art/yilan/` olduğu gibi duruyor, oyunda kullanılmıyor.
- **Yapraklar:** karolarda yaprak ve sap birebir aynı, yalnızca zemin değişiyor. Bu yüzden altı karodan çok karolu matlama ile her pikselin saydamlığı ve gerçek rengi çözülür: C_i = a·F + (1 − a)·B_i, B_i çiçeksiz zemin. Sonuç zeminden temiz ayrılmış yapraklardır.
  - İlk denemede yaprak görsellerinin köşesinde karonun parlak kenarından kalan başıboş pikseller vardı ve yaprağı küçük gösteriyordu. Artık yalnızca yaprağın kendisi (en büyük parça) alınıyor.
- **Çiçek:** rengi karoya göre değiştiği için matlama kullanılamaz. Siluet, karoların zeminden ayrılan bölgelerinin birleşimidir (yapraklar hariç) ve her karonun çiçeği bu siluetle kendi karosundan kesilir. Kenar payı o karonun zemin rengidir; oyunda aynı renkli karonun üstüne çizildiği için görünmez.
- Çıktı: `public/images/bitki/cicek-<renk>`, `tomurcuk-<renk>` (7'şer), `yaprak1`, `yaprak2`; toplam yaklaşık 95 KB.
- Bloklarla aynı "göz yormasın" ayarı uygulanır.
- Sap renkleri (`STEM_COLORS`) karodaki sabın kesitinden ölçüldü ve aynı ayardan geçirildi.

## 3. Kod

- `src/rendering/plants.ts`:
  - `PlantArt` = karo çiçekleri, tomurcuklar ve yapraklar;
  - çiçek ve tomurcuk karoları görselden çizilir;
  - `drawTail` sivri uç;
  - NS4-35'in çizim çiçeği (`drawFlower`, `drawBud`, `FLOWER_COLORS`) kaldırıldı;
  - `PLANT`: sap 0,13, çiçek 0,74, tomurcuk 0,56, yaprak 0,5, sivri uç 0,72.
- Oyun motoru ve görünüm bağlantıları değişmedi.

## 4. Testler

`tests/rendering/plants.test.ts`:

- her renk için karo çiçeği ve tomurcuğu ile iki yaprak yayınlanıyor;
- atlasta her rengin kendi çiçeği çiziliyor;
- sivri uç sap renklerinde çiziliyor;
- çiçek hücreyi boydan dolduruyor ama taşmıyor.

`npm run check` temiz (791 test). Headless Edge'de tahtada ve "Sıradaki" önizlemesinde görüntülendi.

## 5. Ayar

- Ölçüler: `PLANT`.
- Tomurcuğun kapanma oranı: `BUD` (`prepare_plants.py`).
- Sap renkleri: `STEM_COLORS`.
