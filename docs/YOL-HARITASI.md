# Ferah Nefes · Yol haritası ve devam notu

Son güncelleme: 2026-10-26 (NS4-22, NS4-30, NS4-31 sonrası). Bu dosya, bir sonraki oturumda kaldığımız yerden devam etmek içindir. Yeni oturumda önce bu dosya, sonra aşağıda adı geçen `docs/NS4-*.md` raporları okunmalı.

## 1. Vizyon (kısa)

- **Öne çıkan öğe:** sıklamen. Fantezi bir "çiçek gücü" olarak gösterilir; gerçek bir tedavi etkisi ima etmez.
- **His:** sinüzitin içindeymiş gibi, ama iğrenç değil. Basınç ve boğukluk ses, ışık ve nefesle verilir. Islak görüntü veya ses, "sümük" kelimesi, yeşil-sarı/kahverengi tonlar yok.
- **Ana deneyim:** "sinüs açıyoruz". Temizledikçe ses berraklaşır, hava akar, bulutçuklar gülümseyip uçar.
- **Kitle ve yapı:** her yaşa uygun, kısa oturumlu, skor tablolu bir reklam oyunu (Tetris tabanlı).

## 2. Şu ana kadar yapılanlar

Commit edildi (2026-10-26, push yok): `b2f84f8` (`dev:mobile`), `2d559e2` (NS4-20, NS4-24, NS4-21, NS4-27).

