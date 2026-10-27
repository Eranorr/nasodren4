"""Blok bitkisinin parçalarını kullanıcının sıklamen blok karolarından hazırlar (NS4-36).

Kaynak: art/bloklar/siklamen-blok-*.png (prepare_blocks.SOURCES; I için turkuaz karo yeşilden üretilir).
Çıktı:  public/images/bitki/*.webp
  cicek-<renk>     karonun kendi çiçeği (her parça rengi ayrı)
  tomurcuk-<renk>  aynı çiçeğin kapalı hâli (daraltılıp uzatılır)
  yaprak1/2        karodaki sol ve sağ kalp yaprak

- Karolarda bitki aynı yerde ve aynı çizimde; yalnızca zemin ve çiçek rengi değişir. Yapraklar bütün karolarda
  aynı olduğu için çok karolu matlama ile zeminden temiz ayrılır: C_i = a F + (1 - a) B_i (B_i: çiçeksiz zemin,
  prepare_blocks.remove_plant). Çiçeğin rengi karoya göre değiştiği için çiçek, ortak siluetle (karoların
  zeminden ayrılan bölgelerinin birleşimi) kendi karosundan kesilir; kenar payı kendi zemin rengidir ve oyunda
  aynı renkli karonun üstüne çizilir.
- Her parça "dik" hâle getirilir: bağlanma noktası (çapa) görselin tam ortasında, uç yukarıda, çapadan uca 128 px.
  Oyun parçayı çapadan döndürüp ölçekler (src/rendering/plants.ts). Yapraklar karodaki gibi sivri uçlarından
  sapa tutturulur. Sap ve sivri sap ucu oyunda çizilir (renkler karodaki bordo saptan, STEM_COLORS).
- "Göz yormasın" ayarı bloklarla aynıdır (prepare_blocks.CALM).

Çalıştırma (proje kökünde): python tools/blocks/prepare_plants.py
Gereken: Pillow, numpy, scipy.
"""

import importlib.util
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "images" / "bitki"
N = 512  # işleme çözünürlüğü (karo)
REACH = 128  # çıktıda çapadan uca uzaklık (px)
QUALITY = 90
FLOWER_BOTTOM = 352  # çiçek bu satırın üstünde (N = 512); altında sap ve yapraklar
BUD = (0.42, 0.78)  # tomurcuk: çiçeğin eni ve boyu çarpanı

_spec = importlib.util.spec_from_file_location("blocks", Path(__file__).with_name("prepare_blocks.py"))
blocks = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(blocks)


def load_tiles() -> tuple[dict[str, np.ndarray], dict[str, np.ndarray]]:
    """N px karolar ve çiçeksiz zeminleri (zemin 256 px'te doldurulur, sonra büyütülür)."""
    src = {k: Image.open(blocks.SRC / v).convert("RGBA") for k, v in blocks.SOURCES.items()}
    src["turkuaz"] = blocks.turquoise(src["yesil"], src["mor"])
    tiles, plain = {}, {}
    small = {k: blocks.tile(im) for k, im in src.items()}
    mask = blocks.plant_mask([small[k] for k in blocks.SOURCES])
    for k, im in src.items():
        tiles[k] = np.array(blocks.crop_tile(im).resize((N, N), Image.LANCZOS)).astype(float)
        b = blocks.remove_plant(small[k], mask).clip(0, 255).astype("uint8")
        plain[k] = np.array(Image.fromarray(b, "RGBA").resize((N, N), Image.BICUBIC)).astype(float)
    return tiles, plain


