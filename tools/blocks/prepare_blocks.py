"""Sıklamen blok görsellerini oyuna hazırlar.

Kaynak: art/bloklar/siklamen-blok-*.png (1254 px, çevresi saydam).
Çıktı:  public/images/bloklar/<renk>.webp (karoya kırpılmış, 256 px, çiçeksiz düz karo).

- Her görsel karonun opak sınırına kırpılır ve kare olarak 256 px'e küçültülür.
- NS4-34: karonun üzerindeki çiçek silinir. Parça başına tek sıklamen (sap, yaprak, çiçek) oyunda karoların
  üstüne çizilir (src/rendering/plants.ts, parçalar tools/blocks/prepare_plants.py). Bitki altı karoda da aynı
  yerde: ortak maske zeminden belirgin ayrılan piksellerden çıkarılır, genişletilir ve maske içi çevresindeki
  zeminden yumuşakça doldurulur (Laplace / harmonik doldurma).
- I parçası için görsel yok: yeşil karonun zemini ve kenarı turkuaza döndürülür. Yapraklar mor karodan
  alınan yaprak maskesiyle korunur (bütün karolarda bitki aynı yerde).
- "Göz yormasın" ayarı (CALM): doygunluk, iç kontrast ve parlaklık biraz kısılır. Karolar koyu tahtada
  yan yana çok sayıda durur; ham hâlleri (parlak fuşya/mor, koyu yaprak + açık zemin) uzun oyunda yorar.
  Ayarı değiştirmek için CALM değerlerini düzenleyip betiği yeniden çalıştır.

Çalıştırma (proje kökünde): python tools/blocks/prepare_blocks.py
Gereken: Pillow, numpy, scipy.
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art" / "bloklar"
OUT = ROOT / "public" / "images" / "bloklar"
SIZE = 256
QUALITY = 90

# 1 = değişmez. saturation: renk doygunluğu; contrast: karonun kendi ortalama rengine doğru (çiçek/yaprak ile zemin
# arasındaki sert fark yumuşar); brightness: genel parlaklık (koyu tahtada parlama azalır).
CALM = {"saturation": 0.88, "contrast": 0.86, "brightness": 0.95}

# çıktı adı -> kaynak dosya
SOURCES = {
    "sari": "siklamen-blok-sari-1.png",
    "fusya": "siklamen-blok-fusya.png",
    "yesil": "siklamen-blok-yesil.png",
    "pembe": "siklamen-blok-pembe.png",
    "mor": "siklamen-blok-mor.png",
    "seftali": "siklamen-blok-seftali.png",
}


def deg(d: float) -> int:
    """Derece -> Pillow HSV ton birimi (0..255)."""
    return round(d * 255 / 360)


def crop_tile(im: Image.Image) -> Image.Image:
    """Karonun opak sınırına (satır/sütunun en az %30'u opak) kare kırpma, 4 px pay ile."""
    a = np.array(im)[:, :, 3]
    rows = np.where((a > 250).sum(1) > a.shape[1] * 0.3)[0]
    cols = np.where((a > 250).sum(0) > a.shape[0] * 0.3)[0]
    top, bottom, left, right = rows.min() - 4, rows.max() + 4, cols.min() - 4, cols.max() + 4
    side = max(bottom - top, right - left)
    cy, cx = (top + bottom) / 2, (left + right) / 2
    box = tuple(round(v) for v in (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2))
    return im.crop(box)


def turquoise(green: Image.Image, purple: Image.Image) -> Image.Image:
    """Yeşil karonun zemin ve kenarını turkuaza döndürür; yapraklar (mor karoda da yeşil olanlar) korunur."""
    gh = np.array(green.convert("RGB").convert("HSV")).astype(int)
    ph = np.array(purple.convert("RGB").convert("HSV")).astype(int)
    leaf = (ph[:, :, 0] > deg(60)) & (ph[:, :, 0] < deg(170)) & (ph[:, :, 1] > 50)
    bg = (gh[:, :, 0] > deg(55)) & (gh[:, :, 0] < deg(175)) & ~leaf
    gh[:, :, 0][bg] = (gh[:, :, 0][bg] + deg(68)) % 256
    gh[:, :, 1][bg] = np.minimum(255, gh[:, :, 1][bg] * 1.35).astype(int)
    rgb = Image.fromarray(gh.astype("uint8"), "HSV").convert("RGB")
    return Image.merge("RGBA", (*rgb.split(), green.split()[3]))


def plant_mask(tiles: list[np.ndarray]) -> np.ndarray:
    """Bütün karolarda zeminden belirgin ayrılan iç bölge (bitki), en büyük parça, gölge halesiyle birlikte."""
    n = tiles[0].shape[0]
    yy, xx = np.mgrid[0:n, 0:n] / n
    ring = (((xx > 0.07) & (xx < 0.12)) | ((xx > 0.88) & (xx < 0.93))) & (yy > 0.3) & (yy < 0.6)
    inner = (xx > 0.07) & (xx < 0.93) & (yy > 0.07) & (yy < 0.93)
    mask = np.zeros((n, n), bool)
    for a in tiles:
        bg = np.median(a[ring][:, :3], 0)
        mask |= np.sqrt(((a[:, :, :3] - bg) ** 2).sum(2)) > 38
    mask &= inner
    lab, count = ndimage.label(mask)
    mask = lab == 1 + int(np.argmax(ndimage.sum(mask, lab, range(1, count + 1))))
    return ndimage.binary_fill_holes(ndimage.binary_dilation(mask, iterations=14)) & inner


def remove_plant(a: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Maske içini çevresinden harmonik doldurur (Jacobi)."""
    out = a.copy()
    for c in range(3):
        ch = out[:, :, c]
        ch[mask] = ch[~mask].mean()
        for _ in range(2500):
            avg = (np.roll(ch, 1, 0) + np.roll(ch, -1, 0) + np.roll(ch, 1, 1) + np.roll(ch, -1, 1)) / 4
            ch[mask] = avg[mask]
    return out


def calm(im: Image.Image) -> Image.Image:
    """CALM ayarını uygular; saydamlık (köşeler) değişmez."""
    a = np.array(im).astype(float)
    rgb, alpha = a[:, :, :3], a[:, :, 3:]
    gray = rgb @ np.array([0.299, 0.587, 0.114])
    rgb = gray[..., None] + (rgb - gray[..., None]) * CALM["saturation"]
    w = alpha[..., 0] / 255
    mean = (rgb * w[..., None]).sum((0, 1)) / w.sum()
    rgb = mean + (rgb - mean) * CALM["contrast"]
    rgb = np.clip(rgb * CALM["brightness"], 0, 255)
    return Image.fromarray(np.concatenate([rgb, alpha], 2).round().astype("uint8"), "RGBA")


def tile(im: Image.Image) -> np.ndarray:
    return np.array(crop_tile(im).resize((SIZE, SIZE), Image.LANCZOS)).astype(float)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = {k: Image.open(SRC / v).convert("RGBA") for k, v in SOURCES.items()}
    tiles = {k: tile(im) for k, im in src.items()}
    mask = plant_mask(list(tiles.values()))
    tiles["turkuaz"] = tile(turquoise(src["yesil"], src["mor"]))
    for name, a in tiles.items():
        plain = Image.fromarray(remove_plant(a, mask).clip(0, 255).round().astype("uint8"), "RGBA")
        path = OUT / f"{name}.webp"
        calm(plain).save(path, "WEBP", quality=QUALITY, method=6)
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
