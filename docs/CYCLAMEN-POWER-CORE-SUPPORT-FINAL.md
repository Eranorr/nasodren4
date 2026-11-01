# Sıklamen gücü: çekirdek desteği (±4), kalıcı kural

Kural seti: `cyclamen-flow-v2`. Bu belge, tek kullanımlık "Sıklamen özütü" gücünün sıklamen çekirdeği akışına (V3) bağlanmasını ve eski "alttaki 10 sırayı boşalt" kuralının kaldırılmasını anlatır.

## 1. Eski kural neden kaldırıldı

Eski güç alttaki 10 dolu sırayı boşaltıyordu. Simülasyonda güç 4. oda için saklandığında son oda 72/72 denemede tek basışta açıldı. Böylece çekirdek mekaniği (hedef sıra, yakınlık, ±2 drenaj) son odada anlamsızlaşıyordu. Prototip karşılaştırmasından sonra (legacy, ±2, ±4) ±4 çekirdek desteği onaylandı. Diğer varyantlar ve `?cyclamen-power` URL anahtarı kaldırıldı.

## 2. Aktif çekirdek varken

- Güç hemen tetiklenir. Hedef sıra, çekirdeğin aktifleştiğinde kilitlenen sıradır ve değişmez.
- Çekirdek sütununun ±4 aralığındaki gri bulutçuklar temizlenir (en fazla 9). Renkli hücrelere ve diğer sıralara dokunulmaz.
- Ardından normal çökme (yalnızca drenaj olan sütunlarda) çalışır.
- Çekirdek tüketilir.
- Düşen parça olduğu gibi devam eder. Çakışma olursa parça yukarı itilir.
- Drenaj bonusu 0'dır. Satır, seviye, kombo ve B2B değişmez.

## 3. Aktif çekirdek yokken

- Düşen parçaya dokunulmaz.
- Sıradaki ilk çekirdeksiz parça çekirdek olur. Bu parça "Sıradaki" önizlemesinde işaretli görünür ve Hold'da korunur.
- Bu parça normal V3 kurallarıyla çalışır: griye yakın kilitlenirse aktifleşir ve ±2 drenaj yapar (en fazla 5). Uzakta kalırsa söner.

Her iki durumda da güç oyun başına bir kez kullanılır. %35 tıkanıklık eşiği, 30 sn ×2 çarpanı, ses, titreşim ve görsel (tahta ışıması ve kabarcıklar) korundu.

## 4. Neden ±4

| Simülasyon                     | ±2    | ±4    |
| ------------------------------ | ----- | ----- |
| Kullanım başına temizlenen gri | 3,9   | 6,1   |
| Oyunu bitirme                  | 60/80 | 62/80 |
| Son odayı tek basışta açma     | yok   | yok   |

±4 hissedilir bir destek sağlıyor, ama son odanın 10 gri sırasını tek başına açamıyor. Bu yüzden çekirdek kararları anlamlı kalıyor. Normal çekirdek drenajı ±2 / en fazla 5 olarak kaldı.

## 5. ×2 çarpanı

Çarpan gücün kullanıldığı anda başlar ve 30 sn sürer. Simülasyonda toplam puana katkısı yaklaşık %0,6–2,6 oldu. Sunucudaki makul skor üst sınırından eski "satır başına Sıklamen bonusu" terimleri çıkarıldı. `cycMult: 2` korundu ve sınır yeniden doğrulandı.

## 6. Kural seti `cyclamen-flow-v2`

- Yerel: yeni skorlar `cyclamen-flow-v2` olarak kaydedilir. `legacy` ve `cyclamen-flow-v1` kayıtları silinmez, ama listede yalnızca v2 gösterilir.
- Global: istemci yükü v2 taşır. Edge Function yalnızca v2 kabul eder.
- Migration: `supabase/migrations/20261101000000_cyclamen_flow_v2_ruleset.sql`.
  - İzinli değerler `legacy`, `cyclamen-flow-v1`, `cyclamen-flow-v2` olur.
  - `get_leaderboard` varsayılanı v2 olur.
  - Satır silme veya güncelleme yoktur. Geri alma notu dosyadadır.
- Global Supabase henüz canlı olmadığı için deploy yapılmadı.

## 7. Analitik

- `powerup_use` (siklamen) olayı `core: boolean` taşır: kullanım anında aktif çekirdek var mıydı.
- `core_drain_completed` olayı `power: boolean` taşır: drenaj güçten mi geldi.
- Drenaj ve çökme hücre sayıları mevcut `core_*` olaylarında kalır.
- Kişisel veri yoktur.

## 8. Kaldırılan kod

- Legacy alt-10-sıra yolu: `nonEmptyBottomRows`, `'cyc'` bekleyen temizleme türü, `CFG.drainMs`.
- Varyant anahtarı (`src/app/cyclamenPowerSwitch.ts`), karşılaştırma demosu (`src/dev/cyclamenPowerDemo.ts`) ve karşılaştırma testleri.
- Yalnızca eski kurala hizmet eden sıvı görseli (NS4-37: `LIQUID_FX`, `createLiquidCanvas`, GameView sıvı katmanı). Yeni kuralda bu koda erişilemiyordu.
- "Alt satırlar temizleniyor" açılır metni. Yerine yeni metin eklenmedi.
- "Nasıl oynanır" metnindeki eski davranış cümlesi çıkarıldı. Yeni ifade eklenmedi.

## 9. Bilinen yan etki

Çökmeden sonra tamamen dolu kalan bir sıra, bir sonraki kilitlemede normal satır temizlemesiyle silinir. Simülasyonda bu durum kullanımların yaklaşık %11–15'inde görüldü. Güç 4. oda için saklandığında oran %26'ya çıktı. Puan tablosu 4 satırda doyduğu için skor hatası oluşmaz.

## 10. Doğrulama

- Testler: `tests/game/cyclamenPower.test.ts` (kalıcı davranış), güç, oda, olay, analitik, skor tablosu, migration ve arayüz testleri.
- `npm run typecheck`, `lint`, `test` ve `build` temiz.
- Tarayıcı (390×844, 844×390, 1366×768, 1920×1080; DPR 1 ve 2): aktif çekirdekle 9 gri ve ×2, çekirdeksiz kullanımda Sıradaki işareti ve Hold, ±2 drenaj, çökme, oda geçişi, yerel v2 kaydı. Konsol ve ağ hatası yok.
