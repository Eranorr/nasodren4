# NS4-22 · Büyük açılma anı ve Tam Ferahlık

Faz A'nın ("His") son görevi. Tetris, Tam Ferahlık ve oda açılışı artık oyunun en güçlü anları: "sinüs açılıyor" hissi ses, ışık ve sıklamen yapraklarıyla verilir. Renkli tetromino bloklarının çizimine dokunulmadı.

Kullanıcı kararı (2026-10-26): oda geçişinde tahta tamamen temizlenmeye devam eder ("ferahlama patlar" seçeneği). Oyuncunun renkli blokları da silinir.

## 1. Tam Ferahlık (yeni kural)

- **Şart:** bir **satır temizlemesi** tahtayı tamamen boşaltır. Güçlerin (sıklamen, hapşırık) boşalttığı tahta sayılmaz; böylece sıklamenle kolay bonus alınamaz.
- **Bonus:** `CFG.allClearBonus[n] × seviye`. Satır sayısına göre 800 / 1200 / 1800 / 2000 (Tetris rehberindeki "perfect clear" değerleri). Seviye, temizlemenin yükselttiği yeni seviyedir. Sıklamen ×2 bonusa uygulanmaz.
- **Olay sırası:** `scored → allclear { lines, bonus } → clearstart`. Popup "Tam Ferahlık! / Tahta tertemiz · +2.000".
- **Odalarla:** odada tahta boşalırsa gri bulutçuk da kalmamıştır, oda da açılır. İki bonus da alınır. Büyük an iki kez çalmaz: popup hemen çıkar, an oda açılışında tek ve en güçlü hâliyle (Tam Ferahlık gücünde) oynar. Serbest nefeste Tam Ferahlık tek başına oynar.

## 2. Büyük açılma anı

| An           | Ne zaman                                            | Güç      |
| ------------ | --------------------------------------------------- | -------- |
| Tetris       | dört satır temizlemesi başlarken                    | hafif    |
| Oda açılışı  | "Sinüs açıldı" geçişi başlarken                     | orta     |
| Tam Ferahlık | satır temizlemesi başlarken (odada: oda açılışında) | en güçlü |

- **Ses** (`SoundManager`):
  - `openUp(hold)`: müzik süzgeci bir anda tamamen açılır (zaman sabiti 0,03 sn), `OPEN_HOLD` süresince açık kalır, sonra tıkanıklığa yavaşça döner (0,7 sn). Açıkken `setCongestion` yok sayılır.
  - `sigh()`: sentez "ahh". Gürültü /a/ ünlüsünün iki formantından (850→700 ve 1300→1100 Hz) geçer. Islak ya da burun sesi yok, nefes verme gibi.
  - `relief('tetris')`: süzgeç açılır ve hafif bir "ahh" duyulur (akoru `clear(4)` zaten çalıyor).
  - `relief('allclear')`: içe nefes, uzun "ahh", parlak açılan akor ve aşağı süzülen parıltılar.
  - `roomClear()`: süzgeç oda geçişi boyunca açık kalır; dışa nefes yerine "ahh".
  - Ses efektleri kapalıyken de müzik süzgeci açılır.
- **Görsel** (`GameView.relief(kind)`, `RELIEF_FX`):
  - Tahta kenarıyla birlikte parlar.
  - Serin turkuaz parıltılar yukarı saçılır.
  - **Sıklamen yaprakları** dönerek ve kanat çırparak yukarı, hava akışıyla sinüs ağzına (tahta ortası) süzülür.
  - Satır anlarında yapraklar temizlenen satırlardan, oda anında tahtanın altından doğar.
  - Yaprak dokusu yeni: `createPetalCanvas`, beyaz ve gri tonlu çizilir, renk tint ile verilir. Kendi havuzu var (48 sprite). ParticleContainer döndürme ve ölçek taşımadığı için ayrı tutuldu.
  - Reduced motion: parıltı ve yaprak %30'a, sarsıntı %25'e iner.
- **Ekran ışığı** (`#relief`, `hud.reliefFlash`):
  - Ekran ortadan serin turkuaz bir ışıkla açılır; Tam Ferahlık'ta sıklamen halkası da eklenir.
  - Işık sürdükçe basınç ve tehlike vinyeti anında kalkar (`#relief.on ~ #pressure`), sonra HUD değerine yumuşakça döner.
  - Süreler `RELIEF_MS` ile CSS'de aynıdır. Reduced motion: tek, kısık ışık (`reliefSoft`).
- **Titreşim:** `HAPTIC.allClear` (yükselen üç dalga + uzun rahatlama). Odada Tam Ferahlık olursa oda deseni üstüne ayrıca çalmaz.

