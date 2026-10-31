# Sıklamen Çekirdeği (V3): kalıcı kural seti `cyclamen-flow-v1`

Kullanıcı V3'ü gerçek oynanışta denedi ve onayladı. Bu belge, prototipten (V1, V2, V3) ana oyuna taşınan nihai kuralı ve skor uyumluluğunu özetler.

## 1. Nihai kural

| Adım               | Kural                                                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dağıtım            | Her 7'li torbada bir parça çekirdek taşır. Çekirdek parçanın çiçek hücresindedir, Hold ve "Sıradaki" ile birlikte taşınır.                                                                                     |
| Aktifleşme         | Parça kilitlenince çekirdek hücresinin sütunu ±1, sırası ±2 içinde gri bulutçuk varsa çekirdek aktifleşir; yoksa söner (kısa sönme efekti).                                                                    |
| Tek aktif çekirdek | Yakın olan yeni çekirdek eskisinin yerini alır ve ömür yenilenir. Yakın olmayan yeni çekirdek söner, eskisi kalır.                                                                                             |
| Hedef              | Aktifleşirken sabitlenir: en yakın gri (`                                                                                                                                                                      | dx  | +   | dy  | `); eşitlikte alttaki sıra, sonra çekirdek sütununa yakın olan. Hedef sıra silinen satırlarla kayar. Kendisi silinirse ya da çekirdek bir güçle giderse drenaj iptal olur. |
| Tetikleme          | Sonraki ilk standart satır temizlemesi tetikler (çekirdekli parçanın kendi temizlemesi dahil). Sıklamen, Hapşırık, oda geçişi ve reset tetiklemez.                                                             |
| Ömür               | 7 parça (`FLOW.coreLife`). Son 2 parçada işaret hafifçe söner; süre dolunca işaret kalkar.                                                                                                                     |
| Drenaj             | Hedef sırada yalnızca çekirdek sütunu ±2 içindeki griler akar (en çok 5). Renkli hücrelere ve başka sıralara dokunulmaz. 300 ms.                                                                               |
| Çökme              | Drenajın dokunduğu sütunlarda renkli hücreler griler ve taban arasında aşağı iner (180 ms, ayrı evre). Gri hücreler sabittir; `board` ve `plant` birlikte taşınır; farklı miktarda inen komşuların sapı kopar. |
| Puan               | Drenaj bonusu 0. Drenaj ve çökme `lines`, seviye, kombo veya B2B vermez. Oda açılma koşulu drenaj ve çökmeden sonra denetlenir.                                                                                |

- **Ayarlar:** `src/game/cyclamenFlow.ts` `FLOW` (`coreLife` 7, `nearCols` 1, `nearRows` 2, `span` 2, `rowMs` 300, `collapseMs` 180, `flushBonus` 0).
- **Kod:** `src/game/Game.ts`.
- **Görünüm:** `src/rendering/GameView.ts` ve `src/rendering/coreMark.ts`.
  - Aday çekirdek (düşen parça, Sıradaki, Hold): nabızlı halka ve yıldız.
  - Aktif çekirdek (tahtada): sabit halka.
  - Sönen çekirdek: gri tonda solma.
  - Reduced motion açıkken hareket yok.
- **Görünür metin:** yeni metin eklenmedi.

## 2. V1 ve V2 neden kaldırıldı, V3 neden seçildi

Aynı bot ve aynı 80 tohumla yapılan simülasyon (gerçek oyuncu verisi değildir):

|                             | Normal | V1 + çökme | V2 + çökme | V3 kör bot       | V3 bilen bot |
| --------------------------- | ------ | ---------- | ---------- | ---------------- | ------------ |
| 4 odayı bitiren             | 41/80  | 48         | 80         | 50               | 66           |
| Bitirenlerin toplam parçası | 443    | 432        | 88         | 424              | 431          |
| Tetiklenme                  | –      | %10        | %91        | %84 (aktiflerin) | %84          |
| Kaç parçada bir drenaj      | –      | 72         | 7,6        | 42               | 27           |

- **V1** (satırdaki çekirdek, BFS, 8 hücre): çekirdeklerin yalnızca ~%8–10'u tetiklendi. Çökmeden önce odaları yavaşlatıyordu; sırayı parçalıyordu.
- **V2** (sonraki satır, tam gri sıra): fazla güçlüydü. 4 oda 443 yerine 88 parçada bitti ve çekirdeğin nereye konduğu sonucu değiştirmedi.
- **V3** (yakınlık, ±2 drenaj): çekirdeğin konumunu gerçek bir karar yaptı. Çekirdeği bilen bot belirgin biçimde daha iyi sonuç aldı ve oyun aşırı hızlanmadı. Kullanıcı gerçek oynanışta onayladı.

## 3. Bedava tam satır kararı

