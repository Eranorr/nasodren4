# NS4-41 · Ayarların sadeleşmesi, ana menü ve HUD görsel yenilemesi

Tarih: 2026-10-29 · Durum: uygulandı, **commit yok**

## İstek

- Ayarlar ekranından **Oynanış** ve **İleri ayarlar** bölümleri kaldırılsın.
- Ana menü ve HUD'lar daha göze hitap eden, göz yormayan biçimde güncellensin.

## Yapılanlar

### Ayarlar

- Ekranda yalnızca **Ses** grubu kaldı:
  - Müzik ve müzik düzeyi;
  - Menü ve mola müziği;
  - Ses efektleri ve efekt düzeyi.
- Kaldırılan seçenekler artık her zaman varsayılan değerlerinde (`withLockedDefaults`, `src/storage/settings.ts`):
  - titreşim açık (destekleyen cihazlarda);
  - hayalet parça açık;
  - DAS 167 ms, ARR 33 ms;
  - FPS göstergesi kapalı.
- **Neden kayıtlı değer yok sayılıyor:** daha önce titreşimi kapatmış ya da FPS göstergesini açmış bir oyuncu, arayüz olmadan o durumda kilitli kalmasın. Farklı değer kayıtlıysa yüklemede bir kez varsayılanla yeniden yazılır. Alanlar kayıt şemasında duruyor; ileride geri eklenebilir.
- Titreşim desteği notu (`hap-note`) ve ilgili kod kaldırıldı.

### Ana menü (`#scr-start`)

- **Opak arka plan:** oyun HUD'u menünün arkasından görünmüyor; nane → pembe yumuşak geçiş ve hava çizgileri.
- **Ortalanmış marka:**
  - sıklamen, pembe-nane yumuşak bir hale üstünde;
  - "Ferah Nefes" başlığı ve kısa tanım ortalı.
- **Kişisel rekor çipi:** "Rekorun 12.450". Yalnızca rekor varken görünür (`renderStartBest`); açılışta ve ana menüye dönüşte güncellenir.
- **Butonlar:**
  - **Oyna** oynat ikonlu tek ana eylem;
  - altında üç eşit karo: **Nasıl oynanır · Skorlar · Ayarlar**. Turkuaz çizgi ikonlu. Skorlar artık tek başına bir satırda değil.
- **İpucu kutusu:** kalın pembe kenar çizgisi yerine yumuşak nane zemin; başlık turkuaz.
- **Uyarı metni:** ortalı ve küçük.
- **Kısa yatay ekran:** çiçek ve başlık yan yana; hale kaldırılır; karolar alçalır.

### HUD

- **Paneller** (Beklet, Sıradaki, yatayda Skor ve Tıkanıklık kartları): tek ve yumuşak bir cam yüzey. İnce açık kenar, üstte ışık çizgisi ve çok hafif gölge var; keskin beyaz kutu görünümü kalktı.
- **Panel başlıkları** (BEKLET, SIRADAKİ, SKOR, TIKANIKLIK): küçük, aralıklı büyük harf, turkuaz; içerikle yarışmıyor.
- **Yan tıkanıklık metresi:** boş kısmı koyu lacivert yerine açık ve yumuşak bir iz; dolu kısım renkli kalıyor.
- **Dikey "Tıkanıklık" etiketi kaldırıldı:** tıkanıklık kartı zaten adlandırıyor.
- **Güç butonları:** hazırken hafif renkli zemin ve renkli kenar var; nabız halkası 6 px'ten 4 px'e indi ve soluklaştı. Butonlar hafif yarı saydam.
- **Bildirim (toast):**
  - daha kısa (en çok ~280–300 px);
  - yarı saydam ve bulanık zeminli;
  - yazı 12,5 px; tahtanın üstünü daha az kapatıyor.
- **Bloklar değişmedi** (çalışma kuralı).

## Dosyalar

- `index.html`;
- `src/styles.css`;
- `src/ui/settingsPanel.ts`;
- `src/ui/screens.ts` (`renderStartBest`);
- `src/ui/hud.ts`;
- `src/app/bootstrap.ts`, `src/app/lifecycle.ts`;
- `src/storage/settings.ts`.

**Testler:**

- `tests/ui/start-screen.test.ts`;
- `tests/ui/supporting-screens.test.ts`;
- `tests/ui/audio-haptics.test.ts`;
- `tests/storage/storage.test.ts` (kilitli varsayılanlar, eski kaydın bir kez yeniden yazılması);
- `tests/helpers/fakeDom.ts`.

## Doğrulama

- `npm run check` temiz: 843 test, build.
- Headless Edge ekran görüntüleri alındı: 390×844, 844×390 ve 1440×900 (ana menü, Ayarlar, HUD).

## Not (içerik, Faz D)

Ana menüdeki ipucu havuzunda tıbbi etki ifade eden metinler var. Örnek: sıklamen ekstresinin "mukus akışını artırdığı bildirilmektedir". Bu metinler `docs/YOL-HARITASI.md` 3.4 / NS4-29 hukuk geçişinde gözden geçirilmeli; bu görevde dokunulmadı.
