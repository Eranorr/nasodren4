# NS4-40 · Enerjik ve uyarlanan oyun müziği (fazlar)

Tarih: 2026-10-29 · Durum: uygulandı, **commit yok**

## İstek

- Oyun içi müzik daha enerjik ve eğlenceli olsun.
- Uzun süre çalınca can sıkmasın.
- Fazları olsun: tıkanıklık çok artınca (kaybetmeye yakın) müzik başka bir biçime bürünsün.

## Yapılanlar

### Fazlar (uyarlanan müzik)

Tıkanıklık her karede `Sound.setCongestion` ile okunur. Faz ise ölçü başında değişir, böylece geçişler müzikal olur.

| Faz        | Ne zaman                       | Müzik                                                                                                                                                                       |
| ---------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ferah**  | tıkanıklık < %35               | Do majör I–V–vi–IV (Domaj7 · Sol6 · Lam7 · Famaj7), zıplayan senkoplu bas, yumuşak kick, parmak şıklatma, ara vuruşta shaker, marimba melodisi                              |
| **orta**   | %35 ve üstü                    | Aynı akorlar; 16'lık shaker, sekizlik arpej, ek kick vuruşu: enerji ve baskı yükselir                                                                                       |
| **tikali** | %70 ve üstü (kaybetmeye yakın) | Biçim değişir: La minör Lam–Fa–Rem–**Mi** (gerilim), kalp atışı kick (lub-dub), sürüklenen 8'lik bas, gergin 16'lık arpej (yönü 4 ölçüde bir döner), melodi susar, tempo +6 |

- **Gecikmeli eşikler:** aşağı inişte %28 ve %60 kullanılır, sınırda müzik gidip gelmez.
- **Geçiş süsleri:**
  - gerilime girerken derin ve yumuşak bir "dum";
  - tıkanıklık düşünce yükselen neşeli bir arpej, ardından doğrudan **nakarat** (oyuncuya ödül hissi).
- Tıkanıklık süzgeci (NS4-20) sürüyor: gergin fazda tizler zaten boğuk, bas ve kalp atışı öne çıkıyor.

### Uzun oyunda can sıkmasın diye

- **24 ölçülük döngü** (ferah/orta):
  - giriş (8 ölçü): davul ve bas, melodi yok;
  - nakarat (8 ölçü): melodi;
  - ara (4 ölçü): davul yok, uzun bas, kısık melodi;
  - yükseliş (4 ölçü): dört vuruşlu kick, 16'lık shaker, son ölçüde şıklatma dolgusu.

  Doku yaklaşık 50 saniyede bir değişiyor.

- **Her sinüs odasında ton değişiyor** (yarım ses: 0, +2, −2, +3, +1). Melodi oyun seslerinin altında kalsın diye kayma küçük tutuldu.
- **Tempo seviyeyle hafifçe artıyor:** 108 BPM'den başlıyor, seviye başına +1,5. 10. seviyede (123,5) duruyor; gergin fazda +6.
- **Melodi:**
  - motifleri her 8 ölçüde yenileniyor (A · A' · B · nefes);
  - pentatonik ve sıçramasız;
  - en tiz notası ~930 Hz (oda tonu dahil).
- **Davullar yumuşak:**
  - kick: perdesi hızla düşen kısa sinüs, gümleme yok;
  - shaker: bant geçiren gürültü, sert hi-hat yok, hafif swing.

  Müzik düzeyi önceki gibi oyun seslerinin altında.

## Teknik

- **`src/audio/music.ts` (saf):**
  - `planBar()` her ölçünün planını üretir: pad, bas, melodi, arpej, kick, şıklatma, shaker, süs;
  - yardımcılar: `gamePhase()` (gecikmeli eşik), `tempoFor()`, `sectionAt()`, `ROOM_TRANSPOSE`;
  - menü parçası ("Bahçe") aynı planlayıcıdan, davulsuz.
- **`src/audio/SoundManager.ts`:**
  - ızgara 16'lık;
  - ölçü başında faz, seviye ve oda okunur;
  - `renderBarStart` / `renderStep` planı çalar;
  - `setMusicContext(level, room)` eklendi, `musicPhase` getter'ı eklendi.
- **`src/app/bootstrap.ts`:** oynarken her karede `setMusicContext(game.level, game.room)` çağrılır.
- **Testler:**
  - `tests/audio/music.test.ts`: faz eşikleri, tempo, döngü, ölçü planları (ferah, orta, tikali, menü), geçiş süsleri, oda tonu, motor seviyesinde faz izleme;
  - `npm run check` temiz: 841 test, build.

## Dinleme örnekleri

Headless Edge'de oyunun gerçek ses çıkışı kaydedildi. Kayıt sırasında oyun donduruldu ve tıkanıklık elle ayarlandı. Kayıtlar dinlemek için +15 dB yükseltildi; oyun içi miks değişmedi. Örnekler oturumun scratchpad klasöründe:

- `1-menu-bahce.webm` (22 sn);
- `2-oyun-ferah.webm` (45 sn: giriş, nakarat, ara başlangıcı);
- `3-oyun-orta.webm` (18 sn);
- `4-oyun-tikali-ve-rahatlama.webm` (30 sn): 3. sn'de %80 tıkanıklık (gerilim), 22. sn'de düşüş (rahatlama ve nakarat).

## Cihazda denenecekler ve ayar yerleri

- **Enerji:**
  - tempo: `TRACKS.game.bpm` ve `tempoFor`;
  - davul kazançları: `planBar` içindeki `gain` değerleri.
- **Gerilimin dozu:** tikali fazının kick, bas ve arpej kazançları; tempo artışı (+6).
- **Uzun oyun:** 10 dakika ve üstü oyunda sıkıyor mu? Döngü uzunluğu `sectionAt` içinde.
- **Genel düzey:** oyun müziği hâlâ efektlerin altında. Daha öne çıksın istenirse `TRACKS.game.level` (0,26) artırılır.
