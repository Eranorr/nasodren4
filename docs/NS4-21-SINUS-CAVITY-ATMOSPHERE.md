# NS4-21 · Sinüs boşluğu atmosferi ve tıkanıklık bulutçuklarının yüzü

Faz A ("His") ikinci görev. Kullanıcı kararı: **renkli bloklar değişmez** (NS4-14 blok değişikliği beğenilmemiş ve NS4-15'te geri alınmıştı). Değişiklikler tahtanın çevresi, zemini, hava akışı ve yalnızca gri tıkanıklık bloğunun yüzüyle sınırlı.

## 1. Gri tıkanıklık bloğuna yüz (`src/rendering/textures.ts`)

- Atlas sütunu 8 (gri, `#8e93a6`) blok karosuna somurtkan, sevimli bir yüz: iki yuvarlak göz (beyaz parlak noktalı) ve aşağı kıvrık ağız. Hayalet karosuna çizilmez.
- Renkli bloklar (1-7) ve hayaletleri **birebir aynı**: `tests/rendering/textures.test.ts` artık 8. sütundan önceki bütün çizim komutlarının parmak izini sabitler. Bu parmak izi NS4-21 öncesi kodla üretildi (px 36 / 64 / 104 → 379 komut).
- **Nerede görünür:** NS4-24 ile rebound çöpü kaldırıldığı için gri hücreler oyun sırasında oluşmaz. Yüzler oyun sonunda yığın alttan yukarı griye dönerken görünür ("Sinüslerin tamamen tıkandı" anı somurtan bulutçuklarla). Oyun içinde gri hücre gerektiren bir mekanik (ör. temizlenince gülümseyip uçan bulutçuklar) ayrı bir karar konusudur.

## 2. Sinüs boşluğu görünümü (`src/styles.css`, `src/ui/hud.ts`)

- **Zemin derinliği:** düz koyu turkuaz yerine `radial-gradient` (açık merkez `--color-board-light` → `--color-board` → koyu kenar `--color-board-deep`) ve iç gölge. Izgara aynı.
- **Yumuşak sinüs duvarı:** çok katmanlı `box-shadow`: beyaz iç çizgi (`--color-rim-inner`), pastel turkuaz duvar (`--color-rim`) ve hafif pembe hale (`--color-rim-glow`). Köşe yarıçapı 10 → 14 px. Et/mukoza tonu yok (iğrenç algısından kaçınmak için).
- **Sinüs ağzı (ostium):** `#board-bg::after`, üst kenarın ortasında havanın çıktığı yumuşak açıklık (`pointer-events: none`).
- `applyHudLayout`: `background-size` üç katman için (`hücre, hücre, 100% 100%`); önceden tek değer bütün katmanlara uygulanıyordu.

## 3. Hava akışı (`src/rendering/GameView.ts`, `AIRFLOW` / `airflowRate` / `airflowSpeed`)

- Blokların ve hayaletin **arkasında** (`airLayer`, `boardC`'nin ilk çocuğu), kendi 28'lik havuzu; efekt parçacık havuzuna (420) dokunmaz, sahneye nesne eklemez.
- Zerrecikler rastgele bir sütunda yığın yüzeyinin biraz üstünde doğar ve sinüs ağzına doğru, hafifçe salınarak yükselir. Dolu sütunun içinde doğmaz.
- Oran `7 × (1 − tıkanıklık)²` /sn, hız çarpanı `0,35 + 0,65 × (1 − tıkanıklık)`: sinüs tıkandıkça hava seyrelir ve yavaşlar, tam tıkanıklıkta durur (NS4-20 boğuk müzik ve nefes halkasıyla aynı dil).
- İlk denemede koyu zeminde **gri toz** gibi göründü. ADD karışımı, turkuaz/pembe tonlar, alfa 0,6 ve biraz daha büyük boyutla yumuşak ışık kabarcıklarına çevrildi.
- Yalnızca oyun sürerken (`play` / `clearing` / `draining`); oyun sonu ve reduced motion'da doğmaz. `resetFx` ve `layout` söndürür.

## 4. Testler

- `tests/rendering/textures.test.ts`: renkli önek parmak izi; yüz yalnızca gri blok karosunda.
- `tests/rendering/effects.test.ts` → "hava akışı": oran/hız eğrisi, katman sırası, havuz sabitliği, dolu sütun, tam tıkanıklık / reduced motion / oyun sonu / `resetFx`.
- `tests/ui/atmosphere.test.ts` → "sinüs boşluğu": zemin ve duvar tokenları (sabit renk yok), ostium, arka plan boyutu.

## 5. Doğrulama

- `npm run check`: typecheck, lint, format, testler, build.
- Headless Edge (1366×768 ve 390×844, DPR 2): açık sinüs (zerrecik 9-11), orta tıkanıklık (2), oyun sonu somurtan bulutçuklar ekran görüntüleri.
- **Test edilemedi:** düşük güçlü telefonlarda kare hızı (28 ek sprite, ihmal edilebilir bekleniyor).
