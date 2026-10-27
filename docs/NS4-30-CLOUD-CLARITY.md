# NS4-30 · Bulutçukları sadeleştirme

Kullanıcı geri bildirimi (2026-10-26): "Bulut mantığını herkes anlayabilir mi, ondan emin değilim." Seçilen yön: bulutçuklar kalır, ama ne yapılacağını kendileri anlatır.

## 1. Sorun

- Odalar alttan, satır başına 1–3 **rastgele** boşluklu gri sıralarla başlıyordu. Bu, Tetris'te ileri oyuncuların bildiği bir "kazı" moduna benziyor: boşluklar dağınık, nereye parça koyulacağı belli değil.
- HUD'daki "Bulutçuk 34" sayısı hedefi anlatmıyordu.
- Oda popup'ı "Bütün bulutçukları temizle" neyin, nasıl yapılacağını söylemiyordu.

## 2. Değişiklikler

- **Hava kanalı** (`ROOMS`, `Game.enterRoom`):
  - Her sırada bir boşluk var ve boşluklar üst üste hizalı.
  - Sıralar `channels` parçaya bölünür, her parçanın kanalı ayrı sütundadır. Son iki odada satır başına en çok 1 ek boşluk olur.
  - Hiçbir sıra dolu başlamaz; başlangıç tıkanıklığı aynı kaldı (%20 / %30 / %40 / %50).

  | Oda          | Sıra | Kanal | Ek boşluk |
  | ------------ | ---- | ----- | --------- |
  | Yanak        | 4    | 1     | 0         |
  | Gözler arası | 6    | 2     | 0         |
  | Alın         | 8    | 2     | 0–1       |
  | Kafa tabanı  | 10   | 3     | 0–1       |

  Yanak odasında tek bir dikey I bütün odayı açar ve tahta boşalır (NS4-22 Tam Ferahlık). İlk "aha" anı böyle kolayca yaşanır.

- **Parlayan boşluklar** (`GameView.syncHoles`, `HOLE_FX`):
  - Gri bulutçuk içeren sıralardaki boş hücreler, blokların arkasında serin turkuaz bir ışıkla nefes ritminde (1,6 sn) parlar.
  - Reduced motion'da ışık sabit kalır. Oyun sonunda söner. Havuz 24 işarettir.
- **Hedef metni**: oda popup'ı artık "Parlayan boşlukları doldur, bulutçukları uçur".
- **Açıklık çubuğu** (`#room-open`, `Game.roomOpenness`, `openPercent`):
  - "Bulutçuk 34" yerine "%55 açık" yazar ve hap soldan turkuazla dolar.
  - Yüzde aşağı yuvarlanır, son bulutçuk uçmadan %100 görünmez.
  - Ekran okuyucu "Sinüs yüzde 55 açık" okur.
- **İlk bulutçuk ipucu**: 1. odada ilk gri hücre temizlenince, oyun başına bir kez "Bulutçuk uçtu! Hepsini uçur, sinüs açılsın." toast'u çıkar.
- **Nasıl oynanır** (`how.rooms`): "… parlayan boşlukları doldurup hepsini uçurunca sinüs açılır. Dördü de açılınca ister serbest nefese devam et, ister bitir."

## 3. Testler

- `tests/game/rooms.test.ts`:
  - kanal yapısı (her parçada ortak boşluk sütunu, ardışık kanallar farklı, ek boşluk sınırı);
  - 1. odanın tek I ile açılması;
  - açıklık oranı.
- `tests/rendering/effects.test.ts` "boşluk işaretleri": ritim, yalnız gri sıralar, oda başı, oyun sonu, havuz.
- `tests/ui/rooms.test.ts`: "%0 açık", çubuk, erişilebilir ad, ipucunun bir kez çıkması, stil.
- Bilinçli güncellemeler: HUD kimlikleri (`room-gray*` yerine `room-open*`), oda hedefi, Nasıl oynanır metni ve envanter.

## 4. Açık konular

- Zorluk gerçek oyuncuyla denenmeli: 1. oda kasıtlı olarak kolay, kanal sayısı ve ek boşluklar ayarlanabilir (`ROOMS`).
- Yeni metinler ("Parlayan boşlukları doldur…", "Bulutçuk uçtu!…", "%… açık") medikal/hukuki inceleme listesine eklenmeli.
