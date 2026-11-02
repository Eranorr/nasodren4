"""Sıklamen blok görsellerini oyuna hazırlar.

Kaynak: art/bloklar/siklamen (1..7).png (1254 px, arka planı saydam: çiçek, sap ve yapraklar).
Çıktı:  public/images/bloklar/<ad>.webp (256 px kare, arka planı saydam).

- Her görsel saydam olmayan sınırına kırpılır, kareye ortalanır (kenarlarda küçük pay) ve 256 px'e küçültülür.
- Karo yoktur: hücrede yalnızca sıklamen görünür, kare arka plan çizilmez (src/rendering/textures.ts drawArt).
- Renkler görsellerin kendisidir; ayrıca doygunluk / parlaklık ayarı yapılmaz.

Parça eşlemesi (src/rendering/textures.ts BLOCK_ART ile aynı):
  siklamen (1) → L (sağ L)      siklamen (2) → J (sol L)
  siklamen (3) → Z (sağ Z)      siklamen (4) → S (sol Z)
  siklamen (5) → I (uzun)       siklamen (6) → O (kare)
  siklamen (7) → T

Çalıştırma (proje kökünde): python tools/blocks/prepare_blocks.py
Gereken: Pillow.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art" / "bloklar"
OUT = ROOT / "public" / "images" / "bloklar"
SIZE = 256
QUALITY = 90
#: kenarlarda bırakılan pay (karenin kenarına oranı)
MARGIN = 0.03

# çıktı adı -> kaynak dosya
SOURCES = {
    "siklamen-kirmizi": "siklamen (1).png",  # L
    "siklamen-bordo": "siklamen (2).png",  # J
    "siklamen-pembe": "siklamen (3).png",  # Z
    "siklamen-mor": "siklamen (4).png",  # S
    "siklamen-beyaz": "siklamen (5).png",  # I
    "siklamen-acik-pembe": "siklamen (6).png",  # O
    "siklamen-alaca": "siklamen (7).png",  # T
}


def fit_square(im: Image.Image) -> Image.Image:
    """Saydam olmayan sınıra kırpar, kenar payıyla kareye ortalar ve SIZE px'e küçültür."""
    im = im.convert("RGBA")
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if box:
        im = im.crop(box)
    w, h = im.size
    side = round(max(w, h) / (1 - 2 * MARGIN))
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(im, ((side - w) // 2, (side - h) // 2))
    return sq.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, src in SOURCES.items():
        out = OUT / f"{name}.webp"
        fit_square(Image.open(SRC / src)).save(out, "WEBP", quality=QUALITY, method=6)
        print(f"{out.relative_to(ROOT)}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
