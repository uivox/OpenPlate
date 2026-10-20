#!/usr/bin/env python3
"""
Writes the alternate app icons (Settings → Appearance → App icon) from assets/icon.png and
assets/adaptive-icon.png: the same plate and sprout with another plate and background colour.

    python3 scripts/make-app-icons.py

Needs Pillow. The colours must match ICON_COLORS in src/lib/appIcon.ts (name, plate, background);
app.json lists the files for the expo-alternate-app-icons config plugin.

iOS gets a full 1024 px icon per colour. Edge pixels of the original are split into the two
palette colours next to them and rebuilt from the new colours, so edges stay smooth.
Android gets a recoloured adaptive-icon foreground; its background colour is set in app.json.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'app-icons')

BG = (238, 242, 229)
PLATE = (156, 47, 98)
LEAF_DARK = (94, 154, 59)
LEAF_LIGHT = (126, 176, 99)
FACE = (255, 247, 251)
PALETTE = [BG, PLATE, LEAF_DARK, LEAF_LIGHT, FACE]

# name, plate, background (keep in sync with src/lib/appIcon.ts)
VARIANTS = [
    ('Ocean', '#0E7C86', '#E8F2F4'),
    ('Plum', '#7B3FC4', '#F4EEF7'),
    ('Sunset', '#C9481A', '#FAF0E6'),
    ('Mono', '#161616', '#F1F1EF'),
    ('Night', '#E26A9E', '#1B1220'),
]


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def split(c, allowed):
    """Best (i, j, t) with c ≈ t * PALETTE[i] + (1 - t) * PALETTE[j], using only palette colours in `allowed`."""
    best = None
    for i in allowed:
        for j in allowed:
            if j < i:
                continue
            a, b = PALETTE[i], PALETTE[j]
            d = [a[k] - b[k] for k in range(3)]
            dd = sum(x * x for x in d)
            t = 1.0 if dd == 0 else max(0.0, min(1.0, sum((c[k] - b[k]) * d[k] for k in range(3)) / dd))
            err = sum((c[k] - (t * a[k] + (1 - t) * b[k])) ** 2 for k in range(3))
            if best is None or err < best[0]:
                best = (err, i, j, t)
    return best[1:]


def recolour(img, mapping):
    """Swaps palette colours. An edge pixel is split into the palette colours found next to it (the
    original was resampled, so edges carry blends and a little overshoot), then rebuilt from the new ones."""
    img = img.convert('RGBA')
    src = img.copy().load()
    px = img.load()
    w, h = img.size
    exact = {p: i for i, p in enumerate(PALETTE)}
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            c = (r, g, b)
            if c in exact:
                px[x, y] = mapping[exact[c]] + (a,)
                continue
            near = set()
            for yy in range(max(0, y - 3), min(h, y + 4)):
                for xx in range(max(0, x - 3), min(w, x + 4)):
                    q = src[xx, yy]
                    if q[3] and q[:3] in exact:
                        near.add(exact[q[:3]])
            i, j, t = split(c, sorted(near) or range(len(PALETTE)))
            ci, cj = mapping[i], mapping[j]
            px[x, y] = tuple(round(t * ci[k] + (1 - t) * cj[k]) for k in range(3)) + (a,)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    icon = Image.open(os.path.join(ROOT, 'assets', 'icon.png'))
    fg = Image.open(os.path.join(ROOT, 'assets', 'adaptive-icon.png'))
    for name, plate, bg in VARIANTS:
        mapping = [rgb(bg), rgb(plate), LEAF_DARK, LEAF_LIGHT, FACE]
        recolour(icon, mapping).convert('RGB').save(os.path.join(OUT, f'{name.lower()}.png'), optimize=True)
        recolour(fg, mapping).save(os.path.join(OUT, f'{name.lower()}-foreground.png'), optimize=True)
        print('wrote', name)


if __name__ == '__main__':
    main()
