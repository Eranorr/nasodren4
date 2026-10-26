# NS4-27 · Sinüs Odaları: bölüm yapısı, geçme şartı ve oda görünümü

Planın Faz C maddesi, kullanıcı isteğiyle öne alındı ("bölümü geçme şartımız, bölümün tıkanıklık oranı, sinüs görünümü nerede"). Kapsam dışı (kullanıcı kararıyla sonraya): süre / parça sınırı ve yıldız sistemi.

## 1. Akış

| Oda | Ad                 | Başlangıç gri sırası | Başlangıç tıkanıklığı | Sıra başına boşluk            |
| --- | ------------------ | -------------------- | --------------------- | ----------------------------- |
| 1   | Yanak sinüsü       | 4                    | %20                   | 1–3                           |
| 2   | Gözler arası sinüs | 6                    | %30                   | 1–3                           |
| 3   | Alın sinüsü        | 8                    | %40                   | 1–2                           |
| 4   | Kafa tabanı sinüsü | 10                   | %50                   | 1–2                           |
| —   | Serbest nefes      | 0                    | —                     | sonsuz maraton (skor tablosu) |

- **Geçme şartı:** odadaki **bütün gri bulutçukları** temizlemek (satır, sıklamen drenajı veya hapşırık; hangisi olursa). Kısmi temizleme odayı açmaz.
- **Açılış:** `roomclear` → bonus `1000 × oda sırası × seviye`, 1,4 sn "Sinüs açıldı!" geçişi (oyun durur), sonra sıradaki oda temiz tahtayla kurulur (`roomstart`). Aktif parça kaybolmaz; kuyruğun başına döner.
- Seviye, satır, skor, sıklamen ve hapşırık oda değişiminde sürer. Oyun sonu kuralları aynı.
- Gri bulutçuklar odaların kendisidir; 4. odanın %50 başlangıcı güçleri hemen açar.

## 2. Kod

- `src/config/gameConfig.ts`: `ROOMS` (sıra/boşluk), `CFG.roomBonus`, `CFG.roomClearMs`.
- `src/game/Game.ts`: `reset({ rooms })` (varsayılan kapalı: motor testleri ve eski davranış boş tahta), `enterRoom`, `grayCount`, `roomCleared`, `beginRoomClear`; `PendingClearKind 'room'`; olaylar `roomstart { room, gray }`, `roomclear { room, bonus }`.
- `src/app/lifecycle.ts`: oyun `reset({ rooms })` ile başlar (`LifecycleDeps.rooms`, varsayılan açık). **Düzeltme:** oturum temizliği artık `reset`'ten önce; aksi hâlde ilk oda popup'ı başlarken siliniyordu (test yakaladı).
- `src/content/rooms.ts`: oda adları ve metinler. `src/app/events.ts`: popup, ses, titreşim, analitik.
- HUD (`#room-hud`): tahtanın üst kenarında, hava çıkışının iki yanında iki etiket: "1/4 · Yanak" ve "Bulutçuk 34" (Serbest nefeste yalnızca ad). `#board-bg[data-room]`: odaya özgü derinlik ve duvar tonu (1 turkuaz, 2 lila-mavi, 3 nane, 4 şeftali, Serbest nefes sıklamen pembesi); ızgara ve bloklar aynı.
- Görsel: temizlenen gri bulutçuk **gülümser** (yeni `createHappyCloudCanvas`, gri bloğun aynı çizimi + gülümseme ve pembe yanaklar), büyüyerek yukarı süzülür; "Sinüs açıldı" serin vuruş + alttan kabarcıklar, kalan hücreler söner. Renkli blok çizimi `drawBlock`'a taşındı; parmak izi testi değişmediğini doğrular.
- Ses `Sound.roomClear` (içe nefes → "ahh" dışa nefes → açılan akor), titreşim `HAPTIC.room`.
- Analitik: `room_start { room, gray }`, `room_clear { room, level, dur_s, bonus }`, `game_over.rooms_cleared`.
- Sunucu: `scoreRules.ts` `roomBonus`, `rooms`; makullük sınırına dört oda bonusu eklendi. **Edge Function yeniden dağıtılmalı** (yoksa hızlı geçilen odalar sınır dışı kalabilir).

## 3. Testler

`tests/game/rooms.test.ts` (kurulum, boşluk aralığı, kısmi temizleme, bonus, geçiş, hapşırık/sıklamenle açılış, aktif parçanın korunması, Serbest nefes), `tests/ui/rooms.test.ts` (etiketler, ton, popup'lar, bağlantılar, oturum temizliği, stiller), `tests/rendering/effects.test.ts` "odalar", `tests/rendering/textures.test.ts` gülümseyen karo, `tests/analytics/events.test.ts` oda hunisi, `tests/leaderboard/rules.test.ts` oda bonusu. Eski arayüz testleri oda akışı kapalı çalışır (`createAppStubs(game, rooms = false)`).

## 4. Doğrulama

- `npm run check`: typecheck, lint, format, testler, build.
- Headless Edge (390×844, 1366×768): 1. oda açılışı (etiketler, popup, oyun içinde somurtan bulutçuklar), gülümseyerek uçma, "Sinüs açıldı", 2. oda tonu ve +1000 bonus.

## 5. Açık konular

- Süre/parça sınırı ve yıldızlar (kullanıcı: sonra).
- Oyun sonu ekranında ulaşılan oda gösterilmiyor; skor tablosunda oda yok.
- Zorluk ayarı (boşluk sayısı, gömülü boşluklar) gerçek oyuncu testiyle doğrulanmalı.
- "Sinüs açıldı / ferahladı" oyun metaforu; medikal/hukuki metin incelemesine eklenmeli (`how.rooms` sağlık kaydında).
