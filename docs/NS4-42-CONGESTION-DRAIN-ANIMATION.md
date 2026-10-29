# NS4-42 · Oda açılınca tıkanıklık göstergesinin animasyonla sıfırlanması

Tarih: 2026-10-29 · Durum: uygulandı, **commit yok**

## İstek

Tıkanıklık sıfırlanıp bölüm (oda) kazanılırken, sağdaki tıkanıklık göstergesinin çubuğu güzel bir animasyonla sıfırlansın.

## Sorun

- Oda açılınca tahtada kalan bloklar "Sinüs açıldı" geçişi (2,4 sn) boyunca durur; tahta yeni odaya geçerken silinir.
- Bu yüzden gösterge geçiş boyunca eski değerde (ör. %75) kalıyordu.
- Ardından gösterge yeni odanın değerine birden atlıyordu; "sıfırlanma" anı hiç görünmüyordu.

## Yapılanlar

**Boşalma** (oda açıldı ya da Tam Ferahlık; `drainCongestion`, `src/ui/hud.ts`):

- 1,2 sn içinde yumuşak bir eğriyle (ease-in-out) olur:
  - yüzde geri sayar (%75 → %0);
  - tıkanıklık kartının çubuğu ve tahtanın yanındaki metre birlikte boşalır;
  - renk turkuaza döner;
  - çubuk üzerinde boşalma yönünde (sağdan sola) iki kez ışık kayar;
  - çubuk ve metre kısa süre turkuaz bir hale ile parlar.
- %0'a inince sayı ve "FERAH" hafifçe zıplar.
- **Bekleme:** gösterge oda geçişi boyunca %0'da kalır (harita kartı süresince).
- **Dolma:** yeni odaya girince gerçek değere yavaşça dolar (0,9 sn).
- **Birlikte ferahlayanlar:** nefes halkası, basınç ve tehlike vinyetleri, müzik süzgeci ve müzik fazı da gösterilen değeri izler (`shownCongestion`). Ekran, ses ve müzik birlikte ferahlar; gergin müzik fazından neşeli rahatlama geçişine dönülür.
- **Hareketi azalt:** ışık kayması, hale ve zıplama kapalı; değer yine sayarak iner.

## Dosyalar

- `src/ui/hud.ts` (`drainCongestion`, `shownCongestion`, `CONG_DRAIN_MS`, `CONG_REFILL_MS`);
- `src/app/events.ts` (`roomclear` ve `allclear` olaylarında);
- `src/app/bootstrap.ts` (müzik gösterilen değeri izler);
- `src/styles.css` (`.drain`, `.done`, `.refill`).

**Testler:**

- `tests/ui/rooms.test.ts`: geri sayım, %0'da kalma, "Ferah", vinyet kapalı, yeni odada dolma;
- `tests/helpers/fakeDom.ts`.

## Doğrulama

- `npm run check` temiz: 844 test, build.
- Headless Edge'de oda açılışı kare kare görüntülendi (1440×900 ve 390×844): %75 kırmızı → turkuaz boşalma → "%0 · FERAH" → yeni odada %30.