| Görev  | Özet                                                                                                                                                                                                                                                                            | Rapor                                        | Durum          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------- |
| NS4-20 | Tıkanıklıkla boğuklaşan müzik, nefes halkası, leylak basınç vinyeti                                                                                                                                                                                                             | `docs/NS4-20-CONGESTION-ATMOSPHERE.md`       | commit edildi  |
| NS4-24 | Sentetik açıcı ve rebound kaldırıldı. Yerine "Hapşırık!": %35 tıkanıklıkta açılır, üst 3 sırayı savurur, 20 blokta yeniden dolar, cezası yok                                                                                                                                    | `docs/NS4-24-SNEEZE-POWER.md`                | commit edildi  |
| NS4-21 | Sinüs boşluğu görünümü: derin zemin, yumuşak duvar, hava ağzı, hava kabarcıkları, gri bloklara yüz. **Renkli bloklar değişmedi**                                                                                                                                                | `docs/NS4-21-SINUS-CAVITY-ATMOSPHERE.md`     | commit edildi  |
| NS4-27 | Sinüs Odaları: 4 oda (Yanak %20 → Gözler arası %30 → Alın %40 → Kafa tabanı %50), geçme şartı bütün gri bulutçukları temizlemek, oda bonusu, odaya özgü ton, sonra sonsuz "Serbest nefes"                                                                                       | `docs/NS4-27-SINUS-ROOMS.md`                 | commit edildi  |
| NS4-22 | Büyük açılma anı (Tetris / oda / Tam Ferahlık): süzgeç bir anda açılır, sentez "ahh", ekran ışığı, turkuaz parıltı, sıklamen yaprakları. Yeni kural: Tam Ferahlık bonusu (800–2000 × seviye)                                                                                    | `docs/NS4-22-BIG-RELIEF-MOMENT.md`           | **commit yok** |
| NS4-30 | Bulutçukları sadeleştirme: boşluklar hizalı "hava kanalı" (1. oda tek I ile açılır), boşluklar parlar, "%55 açık" çubuğu, hedef metni, ilk bulutçuk ipucu                                                                                                                       | `docs/NS4-30-CLOUD-CLARITY.md`               | **commit yok** |
| NS4-31 | Sinüs haritası ve final: oda açılınca yüz silüetli harita kartı (geçiş 2,4 sn), 4. odadan sonra "Bütün sinüsler açık!" final ekranı (Serbest nefese devam / Bitir)                                                                                                              | `docs/NS4-31-SINUS-MAP-AND-FINAL.md`         | **commit yok** |
| NS4-32 | Sıklamen blok görselleri: 1–7 kullanıcının karolarıyla çizilir (I için turkuaz üretildi), "göz yormasın" ayarı (doygunluk 0,88, kontrast 0,86, parlaklık 0,95), 8,6 MB → ~100 KB WebP                                                                                           | `docs/NS4-32-CYCLAMEN-BLOCK-ART.md`          | **commit yok** |
| NS4-33 | Organik sinüs duvarları: her odanın kendi duvar şekli (yanak mağara, gözler arası petek, alın kubbe/huni, kafa tabanı sırt), oda açıldıkça geri çekilir; ızgara duvarların üstünde                                                                                              | `docs/NS4-33-ORGANIC-SINUS-WALLS.md`         | **commit yok** |
| NS4-34 | Parça başına tek sıklamen (yılan oyunu parçalarıyla): sap 4 bloğu dolaşır, uçta parça renginde çiçek, yaprak, tomurcuk/sivri uç; karolar çiçeksiz düz jöle; satır silinince sap kopar                                                                                           | `docs/NS4-34-ONE-CYCLAMEN-PER-PIECE.md`      | **commit yok** |
| NS4-35 | ~~Dik sıklamen çiçeği~~ (NS4-36 ile değişti): yılanın yayvan çiçeği yerine çizimle üretilen, yukarı kalkık 5 taç yapraklı çiçek (dipte koyu göz, yeşil çanak) ve sarmal çizgili tomurcuk; parça renginde, hücreyi boydan doldurur                                               | `docs/NS4-35-UPRIGHT-CYCLAMEN-FLOWER.md`     | **commit yok** |
| NS4-36 | Karo çiçeğiyle bitki: her parçanın çiçeği kendi renk karosundaki çiçek, tomurcuk onun kapalı hâli, karodaki kalp yapraklar (çok karolu matlama), ince bordo sap ve sivri uç                                                                                                     | `docs/NS4-36-TILE-FLOWER-PLANT.md`           | **commit yok** |
| NS4-37 | Sıklamen özütü sıvısı: bitişte ekranda kalma hatası düzeltildi (sönme anim yuvasından ayrıldı; oda açılışı araya girse de söner); sıvı yeniden çizildi (pürüzsüz renk geçişi, iki katmanlı dalgalı yüzey, parlak yüzey çizgisi)                                                 | `docs/NS4-37-CYCLAMEN-LIQUID-FIX.md`         | **commit yok** |
| NS4-38 | Gizemli Sıradaki: tek parça, siyah "?" kartı dönüp açılır (sentez kasa çarkı tıkı + çan, hızlı oyunda kısa sürüm); skor sayarak artar + "+N"; tıkanıklık kartı (yüzde, durum, renkli çubuk)                                                                                     | `docs/NS4-38-MYSTERY-NEXT-AND-HUD-FOCUS.md`  | **commit yok** |
| NS4-39 | Müzik: menü/mola/oyun sonu "Bahçe", oyun içi "Nefes" (sentez, pentatonik, motif tabanlı, davulsuz); Ayarlar: Müzik + düzey, Menü ve mola müziği, Efektler + düzey; "?" beklemesi seviyeyle kısalır (380 → 160 ms)                                                               | `docs/NS4-39-MUSIC-AND-AUDIO-SETTINGS.md`    | **commit yok** |
| NS4-40 | Enerjik ve uyarlanan oyun müziği: ferah (Do majör groove, yumuşak davul) → orta (16'lık shaker, arpej) → tikali (%70+: La minör gerilim, kalp atışı kick, sürüklenen bas, melodi susar); rahatlamada nakarata dönüş; 24 ölçülük döngü, oda başına ton, seviyeyle tempo          | `docs/NS4-40-ADAPTIVE-GAME-MUSIC.md`         | **commit yok** |
| NS4-41 | Ayarlar yalnızca Ses (Oynanış / İleri ayarlar kaldırıldı; değerleri varsayılanda sabit); ana menü ortalı ve sakin (hale, rekor çipi, ikonlu 3 karo, opak arka plan); HUD: yumuşak cam paneller, turkuaz büyük harf başlıklar, açık metre izi, hafif hazır parıltısı, kısa toast | `docs/NS4-41-SETTINGS-TRIM-AND-UI-POLISH.md` | **commit yok** |
| NS4-42 | Oda açılınca / Tam Ferahlık'ta tıkanıklık göstergesi animasyonla %0'a iner (geri sayım, turkuaz boşalma, ışık kayması, "Ferah" zıplaması), geçiş boyunca %0'da kalır, yeni odada yavaş dolar; vinyet ve müzik de birlikte ferahlar                                              | `docs/NS4-42-CONGESTION-DRAIN-ANIMATION.md`  | **commit yok** |
| NS4-43 | Sade dil: Drenaj → Satır, Nefes sv. → Seviye, Ozmotik/Nörorefleks etki → "Dört satır birden!" / "Usta hamle!", mukus → tıkanıklık/salgın; rozetler Tetris/T-spin/Kombo ustası; sağlık ipuçları tıbbi terimsiz (anlam aynı, inceleme bekliyor)                                   | `docs/NS4-43-PLAIN-LANGUAGE.md`              | **commit yok** |

Durum: `npm run check` temiz (typecheck, lint, format, 741 test, build). NS4-22, NS4-30 ve NS4-31 çalışma ağacında; kullanıcı onayıyla commit edilecek.

Kullanıcı geri bildirimi (2026-10-26): "Bulut mantığını herkes anlayabilir mi? Oynanış hep düz ilerliyor." Seçilenler: bulutçukları sadeleştir (NS4-30) ve sinüs haritası + final (NS4-31). Seçilmeyenler (ileride yeniden sorulabilir): odaya özgü kurallar; süre/parça sınırı + yıldız; sıklamen tohumunu öne çekmek (zaten sıradaki görev).

## 3. Şimdi yapılacaklar (sırayla)

1. **Commit:** kullanıcı onayıyla `feat(ns4-22)`, `feat(ns4-30)`, `feat(ns4-31)`. Dosyalar iç içe (events.ts, hud.ts, styles.css, index.html, testler): ayırmak zorsa tek commit, her göreve bir paragraf. Önceki dört görev commit edildi (bkz. 2. bölüm).

2. **Cihaz testi (kullanıcı):** telefonda kulaklık/hoparlörle bir oyun.
   - Boğukluğun dozu (`MUFFLE_CLOSED_HZ`, `src/audio/SoundManager.ts`).
   - Hapşırık ve "Sinüs açıldı" sesleri.
   - Android'de titreşimler.
   - Odaların zorluğu (`ROOMS` sıra / kanal / ek boşluk, `src/config/gameConfig.ts`). NS4-30 sonrası 1. oda kasıtlı olarak kolay.
   - NS4-31: harita kartı okunuyor mu (geçiş 2,4 sn, `CFG.roomClearMs`)? Final ekranı: `__fn.ui.final()`; kart: `__fn.ui.roomMap(0)`.
   - NS4-22 açılma anı: "ahh" sesi ve süzgecin açık kalma süresi (`OPEN_HOLD`, `SoundManager.ts`), yaprak sayısı ve boyutu (`RELIEF_FX`, `PETALS`, `effects.ts`). Geliştirmede `__fn.fx.relief('allclear')` ve `__fn.sfx.play('allclear')` ile denenebilir.
3. **Yayın öncesi teknik:**
   - Supabase `submit-score` Edge Function yeniden dağıtılmalı (`scoreRules.ts`: hapşırık adları, oda bonusu ve Tam Ferahlık bonusu sınırı).
   - Etiket yöneticisi (GTM vb.) olay adları güncellenmeli:
     - yeni: `sneeze_available`, `room_start`, `room_clear`, `all_clear`, `final_choice`;
     - kaldırılan: `synthetic_available`, `rebound_started`;
     - değişen: `powerup_use.kind` `'hapsirik'`; `game_over` alanlarına `sneeze_uses`, `rooms_cleared`, `all_clears`; `game_over.reason` yeni değer `'complete'`; rozet kimliği `'dogal'` yerine `'hapsu'`.
4. **Medikal/hukuki inceleme listesine eklenecek yeni metinler:**
   - "Sinüs açıldı! / … ferahladı";
   - oda adları (anatomi);
   - "Hapşırık", "HAPŞUU! / Çok yaşa!", "Burnun yine kaşınıyor…";
   - Nasıl oynanır'daki oda, hapşırık ve Tam Ferahlık maddeleri;
   - "Tam Ferahlık! / Tahta tertemiz" (NS4-22);
   - "Parlayan boşlukları doldur, bulutçukları uçur", "Bulutçuk uçtu! Hepsini uçur, sinüs açılsın.", "%… açık" (NS4-30);
   - harita kartı ("Sıradaki: …", "Sırada: final"), final ekranı ve "Bitir" sonrası oyun sonu başlığı "Bütün sinüsler açık!" (NS4-31).

   Kayıt: `src/content/health.ts`; denetim: `docs/NS4-19-CONTENT-SAFETY-AUDIT.md`.

## 4. Bekleyen kararlar (kullanıcıya sorulacak)

- **Odalar:** süre veya parça sınırı ve yıldız sistemi. Kullanıcı "sonra düşünürüz" dedi; NS4-31 tartışmasında da seçmedi. Varsayılan olarak yok.
- **Odaya özgü kurallar** (ör. basınç dalgası, buğulu üst kısım, son nefes sayacı): NS4-31 tartışmasında seçilmedi; cihaz testinden sonra tempo hâlâ düz gelirse yeniden önerilebilir.
- **Oyun sonu:** ulaşılan oda, oyun sonu ekranında ve skor tablosunda gösterilsin mi (yerel kayıt ve Supabase şeması etkilenir)?
- ~~**Odalar arası:**~~ karar verildi (2026-10-26): oda geçişinde tahta tamamen temizlenir ("ferahlama patlar").

## 5. İleriki plan

### Faz A, "His" (tamamlandı)

- ~~**NS4-22 · Büyük açılma anı**~~: yapıldı (`docs/NS4-22-BIG-RELIEF-MOMENT.md`). Yaprak havuzu (`GameView.petals`, `spawnPetal`) NS4-23'teki Çiçeklenme'de yeniden kullanılabilir.

### Faz B, Sıklamen (oyunun kimliği)

- **NS4-23 · Sıklamen tohumu ve Çiçek Ölçeri** (onaylandı):
  - Bazı parçalarda sıklamen tohumu hücresi gelir. Tohum bir satır temizlemesine katılınca açar ve ölçeri doldurur.
  - Ölçer dolunca oyuncu tekrar tekrar kullanılabilen bir "Çiçeklenme" tetikler: alttan pembe dalga, bulutçuklar yaprağa dönüşür, puan çarpanı.
  - Bugünkü tek kullanımlık "Sıklamen özütü" butonunun yerini alır.
  - Dil: "özüt", "ozmotik" yerine çiçek gücü. Tedavi iddiası yok.
  - Mevcut sıklamen dalga efekti (`GameView` 'cyc') yeniden kullanılabilir.

### Faz C, Tekrar oynanma ve skor tablosu

- **NS4-25 · Tohumlu rastgelelik ve modlar:**
  - Deterministik 7'li torba, oda delikleri ve hapşırık için tohumlu rastgele sayı üreteci.
  - Modlar: "Günlük Nefes" (herkes aynı tohum, günlük tablo), "3 Dakika Ferahlık" (süreli) ve "Rahat mod" (yavaş, oyun bitmez, tabloya girmez; çocuklar ve yaşlılar için).
- **NS4-26 · Skor tablosu 2.0:**
  - Günlük / Haftalık / Tüm zamanlar sekmeleri ve "benim sıram ve çevremdekiler".
  - Türkçe uygunsuz kelime filtresi; tek dokunuşla eğlenceli rastgele takma ad ("Ferah Kirpi 42"; KVKK açısından da iyi).
  - Hamle kaydı ve tohumla sunucuda doğrulamaya hazırlık.
- **NS4-28 · Paylaşım kartı:** sıklamen görselli skor kartı (PNG), sosyal medyada yayılma için.

### Faz D, Yayın

- **NS4-29 · İçerik ve hukuk geçişi:**
  - Sağlık metinlerinin yeniden yazımı ve onayı (`approval: 'approved'` + `source`).
  - Tıbbi uyarının Mola ve Oyun sonu ekranlarında da gösterilmesi.
  - Nasodren'in Türkiye'deki reçete durumu ve tanıtım kurallarının netleştirilmesi.
  - "Mukus" kelimesinin her yaşa uygun bir dille değiştirilmesi ("Düşen bloklar biriken mukus", "Mukus daha hızlı birikiyor").
  - CTA hedef sitesinin (yasasinsaglik.com) içeriğinin doğrulanması.

## 6. Çalışma kuralları (devam ederken uyulacak)

- **Renkli tetromino blokları kullanıcının onayı olmadan değiştirilmez.** NS4-14'teki değişiklik beğenilmemiş, NS4-15'te geri alınmıştı. NS4-32'de (2026-10-27) kullanıcının isteği ve kendi sıklamen görselleriyle değişti (`docs/NS4-32-CYCLAMEN-BLOCK-ART.md`). NS4-34'te karolar çiçeksiz oldu ve her parça tek bir sıklamen bitkisi taşıyor (`docs/NS4-34-ONE-CYCLAMEN-PER-PIECE.md`). Görsel ayarları `tools/blocks/` içinde. `tests/rendering/textures.test.ts` hem görsel karoları hem yedek jöle çizimini sabitler.
- **Her görev:** `NS4-xx` numarası, `docs/NS4-xx-*.md` raporu ve testleri; bitişte `npm run check`.
- **Renkler** yalnızca `src/styles.css` `:root` tokenı olarak tanımlanır (tema testi). Görünür metin değişirse `tests/helpers/inventory.ts` ve içerik güvenliği testi bilinçli olarak güncellenir.
- **Motor ve testler:**
  - `Game.reset()` boş tahta üretir; oda akışı yalnızca `reset({ rooms: true })` ile açılır.
  - Arayüz test yardımcıları (`createAppStubs`, `loadUi`) varsayılan olarak odaları kapalı çalıştırır; oda testleri `rooms = true` verir.
- **Görsel doğrulama:**
  - `npx vite --port 5199` ile geliştirme sunucusu açılır.
  - `playwright-core@1.48.2` ile `channel: 'msedge'` (headless Edge) kullanılır; scratchpad'e kurulur, projeye bağımlılık eklenmez.
  - Geliştirme ortamında `window.__fn = { game, view, app }` erişilebilir.
  - İş bitince 5199 portundaki Vite süreci kapatılır.

## 7. Yeni oturumda başlangıç

1. Bu dosyayı ve `git status` çıktısını oku.
2. Kullanıcıya sor: NS4-22 commit edilsin mi (bkz. 3.1), sıradaki görev NS4-23 (Sıklamen tohumu ve Çiçek Ölçeri) mi? Bekleyen kararları (4. bölüm) hatırlat.
3. Cihaz testinden gelen geri bildirim varsa (ses dozu, zorluk) önce onları uygula.
