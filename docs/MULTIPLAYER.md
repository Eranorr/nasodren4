# Supabase: skor tablosu ve çok oyunculu (önek `tetris`) — güvenlik mimarisi

Sitedeki bütün oyunlar tek Supabase projesini paylaşır. Bu oyunun bütün nesneleri `tetris` önekini taşır.

## 1. Mimari özeti

| Parça                | Okuma                                                       | Yazma                                              |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Skor tablosu         | RPC `tetris_get_leaderboard` (anon)                         | Edge Function `tetris-submit-score` (service role) |
| Oda üyeliği          | Edge Function `tetris-room` (imzalı istek)                  | Edge Function `tetris-room` (service role)         |
| Oyun iletileri       | Realtime Broadcast, kanal `tetris:room:<uuid>`, imzalı zarf |                                                    |
| Hız sınırı sayaçları | —                                                           | RPC `tetris_rate_hit` (yalnızca service role)      |

- Tarayıcının hiçbir tabloya yazma ya da doğrudan okuma yetkisi yoktur (`anon` / `authenticated` yetkileri geri alındı, RLS zorunlu, tarayıcı politikası yok).
- Skor yolu Supabase SDK'sı kullanmaz (yalnızca `fetch`). SDK yalnızca "Çok oyunculu" açılınca dinamik import ile ayrı bir parça olarak yüklenir.
- Supabase ayarlı değilse ya da SDK parçası yüklenemezse tek oyunculu oyun ve yerel skorlar tam çalışır.

## 2. Skor yazımı (`tetris-submit-score`)

Akış:

1. CORS/Origin (`ALLOWED_ORIGINS`) kontrolü.
2. Yalnızca POST; yalnızca `application/json`; gövde en çok 2 KB.
3. Alan doğrulama: tam alan kümesi; takma ad; tamsayı aralıkları; `seviye = min(20, 1 + satır/10)`.
4. Süreye göre makullük: satır için en kısa süre ve cömert bir puan üst sınırı.
5. Kural seti yalnızca güncel kural seti (`sinus-attack-spray-v1`, docs/SINUS-ATTACK-AND-SPRAY-FINAL.md) olabilir. Kural seti değişince fonksiyon yeniden yayınlanmalıdır.
6. Hız sınırı: adres başına dakikada 6, saatte 60. Sayaç veritabanındadır; anahtar, adresin tuzlu özetidir.
7. Tekrar engeli: `gameId` tuzlu özeti (`game_hash`) benzersizdir. Aynı oyun ikinci kez gelirse 409 döner.
8. Satır eklenir ve kural setindeki sıra döner.

Hata yanıtları yalnızca kısa bir kod içerir (`invalid`, `duplicate`, `rate_limited`, `server`…). İç ayrıntı dönmez.

**Sınır (hile önleme değildir):** oyunda sunucunun yeniden oynatabileceği seed/replay kaydı yoktur. Değiştirilmiş bir istemci, makullük sınırları içinde kalan sahte bir skor gönderebilir. Sunucu yalnızca imkânsız değerleri, tekrarı ve seli engeller.

## 3. Çok oyunculu güvenlik modeli

- **Üyelik sunucuda:** `tetris-room` odayı kurar (4 karakterlik davet kodu + tahmin edilemez oda kimliği) ve katılımı verir.
  - Veritabanında satır kilidi vardır: en çok 3 etkin üye, renk benzersiz. Dördüncü oyuncu reddedilir; izleyici modu yoktur.
  - Nabzı 75 sn gelmeyen üye etkin sayılmaz (sekmesi kapanan oyuncunun yeri boşalır).
  - Katılım hız sınırlıdır: adres başına 10 dakikada 30.