- **Durum:** çökme bazen tam bir sıra bırakır (simülasyonda çökmelerin ~%10'u).
- **Karar:** bu sıra çökme anında temizlenmez; zincir yok.
  - Sonraki parça kilidinde normal satır kuralıyla silinir.
  - Normal puan, kombo ve B2B kuralları uygulanır (testle sabitlendi: `tests/game/collapse.test.ts`).
  - Ceza veya istisna eklenmedi.
- **4'ten fazla satır:** böyle bir sıra, aynı kilidin Tetris'iyle birleşirse tek temizlemede 4'ten fazla satır silinebilir.
  - Puan tabloları 4 satırda (T-spin'de 3'te) doyar: 4 ve üstü Tetris gibi puanlanır ve sunulur; mevcut metinler kullanılır.
  - `lines` gerçek sayıyı tutar. Böylece `NaN` skor oluşmaz.
  - Normal oyunda bir temizleme hiçbir zaman 4 satırı geçmediği için referans skorlar değişmedi: +138, +1732, +3800, 538 / 638 / 738.

## 4. Skor kural seti

- **Değer:** `RULESET = 'cyclamen-flow-v1'` (`supabase/functions/_shared/scoreRules.ts`). İstemci ve Edge Function aynı kaynağı kullanır.
- **Yerel liste** (`src/leaderboard/localScores.ts`):
  - Yeni kayıtlar `ruleset` taşır ve liste yalnızca güncel kural setini gösterir.
  - Alanı olmayan eski kayıtlar `legacy` sayılır, silinmez.
  - Her kural seti kendi en iyi 10'unu saklar; yeni kayıtlar eskileri itip silmez.
  - `fn_meta.best` (başlangıç ekranındaki rekor) değişmedi; eski kurallarla elde edilmiş olabilir. Ayrı karar olarak açık iş.
- **Global gönderim:**
  - Payload'a `ruleset` eklendi. Edge Function yalnızca `cyclamen-flow-v1` kabul eder.
  - Alanı olmayan eski istemci `fields` hatasıyla, başka değerler `ruleset` hatasıyla reddedilir.
- **Migration** `supabase/migrations/20261031000000_cyclamen_flow_ruleset.sql`:
  - `ruleset` sütunu (eski satırlar `legacy`), izinli değerler kısıtı ve kural seti içinde sıralama indexi.
  - `get_leaderboard(limit_count, ruleset_name)` yalnızca istenen kural setini döner; eski tek parametreli fonksiyon kaldırılır.
- **`maxPlausibleScore`:** drenaj bonusu 0 olduğu için sınıra ekleme gerekmedi. Çökmenin bıraktığı satırlar normal satır olarak `lines` içinde sayılıyor; satır başı ve kombo terimleri bunları zaten kapsıyor (testle doğrulandı). `minDurationForLines` temizleme başına 4 satır varsayar; 5 satırlık nadir temizlemeler bu gevşek alt sınırı pratikte etkilemez.
- **Supabase:** canlı değil; deploy yapılmadı. Yayından önce migration uygulanmalı ve `submit-score` yeniden dağıtılmalı.
- **Etiket yöneticisi (GTM):** yeni olaylar şunlar (yalnızca sayısal alanlar; kişisel veri ve serbest metin yok):
  - `core_piece_seen`
  - `core_activated`
  - `core_expired`
  - `core_triggered`
  - `core_drain_completed`

## 5. Kalan denge riski: tek kullanımlık Sıklamen

Tek kullanımlık "Sıklamen özütü" alttaki 10 dolu sırayı boşaltıyor. 4. odanın 10 gri sırasını (86 bulutçuk) tek basışta açabiliyor ve bu odada çekirdek mekaniğini anlamsızlaştırabilir. Bu görevde bu güce dokunulmadı (kaldırılmadı, ×2 süresi ve sıra sayısı değişmedi); ayrı bir denge kararı olarak bekliyor.

## 6. Temizlenenler

- V1 (BFS) ve V2 (tam sıra) kod yolları kaldırıldı.
- Varyant ayrımı, `?prototype=cyclamen-flow&variant=…` URL anahtarı ve prototipe özel skor kapatma katmanı kaldırıldı (`src/app/prototype.ts`).
- V1/V2 testleri kaldırıldı.
- Development araçları yalnızca `import.meta.env.DEV` dalında dinamik olarak yüklenir; production paketinde yoktur:
  - `__fn.core`: `seedPiece`, `demoDrain`, `demoCollapse`, `state`;
  - `__fn.collisionDemo.grayContact`.

## 7. Doğrulama

- **Komutlar:** `npm run typecheck`, `npm run lint`, `npm test` (921 test) ve `npm run build` temiz.
- **`npm run format:check`:** görev dışı 87 mevcut dosyadaki biçim uyarısı yüzünden başarısız. Değiştirilen ve eklenen dosyalar biçimli; görev dışı dosyalara dokunulmadı.
- **Tarayıcı:** 64/64 kontrol geçti. Ekranlar: 390×844, 844×390, 1366×768, 1920×1080; DPR 1 ve 2. Kontrol edilenler:
  - Sıradaki ve Hold işareti;
  - aktivasyon, satır temizlemesi ve drenaj;
  - sönme efekti;
  - çökme (havada hücre yok, çizim hizalı, griler sabit);
  - drenajla oda açılışı;
  - yerel kayıt kural seti (eski kayıt korunur, listede görünmez);
  - global env yokken gönderimin kapalı olması.

  Konsol hatası ve 4xx yanıt yok; dış istek yalnızca Google Fonts.

- **Production önizlemesi:** `__fn` yok, hata yok, eski `?prototype=` parametresi etkisiz.
