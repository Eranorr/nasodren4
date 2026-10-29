# NS4-39 · Menü ve oyun müziği, ses ayarları, seviyeye göre kısalan "?" beklemesi

Tarih: 2026-10-29 · Durum: uygulandı, **commit yok**

## İstek

- "Sıradaki" kartının bekleme süresi seviye arttıkça kısalsın (NS4-38 sonrası karar).
- Ana menüye ve oyun içine müzik eklensin; müzik sinir bozucu olmasın.
- Oyun durdurulunca açılan ayarlar menüsü buna göre düzenlensin.

## Yapılanlar

### Seviyeye göre bekleme (`src/ui/nextReveal.ts`)

- Bekleme süresi `hideMsFor(level)` ile hesaplanır: 1. seviyede 380 ms, her seviyede 20 ms kısalır, en az 160 ms (12. seviye ve sonrası).
- Kısalan bekleme içine sığmayan tıklar çalınmaz; çan her zaman kartın açıldığı an çalar.
- Hızlı oyundaki kısa sürüm (110 ms, tık yok) değişmedi.

### Müzik (`src/audio/music.ts`, `src/audio/SoundManager.ts`)

İki sentez parçası var; ses dosyası yok.

| Parça            | Nerede                    | Karakter                                                                                                                                                             |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bahçe** (menu) | Ana menü, mola, oyun sonu | 72 BPM, Fa majör (Fmaj7 · Rem7 · Si♭maj7 · Do6), sıcak pad, ölçü başında yumuşak bas, Fa pentatonik kalimba                                                          |
| **Nefes** (game) | Oyun                      | 88 BPM, La minör (Lam7 · Famaj7 · Domaj7 · Sol6), rüzgâr, pad, yarım notalık hafif bas nabzı, seyrek ve pes kalimba; tıkanıklık süzgecinden geçer (NS4-20 boğukluğu) |

Sinir bozmaması için alınan önlemler:

- **Davul ve tiz, ısrarlı motif yok.** Oyun melodisi en çok ~660 Hz'e çıkar; oyun seslerinin (damla, tık, çan) altında kalır.
- **Pentatonik melodi:** her akorla uyumludur, sert çatışma olmaz.
- **Motifler ezberlenmez:** her ifadede iki motif üretilir (A · A' · B · nefes). Motif adımları göreli olduğu için ezgi bir önceki notadan devam eder. Ezgi sıçramaz: art arda notalar en çok 2 basamak uzaktır. Her 8 ölçüde yeni motif gelir.
- **Her 4. ölçü "nefes":** o ölçüde yalnızca tek nota çalar. Melodinin yoğunluğu menüde %42, oyunda %28.
- **Büyük anlarda müzik kısılır** (NS4-17 kısma). Menü müziği tıkanıklık süzgecinden ve kısmadan geçmez.

Geçişler:

- **İlk dokunuş:** tarayıcılar sesi ilk etkileşime kadar açmaz. Ana menüde sayfadaki ilk dokunuş veya tuş sesi açar ve "Bahçe" başlar.
- **Oyna:** "Nefes" başlar.
- **Mola:** "Bahçe" çalar, bu yüzden ayarlardaki düzey değişikliği hemen duyulur. **Devam et** ile "Nefes"e dönülür.
- **Oyun sonu:** "Bahçe" 1,6 sn sonra girer, böylece oyun sonu sesi önce duyulur.
- Parçalar arası geçiş yumuşaktır: eski parça 0,35 sn'de söner, yeni parça ~1,2 sn'de yükselir.
- **Zamanlama:** 100 ms'lik tek bir zamanlayıcı notaları 0,3 sn ileriden planlar. Her an en çok bir zamanlayıcı çalışır. Müzik durunca bütün düğümler durdurulur ve ayrılır.

### Ayarlar (Mola → Ayarlar ve ana menü → Ayarlar)

Ses grubu yeniden düzenlendi (`index.html`, `src/ui/settingsPanel.ts`):

- **Müzik** (açık/kapalı; ilk odak burada).
  - **Müzik düzeyi:** %0–100, adım 5, varsayılan %70.
  - **Menü ve mola müziği:** açık/kapalı. Kapalıyken müzik yalnızca oyunda çalar.
- **Ses efektleri** (açık/kapalı).
  - **Efekt düzeyi:** %0–100, varsayılan %80. Sürüklerken örnek çan çalar.

Davranış:

- Alt seçenekler, bağlı oldukları ana anahtar kapalıyken soluk görünür ve devre dışı kalır.
- Düzey kare eğriyle uygulanır (kulağa doğrusal gelir). Varsayılan düzeyde kazanç 1; önceki miks korunur.
- Ekran okuyucu değeri "yüzde 70" diye okur.

Kayıt (`fn_settings`):

- Yeni alanlar: `menuMusic`, `musicVol`, `sfxVol`.
- Eski kayıtlar yüklenirken yeni alanlar varsayılanla tamamlanır, kayıt bir kez geri yazılır. Kullanıcının eski tercihleri korunur.

## Dosyalar

- **Ses:**
  - `src/audio/music.ts` (yeni: parçalar, `Melody`);
  - `src/audio/SoundManager.ts` (`setMusic(mode, delay)`, `musicKind`, müzik düzeyi düğümü, nota zamanlayıcısı, `preview`).
- **Uygulama ve ayarlar:**
  - `src/app/lifecycle.ts` (mod geçişleri, `GAME_OVER_MUSIC_DELAY`);
  - `src/app/bootstrap.ts` (ilk etkileşimde ses, menü müziği, efekt örneği);
  - `src/types/settings.ts`, `src/storage/settings.ts`;
  - `src/ui/settingsPanel.ts`;
  - `index.html`, `src/styles.css` (`.set-sub`, `.set.off`).
- **Gizem kartı:** `src/ui/nextReveal.ts` (`hideMsFor`).
- **Testler:**
  - `tests/audio/music.test.ts` (yeni);
  - `tests/audio/sound.test.ts`;
  - `tests/ui/audio-haptics.test.ts`;
  - `tests/ui/supporting-screens.test.ts`;
  - `tests/storage/storage.test.ts`;
  - `tests/ui/next-reveal.test.ts`.

## Doğrulama

- `npm run check` temiz: 50 dosya, 830 test, build.
- Headless Edge'de denendi:
  - ilk tıklamada menü müziği başladı, Oyna ile oyun müziği geldi;
  - konsolda hata yok;
  - Ayarlar ekranı mola üzerinden açıldı; müzik kapatılınca alt seçenekler soluklaştı.
- Ses kulakla dinlenmedi (headless). Cihazda dinlenmesi gerekiyor.

## Cihazda denenecekler

- **Müzik ve efekt dengesi** (kulaklık ve hoparlör):
  - parça düzeyleri: `TRACKS.*.level` ve katman kazançları (`src/audio/music.ts`);
  - varsayılan düzeyler: `DEFAULT_MUSIC_VOL` ve `DEFAULT_SFX_VOL`.
- **Tempo:** menü 72 BPM, oyun 88 BPM. Melodi yoğunluğu: `density`.
- **Uzun oyunda bıktırma:** 10 dakika ve üstü oyunda müzik bıktırıyor mu? Gerekirse oyun parçasının melodisi seyreltilir veya pad'e geri çekilir.
