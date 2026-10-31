#!/usr/bin/env python3
"""Gera os assets digitais da marca a partir dos originais em brand/originais/.

Só recorta margens e redimensiona: os originais não são alterados e o desenho da
marca não é refeito. A única adaptação é o reforço óptico do traço nos ícones de
16 a 48 px, onde a linha dupla do símbolo original ficaria com menos de 1 px.

Uso: python3 scripts/prepare-brand-assets.py (requer Pillow)
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
FULL = ROOT / "brand/originais/Logo-01.png"
SYMBOL = ROOT / "brand/originais/Logo-06.png"
OUT = ROOT / "public"
BG = (0x1A, 0x13, 0x60)  # Azul predominante medido nos dois arquivos.
PAD = 4  # Respiro em px do original, para não cortar a suavização do traço.


def crop_mark(path: Path) -> Image.Image:
    """Recorta somente o espaço externo excedente."""
    image = Image.open(path).convert("RGB")
    diff = ImageChops.difference(image, Image.new("RGB", image.size, BG))
    r, g, b = diff.split()
    mask = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v > 2 else 0)
    left, top, right, bottom = mask.getbbox()
    return image.crop((left - PAD, top - PAD, right + PAD, bottom + PAD))


def resize(image: Image.Image, width: int) -> Image.Image:
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.LANCZOS)


def on_bg(mark: Image.Image, size: tuple[int, int]) -> Image.Image:
    canvas = Image.new("RGB", size, BG)
    canvas.paste(mark, ((size[0] - mark.width) // 2, (size[1] - mark.height) // 2))
    return canvas


def icon(symbol: Image.Image, size: int, fill: float, stroke_gain: int) -> Image.Image:
    """Ícone quadrado. stroke_gain engrossa o traço (em px numa base de 1024)."""
    base = 1024
    source = resize(symbol, base)
    if stroke_gain:
        source = source.filter(ImageFilter.MaxFilter(stroke_gain * 2 + 1))
    width = round(size * fill)
    return on_bg(resize(source, width), (size, size))


def main() -> None:
    (OUT / "brand").mkdir(parents=True, exist_ok=True)
    (OUT / "og").mkdir(parents=True, exist_ok=True)
    full = crop_mark(FULL)
    symbol = crop_mark(SYMBOL)
    print(f"marca completa recortada: {full.size}; símbolo recortado: {symbol.size}")

    for width in (168, 196, 336, 392, 688):
        resize(full, width).save(OUT / f"brand/union-solutions-{width}.webp", lossless=True, quality=100, method=6)
    for width in (480, 960):
        resize(symbol, width).save(OUT / f"brand/union-simbolo-{width}.webp", lossless=True, quality=100, method=6)

    icons = {size: icon(symbol, size, 0.92, gain) for size, gain in ((16, 16), (32, 10), (48, 6))}
    icons[48].save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[icons[16], icons[32]])
    icons[32].save(OUT / "favicon-32.png", optimize=True)
    icon(symbol, 180, 0.78, 0).save(OUT / "apple-touch-icon.png", optimize=True)
    icon(symbol, 512, 0.78, 0).save(OUT / "icon-512.png", optimize=True)

    og = on_bg(resize(full, 680), (1200, 630))
    og.save(OUT / "og/union-solutions.png", optimize=True)

    for path in sorted(p for p in OUT.rglob("*") if p.is_file()):
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
