# Ferah Nefes · Yol haritası ve devam notu

Son güncelleme: 2026-10-26. Bu dosya, bir sonraki oturumda kaldığımız yerden devam etmek içindir. Yeni oturumda önce bu dosya, sonra aşağıda adı geçen `docs/NS4-*.md` raporları okunmalı.

## 1. Vizyon (kısa)

- **Öne çıkan öğe:** sıklamen. Fantezi bir "çiçek gücü" olarak gösterilir; gerçek bir tedavi etkisi ima etmez.
- **His:** sinüzitin içindeymiş gibi, ama iğrenç değil. Basınç ve boğukluk ses, ışık ve nefesle verilir. Islak görüntü veya ses, "sümük" kelimesi, yeşil-sarı/kahverengi tonlar yok.
- **Ana deneyim:** "sinüs açıyoruz". Temizledikçe ses berraklaşır, hava akar, bulutçuklar gülümseyip uçar.
- **Kitle ve yapı:** her yaşa uygun, kısa oturumlu, skor tablolu bir reklam oyunu (Tetris tabanlı).

## 2. Şu ana kadar yapılanlar (commit edilmedi)

| Görev  | Özet                                                                                                                                                                                      | Rapor                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| NS4-20 | Tıkanıklıkla boğuklaşan müzik, nefes halkası, leylak basınç vinyeti                                                                                                                       | `docs/NS4-20-CONGESTION-ATMOSPHERE.md`   |
| NS4-24 | Sentetik açıcı ve rebound kaldırıldı. Yerine "Hapşırık!": %35 tıkanıklıkta açılır, üst 3 sırayı savurur, 20 blokta yeniden dolar, cezası yok                                              | `docs/NS4-24-SNEEZE-POWER.md`            |
| NS4-21 | Sinüs boşluğu görünümü: derin zemin, yumuşak duvar, hava ağzı, hava kabarcıkları, gri bloklara yüz. **Renkli bloklar değişmedi**                                                          | `docs/NS4-21-SINUS-CAVITY-ATMOSPHERE.md` |
| NS4-27 | Sinüs Odaları: 4 oda (Yanak %20 → Gözler arası %30 → Alın %40 → Kafa tabanı %50), geçme şartı bütün gri bulutçukları temizlemek, oda bonusu, odaya özgü ton, sonra sonsuz "Serbest nefes" | `docs/NS4-27-SINUS-ROOMS.md`             |

Durum: `npm run check` temiz (typecheck, lint, format, 695 test, build). Değişiklikler çalışma ağacında; hiçbiri commit edilmedi. `package.json` içindeki `dev:mobile` satırı da commit bekliyor.

## 3. Şimdi yapılacaklar (sırayla)

1. **Commit:** Kullanıcı onayıyla, görev başına ayrı commit:
   - `feat(ns4-20)`, `feat(ns4-24)`, `feat(ns4-21)`, `feat(ns4-27)`;
   - `dev:mobile` satırı için `chore`.

   Dosyalar iç içe geçtiği için (`hud.ts`, `styles.css`, `GameView.ts`, testler) ayırmak zorsa tek commit ve her göreve bir mesaj paragrafı.

2. **Cihaz testi (kullanıcı):** telefonda kulaklık/hoparlörle bir oyun.
   - Boğukluğun dozu (`MUFFLE_CLOSED_HZ`, `src/audio/SoundManager.ts`).
   - Hapşırık ve "Sinüs açıldı" sesleri.
   - Android'de titreşimler.
   - Odaların zorluğu (`ROOMS` sıra/boşluk, `src/config/gameConfig.ts`).
3. **Yayın öncesi teknik:**
   - Supabase `submit-score` Edge Function yeniden dağıtılmalı (`scoreRules.ts`: hapşırık adları ve oda bonusu sınırı).
   - Etiket yöneticisi (GTM vb.) olay adları güncellenmeli:
     - yeni: `sneeze_available`, `room_start`, `room_clear`;
     - kaldırılan: `synthetic_available`, `rebound_started`;
     - değişen: `powerup_use.kind` `'hapsirik'`; `game_over` alanlarına `sneeze_uses`, `rooms_cleared`; rozet kimliği `'dogal'` yerine `'hapsu'`.
4. **Medikal/hukuki inceleme listesine eklenecek yeni metinler:**
   - "Sinüs açıldı! / … ferahladı";
   - oda adları (anatomi);
   - "Hapşırık", "HAPŞUU! / Çok yaşa!", "Burnun yine kaşınıyor…";
   - Nasıl oynanır'daki oda ve hapşırık maddeleri.

   Kayıt: `src/content/health.ts`; denetim: `docs/NS4-19-CONTENT-SAFETY-AUDIT.md`.

## 4. Bekleyen kararlar (kullanıcıya sorulacak)

- **Odalar:** süre veya parça sınırı ve yıldız sistemi. Kullanıcı "sonra düşünürüz" dedi; varsayılan olarak yok.
- **Oyun sonu:** ulaşılan oda, oyun sonu ekranında ve skor tablosunda gösterilsin mi (yerel kayıt ve Supabase şeması etkilenir)?
- **Odalar arası:** oda geçişinde oyuncunun kendi renkli blokları da siliniyor (temiz tahta). Bu böyle mi kalsın?

## 5. İleriki plan

### Faz A, "His" (devam)

- **NS4-22 · Büyük açılma anı:** 4 satır, tahtanın tamamen boşalması ("Tam Ferahlık" + bonus) ve oda açılışında daha güçlü bir an. Müzik süzgeci bir anda açılır, sentez "ahh" nefesi, ekran parlar, serin turkuaz parıltılar ve sıklamen yaprakları. Mevcut `onRoomClear`/`Sound.roomClear` bunun temeli.

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

- **Renkli tetromino bloklarının çizimi değiştirilmez.** NS4-14 değişikliği beğenilmemiş ve NS4-15'te geri alınmıştı. `tests/rendering/textures.test.ts` 1–7. sütunların parmak izini sabitler. His; çerçeve, zemin, efekt ve ses ile verilir.
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
2. Kullanıcıya sor: önce commit mi (bkz. 3.1), yoksa sıradaki görev mi (önerilen sıra NS4-22 → NS4-23)? Bekleyen kararları (4. bölüm) hatırlat.
3. Cihaz testinden gelen geri bildirim varsa (ses dozu, zorluk) önce onları uygula.
