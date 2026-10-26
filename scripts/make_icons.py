"""App-Icons aus dem Quellbild erzeugen (farbiges Symbol – Sonne gold, Haus/Pfeile silber – auf fast schwarzem Grund).

    python3 -I scripts/make_icons.py apps/web/icon/source.png apps/web/public

Grund hat max(R,G,B) ≤ ~20, Symbol deutlich heller → Alpha aus dem hellsten Kanal (Rampe LO..HI, Leuchten der Sonne
bleibt als weicher Rand), Farbe vor schwarzem Grund entmultipliziert, damit sie auf jeder Hintergrundfarbe stimmt.
Ausgabe:
  icon-fg.png          Symbol auf transparent (512 px) – die App setzt damit Favicon/Homescreen-Icon
                       in der gewählten Hintergrundfarbe (Einstellungen)
  icon-192/512.png     Manifest (Standard schwarz, vollflächig, Symbol in der Maskable-Safe-Zone)
  apple-touch-icon.png 180 px, schwarz vollflächig (iOS rundet selbst)
  favicon.png          64 px, schwarz mit abgerundeten Ecken
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

LO, HI = 34.0, 120.0  # Alpha-Rampe zwischen Grund und Symbol (hellster Kanal)
SYMBOL = 0.80  # Anteil der Symbol-Kante an der Icon-Kante (Maskable-Safe-Zone ≈ 80 %)


def mask(src: Path) -> Image.Image:
    rgb = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    a = np.clip((rgb.max(axis=2) - LO) / (HI - LO), 0, 1)
    col = np.clip(rgb / np.maximum(a, 1e-3)[..., None], 0, 255)  # vor Schwarz entmultipliziert
    ys, xs = np.nonzero(a > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    m = 60  # Rand, damit das Leuchten der Sonne nicht abgeschnitten wird
    y0, x0, y1, x1 = max(y0 - m, 0), max(x0 - m, 0), y1 + m, x1 + m
    a, col = a[y0:y1, x0:x1], col[y0:y1, x0:x1]
    h, w = a.shape
    side = max(h, w)
    out = np.zeros((side, side, 4), np.uint8)
    oy, ox = (side - h) // 2, (side - w) // 2
    out[oy:oy + h, ox:ox + w, :3] = col.round().astype(np.uint8)
    out[oy:oy + h, ox:ox + w, 3] = (a * 255).round().astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def compose(fg: Image.Image, size: int, bg: str, radius: float = 0.0, scale: float = SYMBOL) -> Image.Image:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    plate = Image.new('RGBA', (size, size), bg)
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=round(size * radius), fill=255)
    img.paste(plate, (0, 0), m)
    s = round(size * scale)
    sym = fg.resize((s, s), Image.LANCZOS)
    img.alpha_composite(sym, ((size - s) // 2, (size - s) // 2))
    return img


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    fg = mask(src)
    # Symbol mit Rand, damit die App es ohne Skalierlogik mittig setzen kann
    fg_pad = compose(fg, 512, (0, 0, 0, 0), scale=SYMBOL)
    fg_pad.save(out / 'icon-fg.png', optimize=True)
    compose(fg, 192, '#000000').save(out / 'icon-192.png', optimize=True)
    compose(fg, 512, '#000000').save(out / 'icon-512.png', optimize=True)
    compose(fg, 180, '#000000').convert('RGB').save(out / 'apple-touch-icon.png', optimize=True)
    compose(fg, 64, '#000000', radius=0.22, scale=0.9).save(out / 'favicon.png', optimize=True)
    print('ok', fg.size)


if __name__ == '__main__':
    main()