- **Oyuncu anahtarı:** her oyuncu katılırken tarayıcıda bir ECDSA P-256 anahtar çifti üretir. Özel anahtar dışa aktarılamaz; açık anahtar sunucuya kaydedilir. Üye listesi, nabız ve ayrılma istekleri bu anahtarla imzalıdır (±60 sn).
- **Kanal:** Realtime kanalı public'tir ama adı yalnızca üyelere verilen oda kimliğinden türer (`tetris:room:<uuid>`). Kod tek başına kanala erişim vermez.
- **İleti zarfı:**
  - Alanlar: `{ v, room, round, player, seq, type, payload, sig }`.
  - Türler: `start`, `st`, `fin`, `away`.
  - Fazla ya da eksik alan ve bilinmeyen tür reddedilir. Zarf en çok 1024 karakterdir. Sayısal aralıklar denetlenir.
  - İmza, gönderenin sunucudaki açık anahtarıyla doğrulanır.
  - `seq` gönderen başına artmalıdır; her turun `round` kimliği yenidir.
  - Gönderen başına hız sınırı uygulanır (kova 30, saniyede 15; ara verme ayrıca 4 / 0,5 sn).
- **Ev sahibi:** etkin ve bağlı üyelerden en erken katılan; her istemci aynı listeden aynı sonucu bulur. Turu yalnızca o başlatabilir.
- **Otorite:** istemci otoritelidir. Her oyuncu kendi tahtasını ve skorunu bildirir; sunucu oyunu oynatmaz. Bu bir **eğlence modudur, güvenilir rekabet değildir**. Tur puanları yalnızca odada gösterilir; yerel listeye, rekora, rozetlere ve global tabloya hiçbir şey yazılmaz. Aynı tohum eşit başlangıç sağlar, hileyi önlemez.

### Tehdit modeli

| Tehdit                               | Koruma                                                                                            | Kalan risk                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Oda kodu tahmini                     | 29⁴ ≈ 707 bin kod; katılım adres başına 10 dk'da 30 ile sınırlı; boş oda kodu geçersiz            | Tahmin edilen dolu olmayan oda: tahmin eden 3. oyuncu olarak girebilir (kod davettir)                              |
| İzinsiz 4. oyuncu                    | Sunucuda satır kilidi + sayım; 409 `full`                                                         | Yok                                                                                                                |
| Aynı oyuncunun birden çok bağlantısı | Her katılım yeni kimlik + anahtar; Presence anahtarı = üye kimliği                                | Aynı kişi iki sekmeyle iki koltuk alabilir (3 sınırı içinde)                                                       |
| Aynı rengin iki oyuncuya verilmesi   | Renk sunucuda kilit altında, etkin üyeler arasında benzersiz                                      | Yok                                                                                                                |
| Ev sahibinin ayrılması               | Deterministik: sıradaki en erken katılan etkin ve bağlı üye                                       | Yok                                                                                                                |
| Ev sahibinin sahte `start` iletisi   | Yalnızca ev sahibinin imzalı `start`'ı; oyuncular üye olmalı                                      | Ev sahibi tohumu seçer (herkese aynı)                                                                              |
| Ev sahibi olmayanın `start` iletisi  | İmza + ev sahibi kontrolü: yok sayılır                                                            | Yok                                                                                                                |
| Sahte skor / durum / bitti           | İmza: oyuncu yalnızca kendi durumunu bildirebilir                                                 | Oyuncu kendi skorunu uydurabilir (istemci otoritesi; sonuç kalıcı değildir)                                        |
| Kimliğe bürünme                      | Zarftaki oyuncu kimliği imzalayan anahtarla eşleşmeli                                             | Yok                                                                                                                |
| Eski turun iletisi yeni turda        | Tur kimliği eşleşmeli                                                                             | Yok                                                                                                                |
| Tekrarlanan / sırası bozuk ileti     | Gönderen başına artan `seq`; eski ya da eşit olan atılır                                          | Yok                                                                                                                |
| Yeniden bağlanma sonrası hayalet     | Görünen = üye listesi ∩ bağlı; sunucu nabzı 75 sn                                                 | Kötü niyetli bir üye başkası adına Presence kaydı tutarak en çok 75 sn "bağlı" gösterebilir (imzalı iletisi olmaz) |
| Ara verme spam'i                     | Gönderen başına ayrı kova; yalnızca durum değişince bildirim                                      | Yok                                                                                                                |
| Büyük Broadcast yükü                 | Zarf en çok 1024 karakter, doğrulamadan önce reddedilir                                           | Realtime'ın kendi sınırlarına kadar ağ trafiği                                                                     |
| Çok hızlı ileti                      | Gönderen başına kova; Realtime istemci sınırı (20/sn)                                             | Üye olmayanın kanal adını bilmesi gerekir                                                                          |
| Takma ad içeriği (XSS)               | Sunucuda ve istemcide aynı kural (harf/rakam/boşluk/-_.); yalnızca `textContent`                  | Yok                                                                                                                |
| Başka odanın durumuna erişim         | Oda kimliği tahmin edilemez (UUID); zarftaki `room` eşleşmeli                                     | Public kanal: oda kimliğini öğrenen (ör. eski bir üye) yayını dinleyebilir                                         |
| Kanal temizliği                      | Ayrılınca `untrack` + `removeChannel`, bütün zamanlayıcılar ve nabız durur; sunucuda üyelik biter | Yok                                                                                                                |
| Sekme kapanması / görünürlük         | `pagehide` → ayrılma (keepalive); görünürlük kaybı mola = "ara verdi"                             | Ayrılma isteği ulaşmazsa koltuk 75 sn sonra boşalır                                                                |

