# Sinüzit Atağı ve Spray: nihai kural (kural seti `sinus-attack-spray-v1`)

Tarih: 2026-11-03. Bu belge, geliştirmede denenen beş prototip profilinin (V1–V5, `?prototype=sinus-attack-spray`) yerini alan kalıcı production kuralını anlatır. Prototip anahtarı, denge profilleri ve karşılaştırma maskeleri kaldırıldı. Kod: `src/game/sinusAttack.ts`, `src/game/Game.ts`, `src/ui/sinusHud.ts`.

## 1. Sinüzit Atağı

- Atak barı tahtanın yanında durur: portrede tahtanın altında yatay, yatayda tahtanın sağında dikey.
- Bar **60 sn aktif oynanışta** dolar. Şu anlarda durur:
  - mola,
  - satır temizleme (`clearing`),
  - drenaj ve çökme (`draining`),
  - oda geçişi,
  - oyun sonu.
- Dolunca:
  1. Tahta, bitki, kaynak ve kanal katmanları bir sıra yukarı kayar.
  2. Alttan **tek boşluklu** bir atak satırı gelir. Boşluk, o sıranın hava kanalı olarak kaydedilir.
  3. Görünür alt **8 sıraya en çok 3** dağınık atak grisi düşer.
- Dağınık griler şu hücrelere düşmez:
  - dolu hücre,
  - hava kanalı,
  - düşen parçanın hücreleri,
  - sırayı tam dolduracak hücre (dağınık ekleme kendiliğinden tam satır oluşturmaz).
- Uygun hücre azsa daha az gri eklenir; sonsuz arama yoktur.
- Bar her tetiklemeden sonra sıfırlanır.
- **Top-out:** en üst sıra doluyken atak gelirse oyun biter (`blockout`). Düşen parça sığmazsa yukarı itilir.

## 2. Hücre kaynağı katmanı (`Game.origin`)

Tahtayla aynı boyutta ayrı bir `Uint8Array`. Board değerleri değişmez (gri hep 8):

| Değer | Anlam                                                          |
| ----- | -------------------------------------------------------------- |
| 0     | boş ya da renkli hücre                                         |
| 1     | oda grisi (odanın başlangıç gri sıraları)                      |
| 2     | atak grisi (atak satırı, dağınık griler, odaya taşınan griler) |

Bütün tahta işlemleri `board`, `plant`, `origin` ve kanal kaydını birlikte günceller:

- parça kilidi,
- satır silme,
- hücre silme (drenaj, Spray),
- atakta yukarı itme,
- çökme,
- Sıklamen ve Hapşırık,
- oda geçişi,
- reset.

Boş hücrede kaynak ve bitki kalmaz. Testler bu tutarlılığı her işlemden sonra denetler.

## 3. Spray

- **Şarj:** yalnızca standart satır temizlemesinde kırılan renkli hücrelerle dolar.
  - Eşik **30** hücredir; fazlası birikmez.
  - Şu kaynaklar şarj vermez: atak satırları, gri hücreler, Sıklamen gücü, Hapşırık, drenaj, oda taşıması.
- **Hedef:** görünür tahtadaki **yalnızca atak grileri**.
  - Kullanım başına en çok **8 benzersiz** hücre seçilir; Spray'in kendi tohumlu akışıyla, deterministik.
  - Oda grisi ve renkli hücre hiç seçilmez.
- **Hedef yoksa:** atak grisi yokken Spray kullanılamaz ve şarj harcanmaz.
  - Düğme kapalı durur, dolum çubuğu çizgili ve sönük görünür.
  - Atak grisi gelince Spray yeniden etkinleşir.
- **Kullanım:**
  - Başarılı kullanımda şarj sıfırlanır; aynı oyunda yeniden dolar.
  - Silme sonrası mevcut sütun çökmesi çalışır: renkli hücreler iner, griler sabit kalır.
  - Puan, satır, seviye, kombo ve B2B değişmez.
- **Erişim:** klavyede `3`, dokunmatik/fare ile Spray düğmesi.

## 4. Atak satırı puan kuralı

Standart satır temizlemesinde bir tam satırın herhangi bir hücresi atak grisiyse, o satır **atak satırıdır**.

- **Tahtada:** satır normal biçimde tamamen silinir. İçindeki oda grileri de silinir ve oda ilerlemesine katkı verir.
- **Ama şunları üretmez:**
  - puan,
  - `lines`,
  - seviye,
  - kombo,
  - B2B,
  - Tetris/T-spin sayımı,
  - Tam Ferahlık bonusu,
  - Spray şarjı,
  - öğretici `clear` adımı,
  - rozet,
  - `first_drain` analitiği.
