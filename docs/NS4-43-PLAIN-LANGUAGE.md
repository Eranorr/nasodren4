# NS4-43 · Oyun metinlerinde sade dil

Tarih: 2026-10-29 · Durum: uygulandı, **commit yok**

## İstek

"Ozmotik etki", "nörorefleks etki" gibi anlaşılması güç kelimeler oyundan çıkarılsın. Yerlerine herkesin anlayabileceği, bugün yaygın kullanılan kelimeler gelsin.

## Değişen görünür metinler

| Yer                              | Eski                                                                       | Yeni                                                                                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HUD                              | Nefes sv. 1 · Drenaj 0                                                     | Seviye 1 · Satır 0                                                                                                                                                                 |
| Oyun sonu, final, skor tabloları | Drenaj                                                                     | Satır                                                                                                                                                                              |
| Satır popup'ı                    | Çift drenaj / Üçlü drenaj                                                  | Çift satır / Üçlü satır                                                                                                                                                            |
| Tetris popup'ı                   | TETRİS · Ozmotik etki: dört satır birden                                   | TETRİS · Dört satır birden!                                                                                                                                                        |
| T-spin popup'ı                   | T-spin … · Nörorefleks etki                                                | T-spin … · Usta hamle!                                                                                                                                                             |
| Sıklamen popup'ı                 | Sıklamen özütü · Ozmotik drenaj başladı                                    | Sıklamen özütü · Alt satırlar temizleniyor                                                                                                                                         |
| Seviye popup'ı                   | Nefes seviyesi 2 · Mukus daha hızlı birikiyor                              | Seviye 2 · Bloklar hızlanıyor                                                                                                                                                      |
| Rozetler                         | Ozmotik usta · Nörorefleks uzmanı · Akış hali; "İlk 4 satırlık drenaj" vb. | Tetris ustası · T-spin ustası · Kombo ustası; "İlk kez 4 satır birden", "T-spin ile ilk satır", "Toplam 100 satır"                                                                 |
| Öğretici                         | Drenaj · "Tam satır = drenaj…"                                             | Satır temizle · "Bir satırı baştan sona doldur: satır silinir, puan kazanırsın."                                                                                                   |
| Ana menü tanıtımı                | …tıkayan mukus bloklarını yerleştir, satırları boşalt…                     | …tıkayan blokları yerleştir, satırları temizle…                                                                                                                                    |
| Nasıl oynanır                    | "biriken mukus"; "Tam satır = drenaj… ozmotik etki… nörorefleks etki"      | "burnunda biriken tıkanıklık"; "Bir satırı tamamen doldurunca satır silinir. Dört satırı birden silersen TETRİS. T bloğunu döndürüp dar bir boşluğa sokarsan T-spin: ekstra puan." |

## Sağlık ipuçları (anlam ve iddia aynı; yalnızca dil sadeleşti)

| Eski başlık / terimler                                                         | Yeni                                                                                                      |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Paranazal sinüsler: maksiller, frontal, etmoid, sfenoid                        | **Sinüsler nerede?** yanaklarda, alında, gözlerin arasında, burnun en arkasında (kafa tabanında)          |
| mukoza zarı iltihaplanır, ostiumlar, koku kaybı                                | burnun ve sinüslerin iç yüzeyi şişer, sinüslerin ağzı tıkanabilir, koku almada azalma                     |
| Cyclamen europaeum L., Primulaceae, saponin, ekstre, ozmotik etki, mukus akışı | toprak altında yumrusu olan bir çiçek; yumrusundan elde edilen özüt; burundaki salgının daha kolay akması |
| Dekonjestan sprey, rinitis medikamentoza, prospektüs                           | burnu açan spreyler; kullanma talimatı                                                                    |
| Ne zaman hekime gitmeli? ateşle seyreden                                       | **Ne zaman doktora gitmeli?** ateşle birlikte olan                                                        |
| Sıvı tüketimi: yeterli sıvı almak, mukusun                                     | **Bol su iç:** bol su içmek, burundaki salgının                                                           |

## Bilerek değişmeyenler

- **Tıbbi uyarı:** "…hekiminize veya eczacınıza danışın" kalıplaşmış yasal ifade, aynen kaldı.
- **Yaygın oyun terimleri:** "T-spin", "Kombo", "TETRİS" kaldı.
- **Oyun içi adlar:** "Sıklamen özütü", "Hapşırık", "Tam Ferahlık" kaldı.
- **Kod kimlikleri:** rozet kimlikleri (`ozmotik`, `noro`), görsel efekt adları ve analitik olay adları değişmedi. Bunlar görünmez; değişselerdi kayıtlı rozetler ve analitik bozulurdu.

## İnceleme

Yeni metinlerin hepsi önceki gibi `review_required` (`src/content/health.ts`). Özellikle sıklamen ipucu aynı iddiayı ("…yardımcı olduğu bildirilmektedir") sade dille taşıyor; NS4-29 tıbbi/hukuki incelemede değerlendirilmeli.

## Dosyalar

- `index.html`;
- `src/app/events.ts`;
- `src/content/health.ts`, `src/content/badges.ts`;
- `src/tutorial/steps.ts`.

**Testler** (beklentiler yeni metinlere güncellendi):

- `tests/content/content-safety.test.ts`;
- `tests/ui/*` (feedback-wiring, start-screen, supporting-screens, audio-haptics, atmosphere, leaderboard-ui);
- `tests/tutorial/tutorial-ui.test.ts`;
- `tests/helpers/inventory.ts`.

`npm run check` temiz: 844 test, build.