Private kanal (Realtime Authorization) kullanılmadı: kimlik doğrulama gerektirir, projede anonim giriş kapalıdır ve ortak projenin auth ayarları değiştirilmedi. Bu yüzden kanalı dinleme koruması, oda kimliğinin gizliliğine dayanır.

## 4. Migration geçmişi

- `20261101000000_tetris_scores_baseline.sql`: canlıda SQL Editor ile elle uygulanan ilk kurulum (güvenli değil; olduğu gibi saklanır).
- `20261101120000_tetris_secure_scores_and_rooms.sql`: ileri yönlü güvenlik migration'ı. Veri silmez; geri alma notu içinde.
- `20261102000000_tetris_ruleset_v3.sql`: kural seti `cyclamen-flow-v3` (Sıklamen gücü 3 gri sıra); okuma RPC'sinin varsayılanı. Veri silmez. `tetris-submit-score` yeniden yayınlanmalıdır.
- `20261103000000_tetris_ruleset_sinus_attack_spray.sql`: kural seti `sinus-attack-spray-v1` (Sinüzit Atağı ve Spray kalıcı); okuma RPC'sinin varsayılanı. Veri silmez. `tetris-submit-score` yeniden yayınlanmalıdır (docs/SINUS-ATTACK-AND-SPRAY-FINAL.md, bölüm 9).
- Eski NS4-18 migration'ları (`leaderboard_scores`) canlıya hiç uygulanmadı (tablo projede yok). Git geçmişinde kalır; yeniden eklenmedi.
- Canlı projede CLI migration geçmişi yoksa, CLI ile çalışılmaya başlandığında bu iki sürüm `supabase migration repair --status applied <sürüm>` ile işaretlenmelidir.

## 5. Kurulum (panelden)

1. **SQL Editor:** `supabase/migrations/20261101120000_tetris_secure_scores_and_rooms.sql` dosyasının tamamını çalıştırın.
2. **Edge Functions → Secrets:**
   - `SCORE_HASH_PEPPER`: rastgele, en az 32 karakter.
   - `ALLOWED_ORIGINS`: yayındaki site origin'i ve geliştirme adresi, virgülle (ör. `https://site.pages.dev,http://localhost:5173`).