- **Karışık temizleme:** aynı kilitte normal ve atak satırları birlikte silinirse yalnızca normal satırlar mevcut formüllerle puanlanır. Örnek: 4 satırın 1'i atak satırıysa temizleme 3 satır (Üçlü) olarak sayılır.
- **Yalnızca atak satırı:** puan 0'dır. Satır, seviye, kombo ve B2B olduğu gibi kalır; yeni parça normal doğar.
- **Çekirdek:** aktif çekirdeği yalnızca normal satır tetikler.

## 5. Oda kuralı ve geçiş

- Oda hedefinde (`roomGray`, "%… açık") yalnızca oda grileri sayılır. Oda grileri bitince oda açılır; atak grileri kalsa da.
- Geçişte atak grileri **silinmez**; yeni oda kurulduktan sonra deterministik olarak yeniden yerleşir (`carryAttackCells`, rastgelelik yok):
  1. Eski koordinat uygunsa aynı yerde kalır. Uygun hücre:
     - boş,
     - hava kanalı değil,
     - oda sıralarının üstünde en üst kanalın sütunu değil (kanala üstten erişim kapanmaz),
     - sırayı tam doldurmuyor.
  2. Değilse görünür alt 8 sıradaki en yakın uygun hücreye gider (Manhattan uzaklığı; eşitlikte alttaki, sonra soldaki).
  3. O da yoksa tahtanın üst sıralarındaki en yakın uygun hücreye gider (üstten taşma baskısı).
  4. Hiç yer yoksa hücre sessizce silinmez; oyun mevcut top-out kuralıyla biter (`blockout`).
- Taşınan hücreler `attack` kaynağını korur ve bitkisiz kalır; Spray'in geçerli hedefidir.
- Taşıma puan, satır veya Spray şarjı vermez. Oda bonusu (production kuralı) aynen kalır.

## 6. Sıklamen çekirdeği ve gücü

Atak grisi yalnızca Spray'in hedefidir; çekirdek ve Sıklamen gücü onu görmez.

- **Çekirdek yakınlığı:** alan aynı (sütun ±1, sıra ±2), yalnızca oda grisi sayılır. Yakında yalnızca atak grisi varsa çekirdek aktifleşmez ve söner.
- **Hedef seçimi:** sıra aynı (en yakın, eşitlikte alttaki sıra, sonra çekirdek sütununa yakın); atak grisi hiç yokmuş gibi davranılır.
- **Normal drenaj:** hedef sırada ±2 aralıkta en çok 5 hücre silinir; aralıktaki atak grileri korunur. Aralıkta oda grisi kalmadıysa drenaj olmaz; aralık genişletilmez, yedek hedef aranmaz.
- **Sıklamen gücü:** güncel kural aynen geçerli ([CYCLAMEN-POWER-V3.md](CYCLAMEN-POWER-V3.md)). Basınca 3 gri sıra akar: aktif çekirdek varsa onun hizasından, yoksa en alttan. Yalnızca oda grisi içeren sıralar seçilir ve yalnızca oda grileri silinir.

## 7. Çok oyunculu

- Sinüzit Atağı ve Spray her turda etkindir; tur başında profil ya da maske gönderilmez.
- Atak ve Spray akışları tur tohumundan türer (`seed ^ 0x5a17ac0d`, `seed ^ 0x3c6ef372`); parça sırası etkilenmez. Aynı tohum ve aynı hamle izinde şunlar birebir aynıdır:
  - atak anı, boşluk ve dağınık hücreler,
  - Spray hedefleri,
  - kaynak katmanı,
  - oda taşıması,
  - çekirdek sonucu,
  - skor ve satır,
  - top-out.
- **Protokol sürümü 2.** Başlatma yükünden maske alanı kaldırıldı.
  - Eski sürümden (1) gelen imzalı zarf reddedilir; oyuncuya bir kez mevcut "Çok oyunculu şu an kullanılamıyor." iletisi gösterilir.
  - Uyumsuz istemciyle tur başlatılmaz.
- Çok oyunculu sonuçlar yerel skora, kişisel rekora ve global tabloya yazılmaz.

## 8. Arayüz ve erişilebilirlik

- **Yeni görünür metin yok:** düğmenin adı yalnızca "Spray".
- **Ekran okuyucu:** atak barı `role="progressbar"` ve `aria-label="Sinüzit Atağı"` taşır. Değer %10 adımlarla güncellenir; her karede duyuru yapılmaz.
- **Atak grisi işareti:** sağ alt köşede koyu konturlu küçük turuncu kama. Renkten bağımsız bir şekil ipucudur ve hareketsizdir.
- **Hedefsiz Spray:** düğme kapalı, dolum çizgili ve sönük.
- **Hareketi azalt:** bar uyarı nabzı kapanır, atakta sarsıntı olmaz (yalnızca kısa ışıma). Odak halkası diğer düğmelerle aynıdır.
- **Geliştirme araçları:** yalnızca development paketinde, `__fn.sinus`:
  - `attack()`,
  - `setProgress(p)`,
  - `fillSpray()`,
  - `origin()`,
  - `state()`.

## 9. Kural seti, skor tablosu ve yayın

