# Sıklamen gücü v3: basınca 3 gri sıra (kural seti `cyclamen-flow-v3`)

> **Kural seti yerini aldı:** 2026-11-03 itibarıyla güncel kural seti `sinus-attack-spray-v1` ([SINUS-ATTACK-AND-SPRAY-FINAL.md](SINUS-ATTACK-AND-SPRAY-FINAL.md)). Sıklamen gücünün 3 gri sıra kuralı aynen geçerlidir; güç artık yalnızca oda grilerini siler (atak grisi Spray'in hedefidir).

Önceki kural (v2, [CYCLAMEN-POWER-CORE-SUPPORT-FINAL.md](CYCLAMEN-POWER-CORE-SUPPORT-FINAL.md)) oyuncuya "bozuk" göründü:

- Aktif çekirdek yokken basınca hiçbir şey silinmiyor, etki sıradaki parçaya geçiyordu.
- Aktif çekirdekle de en çok 9 gri siliniyordu.
- Güç oyunda yalnızca bir kez kullanıldığı için kullanıcı daha güçlü olmasını istedi.
- Aktif çekirdeğin olup olmadığı da ekranda belli olmuyordu.

## 1. Kural

- Basınca **hemen 3 gri sıra** akar; sıranın bütün grileri silinir (`FLOW.powerRows = 3`). Ardından üstteki renkli bloklar çöker; griler yerinde kalır.
  - **Aktif çekirdek varsa:** çekirdeğin hedef sırasına en yakın 3 gri sıra silinir (eşit uzaklıkta alttaki önce). Çekirdek tüketilir.
  - **Aktif çekirdek yoksa:** en alttaki 3 gri sıra silinir.
  - Gri yoksa (serbest nefes) yalnızca ×2 çalışır.
- Değişmeyenler:
  - güç oyunda bir kez kullanılır ve %35 tıkanıklık eşiği aynıdır;
  - ×2 puan 30 sn sürer;
  - drenaj puan vermez; satır, seviye, kombo ve B2B etkilenmez;
  - düşen parça yerinde kalır;
  - normal çekirdek drenajı (satır temizlemesiyle) ±2 sütun, en çok 5 gri olarak sürer.
- **Dolu oda tek basışta açılmaz:** en küçük oda 4 sıradır. Güç 3 sıra siler; son oda 10 sıradır, 7'si kalır. Dört odanın hepsi 5 tohumla test edildi.

## 2. Aktif çekirdeğin görünürlüğü

Yeni yazı eklenmedi; yalnızca görsel değişiklik var.

- **Tahtadaki aktif çekirdek:** işaret %30 büyük ve altın rengi, kendi ritmiyle hafifçe büyüyüp küçülür. Aday çekirdek (düşen parça, Sıradaki, Beklet) beyaz ve küçük kalır.
- **Hedef sırası:** blokların arkasında altın bir şeritle aydınlanır. Son iki parçada çekirdekle birlikte soluklaşır.
- **Sıklamen özütü düğmesi:** güç hazırken tahtada aktif çekirdek varsa altın kenar ve parıltıyla belirir. Basınca çekirdeğin hizasından silineceği anlaşılır; parlamıyorsa en alttaki sıralar silinir.
- **Hareketi azalt** tercihinde nabız ve parıltı yoktur; işaret büyük ve altın, düğmede sabit altın halka kalır.

## 3. Kural seti

- `RULESET = 'cyclamen-flow-v3'` (`supabase/functions/_shared/scoreRules.ts`).
- Eski kayıtlar korunur:
  - yerel listede v2, v1 ve legacy kayıtları silinmez ama listede yalnızca v3 görünür;
  - global tabloda v2 satırları kalır, okuma v3'ü ister.
- Migration: `supabase/migrations/20261102000000_tetris_ruleset_v3.sql`. Yalnızca okuma RPC'sinin varsayılan kural setini değiştirir; veri silmez.
- **Canlıda gereken adımlar:**
  1. migration'ı SQL Editor'da çalıştırmak;
  2. `tetris-submit-score` fonksiyonunu yeni paketle yeniden yayınlamak (`node tools/bundle-functions.mjs`). Fonksiyon yalnızca güncel kural setini kabul eder.

  Bu iki adım yapılmadan yayına çıkan v3 istemcinin global gönderimleri reddedilir.

- Skor üst sınırı değişmez: drenaj puan vermez.

## 4. Doğrulama

- Birim testleri:
  - `tests/game/cyclamenPower.test.ts`: sıra seçimi, aktif çekirdek ve çekirdeksiz yol, serbest nefes, dört odada tek basışta açılmama;
  - güç, olay, ses, efekt ve HUD testleri;
  - `tests/rendering/coreMark.test.ts`: altın işaret ve hedef şeridi;
  - `tests/ui/hud-states.test.ts`: altın düğme.
- Tarayıcıda bot oyunları (gerçek oyun döngüsü):
  - aktif çekirdekle 3 oyun: güç her seferinde 27 gri sildi;
  - çekirdeksiz 2 oyun: 25 ve 27 gri sildi;
  - oyunlar 2–4 oda açtı, tıkanıp bitti; konsol hatası yok.