def matte(tiles: dict[str, np.ndarray], plain: dict[str, np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Bütün karolarda aynı olan parçalar (yapraklar, sap) için saydamlık ve gerçek renk (asıl altı karo)."""
    keys = list(blocks.SOURCES)
    C = np.stack([tiles[k][:, :, :3] for k in keys])
    B = np.stack([plain[k][:, :, :3] for k in keys])
    Cm, Bm = C.mean(0), B.mean(0)
    one_minus = np.clip(((C - Cm) * (B - Bm)).sum((0, 3)) / (((B - Bm) ** 2).sum((0, 3)) + 1e-6), 0, 1)
    alpha = 1 - one_minus
    F = np.clip((Cm - one_minus[..., None] * Bm) / np.maximum(alpha[..., None], 1e-3), 0, 255)
    return alpha, F


def rgba(F: np.ndarray, alpha: np.ndarray) -> Image.Image:
    return Image.fromarray(np.concatenate([F, alpha[..., None] * 255], 2).clip(0, 255).round().astype("uint8"), "RGBA")


def upright(im: Image.Image, ax: float, ay: float, tip: tuple[float, float] | None = None) -> Image.Image:
    """Çapayı (ax, ay px) merkeze alır; `tip` verilirse parçayı o nokta yukarı bakacak şekilde döndürür."""
    if tip:
        ang = math.degrees(math.atan2(tip[1] - ay, tip[0] - ax))  # 0 sağ, 90 aşağı
        pad = int(max(im.size) * 1.5)
        big = Image.new("RGBA", (pad * 2, pad * 2))
        big.paste(im, (int(pad - ax), int(pad - ay)))
        im = big.rotate(ang + 90, resample=Image.BICUBIC, center=(pad, pad))  # PIL: saat yönünün tersi
        ax = ay = pad
    a = np.array(im)
    ys, xs = np.nonzero(a[:, :, 3] > 8)
    up = ay - ys.min()
    half_h = max(up, ys.max() - ay)
    half_w = max(ax - xs.min(), xs.max() - ax)
    box = (round(ax - half_w), round(ay - half_h), round(ax + half_w), round(ay + half_h))
    im = im.crop(box)
    s = REACH / up
    return im.resize((max(2, round(im.width * s)), max(2, round(im.height * s))), Image.LANCZOS)


def save(im: Image.Image, name: str) -> None:
    path = OUT / f"{name}.webp"
    blocks.calm(im).save(path, "WEBP", quality=QUALITY, method=6)
    print(f"{path.relative_to(ROOT)}  {im.width}x{im.height}  {path.stat().st_size // 1024} KB")


def centroid(a: np.ndarray) -> tuple[float, float]:
    ys, xs = np.mgrid[0 : a.shape[0], 0 : a.shape[1]]
    return float((xs * a).sum() / a.sum()), float((ys * a).sum() / a.sum())


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        old.unlink()
    tiles, plain = load_tiles()
    alpha, F = matte(tiles, plain)
    yy, xx = np.mgrid[0:N, 0:N]
    green = (F[:, :, 1] > F[:, :, 0] + 15) & (alpha > 0.2)

    # yapraklar: sol ve sağ kalp yaprak (bordo sap rengi hariç); karodaki gibi sapa değen sivri uçtan tutturulur
    for name, side in (("yaprak1", xx < N * 0.48), ("yaprak2", xx > N * 0.51)):
        region = side & (yy > N * 0.56) & (yy < N * 0.9) & green
        region = ndimage.binary_dilation(region, iterations=2) & (F[:, :, 0] < F[:, :, 1] + 25)
        # yalnızca yaprağın kendisi (karo kenarının parıltısından kalan başıboş pikseller boyu kısaltmasın)
        lab, count = ndimage.label(region & (alpha > 0.3))
        body = lab == 1 + int(np.argmax(ndimage.sum(lab > 0, lab, range(1, count + 1))))
        region &= ndimage.binary_dilation(body, iterations=2)
        a = np.where(region, alpha, 0)
        ys, xs = np.nonzero(a > 0.5)
        k = np.argmax(ys + (xs if name == "yaprak1" else -xs))  # sapa en yakın alt uç
        save(upright(rgba(F, a), xs[k], ys[k], centroid(a)), name)

    # çiçek: ortak siluet (karolarda zeminden ayrılan bölge, yapraklar hariç), dibi çapa
    sil = np.zeros((N, N), bool)
    for k in tiles:
        sil |= np.sqrt(((tiles[k][:, :, :3] - plain[k][:, :, :3]) ** 2).sum(2)) > 45
    sil &= (yy < FLOWER_BOTTOM) & (yy > N * 0.05) & (xx > N * 0.08) & (xx < N * 0.92)
    sil &= ~ndimage.binary_dilation(green, iterations=2)
    lab, count = ndimage.label(sil)
    sil = lab == 1 + int(np.argmax(ndimage.sum(sil, lab, range(1, count + 1))))
    sil = ndimage.binary_fill_holes(ndimage.binary_closing(sil, iterations=3))
    soft = np.array(Image.fromarray((sil * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(0.8))) / 255
    ys, xs = np.nonzero(sil)
    base_y = ys.max()
    base_x = xs[ys >= base_y - 6].mean()
    for name in ("turkuaz", *blocks.SOURCES):
        flower = rgba(tiles[name][:, :, :3], soft)
        save(upright(flower, base_x, base_y), f"cicek-{name}")
        # tomurcuk: aynı çiçek daraltılıp uzatılır (taç yapraklar kapanır), dibi aynı çapada
        w, h = flower.size
        bud = flower.resize((round(w * BUD[0]), round(h * BUD[1])), Image.LANCZOS)
        save(upright(bud, base_x * BUD[0], base_y * BUD[1]), f"tomurcuk-{name}")


if __name__ == "__main__":
    main()