- **Kural seti `sinus-attack-spray-v1`** (`supabase/functions/_shared/scoreRules.ts` `RULESET`).
  - Yeni yerel skorlar bu kural setiyle kaydedilir; skor ekranı ve kişisel rekor yalnızca bu kural setini gösterir.
  - Eski kayıtlar silinmez: `cyclamen-flow-v3`, v2, v1 ve `legacy` kendi listelerinde kalır.
- **Global:** istemci kural setini her istekte gönderir. Edge Function yalnızca güncel kural setini kabul eder.
- **Geçiş:** `supabase/migrations/20261103000000_tetris_ruleset_sinus_attack_spray.sql` forward-only'dir. Yalnızca okuma RPC'sinin varsayılan kural setini değiştirir, veri silmez; geri alma notu dosyada.
- **`maxPlausibleScore` değişmedi:**
  - Atak satırı puan ve satır üretmez.
  - Spray, taşıma ve drenaj puan vermez.
  - Satır başına üst sınır aynen geçerlidir. Bunu bir test, gerçek oyun akışlarında `score ≤ maxPlausibleScore(lines, level, süre)` olarak denetler.

**Canlı yayın adımları** (panelden; bu işte canlı deploy yapılmadı):

1. **SQL Editor:** `20261103000000_tetris_ruleset_sinus_attack_spray.sql` dosyasının tamamını çalıştırın.
2. **Edge Functions → `tetris-submit-score`:** `node tools/bundle-functions.mjs` ile üretilen `supabase/.dashboard/tetris-submit-score.ts` dosyasını yapıştırıp yayınlayın. Bu adıma kadar yeni istemcinin global gönderimleri `ruleset` hatasıyla reddedilir; oyun ve yerel tablo çalışır.
3. `tetris-room` değişmedi; yeniden yayın gerekmez.

## 10. Test ve doğrulama

**Otomatik kontroller:**

- typecheck, lint, test ve build temiz.
- `tests/game/sinusAttack.test.ts` kapsamı:
  - zamanlama,
  - atak satırı, kanal ve top-out,
  - kaynak katmanı,
  - Spray,
  - atak satırı puan kuralı (yalnız atak satırı, karışık temizleme, Tetris sınıflandırması, oda ilerlemesi, çekirdek tetiklenmemesi),
  - oda taşıması,
  - çekirdek ve güç ayrımı,
  - iki ve üç oyunculu determinizm,
  - skor üst sınırı.
- Ayrıca:
  - `tests/ui/sinus-ui.test.ts`: yerleşim, HUD, erişilebilirlik ve kayıt kuralları.
  - analitik şeması.
  - protokol sürüm reddi.
  - kural seti, yerel ve global filtre, Edge Function ve geçiş testleri.

**Tarayıcı:**

- 390×844, 844×390, 1366×768 ve 1920×1080'de denenenler:
  - atağın birkaç kez tetiklenmesi,
  - hedefsiz ve hedefli Spray (klavye ve dokunma),
  - oda geçişi ve taşıma,
  - Sıklamen ve Hapşırık,
  - mola/devam,
  - resize,
  - reduced motion,
  - odak.
- 2 ve 3 oyunculu tur.
- Production önizlemesi: ortam mevcut, Supabase engelli ve ortam eksik durumları.

Konsol ve ağ hatası yok.

## 11. Denge notları (son simülasyon)

Aynı 80 tohum ve aynı bot (parça başına 1,1 sn düşünme, 15 dk sınır):

|                                           | Eski production | Yeni final              |
| ----------------------------------------- | --------------- | ----------------------- |
| Ortalama oda                              | 2,1             | 2,9                     |
| 4 oda oranı                               | %6,3            | %17,5                   |
| Game over oranı                           | 0               | %7,5                    |
| Ortalama skor                             | 22.776          | 26.698                  |
| Ortalama seviye                           | 4,3             | 3,8                     |
| Ortalama lines                            | 37,5            | 33,2                    |
| Oyun başına atak                          | 0               | 13,7                    |
| Oyun başına atak satırı                   | 0               | 18,3 (puan ve satır: 0) |
| Oyun başına Spray (temizlenen atak grisi) | 0               | 6,1 (48,4)              |
| Aktif çekirdek / drenaj                   | 5,9 / 4,7       | 5,2 / 3,9               |

- Puan şişmesi giderildi: skor production'ın 1,17 katı (prototip V4/V5'te 2,8–2,9 kat). Satır ve seviye production'ın biraz altında.
- Oyun daha baskılı: game over %7,5, oyun sonunda kalan atak grisi ortalama 25.
- Oda ilerlemesi production'dan yüksek kaldı (2,9 oda, 4 oda %17,5). Olası neden: atakla yukarı itilen tahtada oda sıraları satır temizlemelerine daha sık katılıyor. Nihai değer olarak kabul edildi; yeni denge turu açılmadı.
