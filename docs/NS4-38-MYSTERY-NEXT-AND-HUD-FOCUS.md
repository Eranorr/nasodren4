# NS4-38 · Gizemli "Sıradaki" ve öne çıkan skor / tıkanıklık

Tarih: 2026-10-29 · Durum: uygulandı, **commit yok**

## İstek

- Sıradaki parçalardan yalnızca biri görünsün.
- O parça önce siyah zeminli, beyaz "?" işaretli bir kartla gelsin (oyunlarda henüz bulunmamış eşya kartı gibi), sonra açılsın.
- Açılırken dikkat dağıtmayan küçük bir ses çalsın: CS2 kasa açma sesinin yumuşatılmış hâli.
- Tıkanıklık oranı ve skor daha çok göz önünde olsun.

## Yapılanlar

### Tek parça ve "?" kartı

- `Sıradaki` paneli tek parça gösteriyor (önceden portrede 2, yatayda 5 parça vardı). Panel, Beklet paneliyle aynı ölçüde.
- Sıraya yeni bir parça girince parça gizlenir ve siyah bir "?" kartı görünür. Kartın üzerinden ince bir ışık geçer ve "?" hafifçe nabız atar.
- Zaman çizelgesi (`src/ui/nextReveal.ts`, `REVEAL`):
  - 380 ms kart kapalı kalır;
  - 100 ms kart yatayda dönüp kapanır;
  - 100 ms parça hafifçe taşarak açılır.
- **Hızlı oyun:** önceki açılıştan 900 ms geçmeden yeni parça gelirse kısa sürüm oynar. Kart 110 ms kalır, tık çalmaz, çan daha kısıktır.
- **Beklet:** Beklet ile takas yeniden açılış başlatmaz. Boş Beklet'e parça koymak kuyruktan yeni parça çeker; bu durumda yeni parça "?" ile gelir.
- **Oda geçişi:** kuyruğa geri dönen parça hemen gösterilir.
- **Oyun sonu:** sürmekte olan açılış hemen tamamlanır.
- **Hareketi azalt:** kart dönmek yerine söner, parça ölçeklenmeden belirir; nabız ve parlama kapalıdır.
- **Kural değişikliği yok:** parça kuyrukta zaten bellidir; yalnızca gösterimi gecikir. `Game.dealt` sayacı yeni parçayı tanımak için eklendi. Bu sayaç yalnızca artar; oda geçişinde parça kuyruğa döndüğünde bir azalır.

### Ses (`SoundManager.revealTick` / `revealChime`)

- CS2'nin ses dosyası kullanılmadı. Dosya Valve'a ait ve lisanssız kullanılamaz. Bunun yerine aynı his WebAudio ile sentezlendi:
  - **Çark tıkları:** dört yumuşak plastik "tık" çalar. Her tık dar bantlı gürültü ile kısa bir üçgen tonun birleşimidir. Tıklar arasındaki aralık uzar (0, 70, 160 ve 280 ms), yani çark yavaşlıyormuş gibi duyulur. Her tık bir öncekinden biraz pes ve kısıktır.
  - **Çan:** kart açılınca iki sinüs kısmisinden (E6 ve B6) oluşan kısa bir çan çalar.
- Ses her parçada çaldığı için seviyesi hareket sesi düzeyinde tutuldu (`REVEAL_TICK_GAIN` 0,02, `REVEAL_CHIME_GAIN` 0,022). Tekrar yorgunluğunu azaltmak için perde ±%3 rastgele değişir.
- Ses ayarı kapalıysa çalmaz.
- Lisanslı bir örnek ses alınırsa yalnızca bu iki fonksiyon değiştirilir.

### Skor

- Büyük kazançlar (50 puan ve üstü) 420 ms içinde sayarak artar. Sayı sıklamen rengiyle hafifçe büyür ve yanında "+N" görünür. Birbirine yakın kazançlar aynı "+N" içinde toplanır.
- Yumuşak ve sert düşüş puanları hemen yazılır, böylece sürekli kıpırdama olmaz.
- Yatay düzende skor, "Skor" etiketli bir kart içinde ve 40 px boyutunda gösterilir.

### Tıkanıklık

- Yeni `#cong` kartında üç bilgi var:
  - yüzde (ör. "%65");
  - durum: Ferah, Artıyor veya Tıkalı!; eşikler nefes halkasıyla aynı (%35 ve %70);
  - renkli bir çubuk: turkuaz → turuncu → kırmızı. %70 ve üstünde çubuk nabız atar.
- Portrede kart üst şeritte skorun altında tek satırdır. Yatayda Sıradaki panelinin altında büyük bir karttır.
- Tahtanın yanındaki dikey metre, çevre görüşü için yerinde kaldı.
- Erişilebilir ad: "Tıkanıklık yüzde 65, Artıyor".

## Dosyalar

- **Mantık ve görünüm:**
  - `src/ui/nextReveal.ts` (yeni);
  - `src/ui/hud.ts`;
  - `src/rendering/GameView.ts` (`setNextReveal`, tek slot);
  - `src/rendering/layout.ts` ve `src/types/layout.ts` (`nextSlot`, `cong`);
  - `src/game/Game.ts` (`dealt`);
  - `src/app/bootstrap.ts`.
- **Ses:** `src/audio/SoundManager.ts`.
- **İşaretleme ve stil:** `index.html`, `src/styles.css` (yeni `--color-mystery-*` tokenları ve `--fs-hud-score-wide`).
- **Testler:**
  - `tests/ui/next-reveal.test.ts` (yeni);
  - `tests/ui/hud.test.ts`;
  - `tests/game/scaling.test.ts` (kartlar tahtaya, panellere ve butonlara binmez);
  - `tests/rendering/plants.test.ts`;
  - `tests/helpers/fakeDom.ts`.

## Doğrulama

- `npm run check` temiz: 809 test, build.
- Headless Edge'de ekran görüntüleri alındı: 390×844, 844×390, 1024×768 ve 1440×900. "?" kartı, açılmış parça, "+N" ve tıkanıklık kartı görüntülerde doğru.

## Cihazda denenecekler

- Tık ve çan seviyesi kulaklıkta ve hoparlörde nasıl duyuluyor? Ayar yeri: `REVEAL_TICK_GAIN` ve `REVEAL_CHIME_GAIN`.
- 380 ms bekleme, yüksek seviyelerde planlamayı zorlaştırıyor mu? Ayar yeri: `REVEAL.hideMs`.
