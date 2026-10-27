# NS4-35 · Dik sıklamen çiçeği

Kullanıcı geri bildirimi (2026-10-27): "Çiçeklerin şekilleri biraz fazla düz kalmış. Ana görsele birebir sadık kalmak zorunda değilsin, oyuna yakışacak şekilde yapalım."

## 1. Sorun

Yılan oyununun çiçeği (`art/yilan/bas.png`) yandan görülen, yayvan bir çiçekti; eni boyunun yaklaşık 2 katıydı. Hücreye sığması için boyu yarım hücrede kalıyordu ve basık bir yelpaze gibi görünüyordu.

## 2. Çözüm

Çiçek ve tomurcuk artık oyunda çizimle üretiliyor (`drawFlower`, `drawBud`, `src/rendering/plants.ts`). Biçim, kullanıcının blok karolarındaki çiçekler gibi dik ve alev biçimli.

- **Çiçek:** beş taç yaprak yukarı kalkık, uçları dışa kıvrık. Arkada iki kısa yaprak açılır, yanlarda iki uzun yaprak, önde en uzun orta yaprak var.
  - Her yaprak dipteki koyu "gözden" (sıklamenin tipik halkası) ortaya ve açık uca doğru renklenir.
  - Yaprakların ince koyu bir dış çizgisi ve açık bir orta damarı var; ön yaprakta yumuşak bir parıltı var.
  - Dipte yeşil bir çanak var (sapla aynı renkler).
- **Tomurcuk:** kapalı, uzun bir damla. Üzerinde sıklamen tomurcuğunun sarmal kıvrımları, dipte çanak var.
- **Boy:** çiçek sapın kenardan %16 içerideki ucuna oturur ve hücreyi boydan doldurur (%78). Sap çiçeğin içinden geçmez: çiçek ve tomurcuk hücrelerinde yalnızca kısa bir çiçek sapı çizilir (yeni sap karosu türü).
- **Renkler (`FLOWER_COLORS`):** dip, orta, uç ve dış çizgi. Kullanıcının blok karolarındaki çiçeklerden ölçüldü ve "göz yormasın" ayarından geçirildi.
  - sarı: krem-altın;
  - fuşya: koyu fuşya;
  - pembe: sıcak pembe;
  - mor: mor;
  - şeftali: açık pembe;
  - yeşil ve turkuaz: beyaz-pembe.
- Yaprak, sivri uç ve sap değişmedi. Çiçek ve tomurcuk görselleri (`public/images/bitki/cicek-*`, `tomurcuk-*`) kaldırıldı. `prepare_plants.py` artık yalnızca yaprak ve kuyruk üretiyor; çıktı aynı kaldı.
- Atlas 62 karodan 78 karoya çıktı: sap karoları 4 × 16, çiçek karoları 7 × 2.

## 3. Testler

`tests/rendering/plants.test.ts`:

- çiçek ve tomurcukta kısa çiçek sapı;
- çiçek hücreyi boydan doldurur ama taşmaz;
- yalnızca yaprak ve kuyruk dosyaları yayınlanıyor;
- atlas boyutu ve kırpma;
- her renk için 5 taç yaprak ve 1 tomurcuk, dipten koyu göze ve uca doğru renklenme.

`npm run check` temiz (791 test). Headless Edge'de tahtada ve "Sıradaki" önizlemesinde görüntülendi.

## 4. Ayar

- Biçim: `drawFlower` içindeki yaprak listesi (açı, boy, en, uç kıvrımı).
- Boy: `PLANT.flower`, `PLANT.bud`, `PLANT.stub`.
- Renkler: `FLOWER_COLORS`.