## 3. Kod

- `src/config/gameConfig.ts`: `CFG.allClearBonus`.
- `src/game/Game.ts`: `emptyExcept`, `scoreAllClear`, `allClears` sayacı; olay `allclear`.
- `src/types/events.ts`: `AllClearEvent`.
- `src/rendering/effects.ts`: `ReliefKind`, `RELIEF_FX`, `PETALS`, `PETAL_TINTS`, `SPARKLE_TINTS`.
- `src/rendering/textures.ts`: `createPetalCanvas`.
- `src/rendering/GameView.ts`: yaprak havuzu, `relief`, `spawnPetal`, `updatePetals`, `killPetals` (yeni oyun ve yeniden yerleşimde söner).
- `src/audio/SoundManager.ts`: `openUp`, `sigh`, `relief`, `OPEN_HOLD`.
- `src/app/events.ts`: an seçimi. `scored` (Tetris) ve `allclear`, satır `clearstart`'ında oynar; odada Tam Ferahlık, oda açılışıyla birleşir.
- `src/ui/hud.ts`: `reliefFlash`, `RELIEF_MS`. `index.html`: `#relief` (basınç vinyetinden önce). `src/styles.css`: ışık, süreler, kardeş seçicisi, reduced motion.
- `src/content/relief.ts`: "Tam Ferahlık!", "Tahta tertemiz".
- Nasıl oynanır: "… Tahtayı tamamen boşaltırsan Tam Ferahlık bonusu." (`how.drain`, sağlık kaydı).
- Analitik: `all_clear { lines, level, bonus }`, `game_over.all_clears`.
- Sunucu: `scoreRules.ts` `allClearBonus`. Makullük sınırına satır başına en yüksek Tam Ferahlık payı (800 × seviye) eklendi. **Edge Function yeniden dağıtılmalı.**
- Geliştirme: `__fn.fx.relief('tetris' | 'room' | 'allclear')` (ekran ışığıyla), `__fn.sfx.play('room' | 'allclear')`, `__fn.sfx.haptic('room' | 'allclear')`. `__fn.sfx.play('tetris')` artık açılma anıyla çalar.

## 4. Testler

- `tests/game/allclear.test.ts`: 1–4 satır, bonus × seviye, ×2'nin uygulanmaması, kalan hücre, sıklamen, sayaç, odayla birleşim, Serbest nefes.
- `tests/rendering/effects.test.ts` "büyük açılma anı": tarif sırası, satırlardan / alttan doğma, yaprakların yükselip ortaya süzülmesi, havuz sınırı, reduced motion, temizlik, doku yenileme.
- `tests/audio/sound.test.ts` NS4-22: süzgecin açılması, açık tutulması ve geri dönüşü; sesler kapalıyken süzgeç; formantlar.
- `tests/ui/relief.test.ts`: bağlantılar, ışık süresi, odada birleşim, oturum temizliği, stil ve işaretleme.
- `tests/rendering/textures.test.ts` yaprak dokusu; `tests/analytics/events.test.ts` `all_clear`; `tests/leaderboard/rules.test.ts` tutarlılık ve en kötü durum.
- **Bilinçli güncellemeler:**
  - Eski skor, olay ve haptik testleri yapay olarak boş tahtada satır temizliyordu; bunlar artık Tam Ferahlık sayılırdı. Bu testlere tahtayı boş bırakmayan tek bir hücre eklendi, referans skor dizisi (138 / 1732 / 3800 / …) aynen korundu.
  - Olay adı listesine `allclear` eklendi.
  - Sabitler testine bonus tablosu eklendi.
  - Nasıl oynanır metni güncellendi.

## 5. Doğrulama

- `npm run check`: typecheck, lint, format, 728 test, build.
- Headless Edge (390×844, 1366×768):
  - Serbest nefeste dört satırlık Tam Ferahlık: parlama, ekran ışığı, parıltılar, yükselen yapraklar, popup ve +2.000.
  - 1. oda açılışı: oda kutlaması + açılma anı.
  - Konsol hatası yok.

## 6. Açık konular

- Ses dozu ("ahh" kazancı, `OPEN_HOLD`) ve yaprak sayısı/boyutu gerçek cihazda dinlenip izlenmeli.
- "Tam Ferahlık! / Tahta tertemiz" metinleri medikal/hukuki inceleme listesine eklenmeli (oyun metaforu; tedavi iddiası yok).
- Tetris popup'ı hâlâ "Ozmotik etki: dört satır birden" diyor; dil değişikliği Faz D'de (NS4-29).