3. **Edge Functions → Deploy new function → Via Editor:** `tetris-submit-score` ve `tetris-room`.
   - İçerik: `node tools/bundle-functions.mjs` çıktısı (`supabase/.dashboard/<ad>.ts`).
   - **Verify JWT kapalı olmalı:** istemci publishable anahtar gönderir; işlevler kendi doğrulamasını yapar.
4. Kimlik bilgileri:
   - `.env.production` (commit edilir): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
   - Yerelde `.env.local` (Git'e girmez).
   - Eski `VITE_SUPABASE_ANON_KEY` adı yalnızca geçici uyumluluk için okunur.

`.env.production` değerlendirmesi: içindeki iki değer zaten her ziyaretçinin tarayıcısındaki pakette yer alır (gizli değildir); secret, service role, JWT secret veya veritabanı parolası içermez. Cloudflare Pages panelinde ortam değişkeni tanımlanarak bu dosya kaldırılabilir; ortak rehberle uyum için şimdilik tutuldu.

## 6. Test

- **Birim testleri gerçek projeye bağlanmaz** (`vitest.config.ts`: `envDir` boş bir klasörü gösterir).
  - `tests/leaderboard/edge.test.ts`: iki Edge Function işleyicisi, gerçek WebCrypto imzalarıyla.
  - `tests/leaderboard/migration.test.ts`: yetkiler, RLS, veri kaybı yok, secret hijyeni.
  - `tests/multiplayer/net.test.ts`: imza, kimliğe bürünme, tekrar/sıra, yanlış tur, büyük/fazla alanlı yük, hız sınırı, ev sahibi devri, yeniden bağlanma, temizlik.
- **Canlı doğrulama** (tarayıcı, yalnızca publishable anahtarla) iki kısımdır:
  - Yetki denemeleri: doğrudan INSERT/UPDATE/DELETE ve tablo okuma reddedilmeli; Edge Function geçersiz gövdeleri, tekrarı ve seli reddetmeli.
  - Oyun senaryosu: 2 ve 3 oyunculu oda.
  - Test satırları `ZZT` önekiyle oluşturulur ve sonda panelden silinir.

## 7. Canlı durum ve final yayın öncesi blokajlar

- **`ALLOWED_ORIGINS` henüz ayarlı değil** (canlı site adresi belli değil). Bu durumda işlevler her origin'den gelen tarayıcı isteğini kabul eder. Site adresi belli olunca Edge Functions → Secrets'ta `ALLOWED_ORIGINS` tam origin listesiyle güncellenmelidir (wildcard `*` kullanılmaz). Bu, final yayın öncesi **zorunlu** adımdır. Origin denetimi yalnızca tarayıcıları kısıtlar; tarayıcı dışı araçlar başlığı taklit edebilir (hız sınırı ve doğrulama yine geçerlidir).
- **Gözlenen geçici ağ sorunları (çözülmedi):**
  - REST isteklerinde Supabase önündeki katmandan iki kez **522**;
  - Node'dan bağlantı kurarken üç kez **bağlantı zaman aşımı** (`UND_ERR_CONNECT_TIMEOUT`);
  - önceki Realtime denemelerinde yeniden üretilemeyen iki **15 sn bekleme** zaman aşımı.

  Hepsi tekrar denemede geçti. Oyun 10 sn sonra vazgeçer ve yerel listeye düşer; çok oyunculu girişte "Sunucuya bağlanılamadı" gösterilir. Kök neden doğrulanmadı.

- **Migration geçmişi:** projede CLI migration kaydı yoktur; CLI'ya geçilirse iki sürüm `supabase migration repair` ile işaretlenmelidir (bölüm 4).
- **Hile sınırları:**
  - Global skor doğrulaması tam anti-cheat değildir (bölüm 2).
  - Çok oyunculu istemci otoriteli bir eğlence modudur, kalıcı rekabetçi sonuç üretmez (bölüm 3).
