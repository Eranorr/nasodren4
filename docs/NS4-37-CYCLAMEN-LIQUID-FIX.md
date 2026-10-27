# NS4-37 · Sıklamen özütü sıvısı: ekranda kalma ve görsel kalite

Kullanıcı geri bildirimi (2026-10-27): "Sıklamen özütünü kullanınca ekranda kalıyor, bir de geliş görseli çok kalitesiz."

## 1. Ekranda kalma (hata)

- **Neden:** sıvının bitişteki sönmesi, görünümün tek temizleme animasyonu yuvasında (`View.anim`, `recede`) tutuluyordu. Sıklamen bir odayı açınca ya da hemen ardından bir satır temizlemesi başlayınca yeni animasyon bu yuvayı eziyordu. Sönme yarıda kalıyor, pembe sıvı ve tepe ışığı kalıcı olarak ekranda duruyordu; yeni odanın üstünde bile görünüyordu.
- **Düzeltme:** sıvının kendi durumu ve sönme zamanlayıcısı var (`View.liquid`, `out`). `onClearEnd` sönmeyi başlatır, `update` her karede ilerletir; `anim` yuvası artık sıvıyı taşımaz.
- **Regresyon testi:** sıklamenden hemen sonra oda açılışı başlasa da sıvı `LIQUID_FX.recedeMs` içinde gizlenir.

## 2. Görsel kalite

- **Eski görünüm:** 256×128 piksellik, sinüs çizgili bir doku yatayda tekrarlanıp dikeyde ~12 hücreye esnetiliyordu. Yüzey testere dişi gibi görünüyor, renk geçişi bulanıklaşıyordu.
- **Yeni görünüm:**
  - **Renk geçişi:** pürüzsüz ve dikey (`createLiquidCanvas`): açık sıklamen pembesinden sıklamene, dipte turkuaza.
  - **Yüzey:** her karede çizilen yumuşak bir eğri; iki dalganın toplamı olarak salınır (`LIQUID_FX`). Renk geçişi bu eğriyle maskelenir.
  - **Derinlik:** arkada biraz daha yüksekte, ters fazda, daha koyu ikinci bir sıvı katmanı.
  - **Yüzey çizgisi:** ince, parlak, yuvarlak uçlu. Üstünde tepe ışığı ve kabarcıklar eskisi gibi duruyor.
  - **Hareketi azalt:** dalga genliği ve hızı %35'e iner.
  - Yeniden yerleşimde yüzey hücre cinsinden tutulduğu için doğru kalır. Sahneye kalıcı nesne eklenmez; nesneler kurulumda bir kez oluşturulur.

## 3. Kod

- `src/rendering/GameView.ts`:
  - `liquid`: arka ve ön katman sprite'ı, iki maske ve yüzey çizgisi;
  - `drawLiquid`, `hideLiquid`;
  - `ClearAnim.recede` kaldırıldı.
- `src/rendering/effects.ts`: `LIQUID_FX`.
- `src/rendering/textures.ts`: `createLiquidCanvas` (`createWaveCanvas` yerine).

## 4. Testler

`tests/rendering/effects.test.ts`:

- sıvı yükselir; yüzey maskesi ve 49 noktalı yüzey çizgisi çizilir;
- bitişte sönmeye geçer, sonra tamamen temizlenir;
- oda açılışı araya girse de söner (yeni test);
- yeniden yerleşimde sıvı tahtanın enini ve dibini tutar.

`npm run check` temiz (792 test). Headless Edge'de sıklamenin bir odayı açtığı senaryo 0,2 ile 5 sn arasında kare kare görüntülendi: sıvı yükseliyor, oda kartı sırasında sönüyor ve yeni odada iz kalmıyor.
