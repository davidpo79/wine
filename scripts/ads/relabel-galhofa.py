# Galhofa labels 2024/2025 (David's photos, 16/11/2026): the studio pack shots carry the previous labels (tan upper band,
# no vintage, codes T23/B23/R23). This recolours the upper band, prints the vintage under COLHEITA and changes the
# code's last digit, on each bottle of an image. Usage: python3 -I scripts/ads/relabel-galhofa.py <font.ttf> <in> <out> <kind,x0,x1[,b0,b1,l0,l1[,dx0,dy0,dx1,dy1[,year_x]]]>...
#   kind: red | white | rose (with "!": keep the code); x0,x1: the bottle's columns in the image.
# Font: Oswald (Google Fonts, OFL), e.g. https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Upper band colours of the new labels, from the photos, brought to the studio light (paper of the lower band as reference).
TARGET = {"red": (214, 172, 160), "white": (204, 146, 100), "rose": (212, 112, 84)}
YEAR = {"red": "2024", "white": "2025", "rose": "2025"}
DIGIT = {"red": "4", "white": "5", "rose": "5"}


def runs(mask):
    out, start = [], None
    for i, v in enumerate(list(mask) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i - 1))
            start = None
    return out


def relabel(img, font_path, kind, x0, x1, rows=None, code=True, digit=None, mid_x=None):
    a = np.asarray(img).astype(float)
    rgb, alpha = a[..., :3], a[..., 3]
    L = rgb.mean(-1)
    w = x1 - x0
    cx0, cx1 = x0 + int(w * 0.18), x0 + int(w * 0.82)  # middle of the bottle, away from the dark edges
    rowL = L[:, cx0:cx1].mean(1)
    solid = alpha[:, cx0:cx1].min(1) > 200
    # The label: the first long light run on the bottle (upper band), then a thin dark line, then the lower band.
    if rows:
        # Given: upper band b0..b1 and lower band l0..l1 (bright glass of white and rosé bottles fools the detection).
        b0, b1, l0, l1 = rows
    else:
        # The label: upper band from its first light row down to the thin black line; the lower band after that line.
        ok = np.where((rowL > 95) & solid)[0]
        if not len(ok):
            raise SystemExit(f"{kind}: label not found")
        b0 = int(ok[0])
        sep = [y for y in range(b0 + 60, len(rowL)) if rowL[y] < 40]
        if not sep:
            raise SystemExit(f"{kind}: label line not found")
        b1 = sep[0] - 1
        l0 = next(y for y in range(sep[0], len(rowL)) if rowL[y] > 95)
        l1 = next((y for y in range(l0, len(rowL)) if rowL[y] < 60 or not solid[y]), len(rowL)) - 1
    band = rgb[b0 : b1 + 1, x0:x1]
    bandL = L[b0 : b1 + 1, x0:x1]
    paper = np.median(bandL[:, int(w * 0.2) : int(w * 0.5)])
    t = np.array(TARGET[kind], float)
    new = bandL[..., None] * (t / paper)[None, None, :]
    m = alpha[b0 : b1 + 1, x0:x1] > 0
    band[m] = np.clip(new[m], 0, 255)
    rgb[b0 : b1 + 1, x0:x1] = band

    # COLHEITA: the last text line of the upper band (dark rows in the middle columns).
    # Text = clearly darker than its column (the band is lit from the left, so compare within each column).
    colbg = np.median(bandL, axis=0)
    rel = bandL / np.maximum(colbg[None, :], 1)
    dark = (rel[:, cx0 - x0 : cx1 - x0] < 0.7).sum(1) > 3
    lines = [(s + b0, e + b0) for s, e in runs(dark) if e - s >= 4]
    c0, c1 = lines[-1]
    cols = np.where((rel[c0 - b0 : c1 - b0 + 1] < 0.7).sum(0) > 1)[0]
    mid = x0 + (cols[0] + cols[-1]) / 2
    if cols[-1] - cols[0] > 0.6 * w:  # caught the small side texts too: COLHEITA sits in the middle
        mid = x0 + w / 2
    if mid_x is not None:
        mid = mid_x
    h = c1 - c0 + 1

    out = Image.fromarray(np.dstack([rgb, alpha]).astype("uint8"), "RGBA")
    d = ImageDraw.Draw(out)
    # Size from the band height (COLHEITA is about 8% of it), so it is the same on every bottle.
    h = max(h, round((b1 - b0 + 1) * 0.082))
    f = ImageFont.truetype(font_path, max(8, round(h * 1.32)))
    f.set_variation_by_name("Medium")
    tw = d.textlength(YEAR[kind], font=f)
    top = c1 + max(2, round(h * 0.3))
    if top + h + 2 > b1:
        raise SystemExit(f"{kind}: no room for the vintage")
    d.text((mid - tw / 2, top), YEAR[kind], font=f, fill=(32, 28, 28, 255), anchor="la")

    if not code:  # the code is hidden (e.g. under a price badge): leave it
        return out
    # The code (T23...): large light digits at the left of the lower band. Its last digit is replaced.
    a2 = np.asarray(out).astype(float)
    L2 = a2[..., :3].mean(-1)
    if digit:  # given: the old last digit's box (small or soft pictures)
        dx0, y0, dx1, y1 = digit
    else:
        dx0, dx1, y0, y1 = find_code(L2, l0, l1, x0, w, h, kind)
    out = repaint_digit(out, a2, L2, dx0, dx1, y0, y1, DIGIT[kind], font_path)
    return out


def find_code(L2, l0, l1, x0, w, h, kind):
    zone = L2[l0 : l1 + 1, x0 + int(w * 0.04) : x0 + int(w * 0.36)]
    zrel = zone / np.maximum(np.median(zone, axis=0)[None, :], 1)
    # The code is printed light: look for it with a tighter threshold first, a looser one on small or soft pictures.
    for thr in (0.9, 0.94, 0.96):
        ink = zrel < thr
        rr = [r for r in runs(ink.sum(1) > 2) if r[1] - r[0] > h]  # the code is taller than COLHEITA
        if rr:
            break
    if not rr:
        raise SystemExit(f"{kind}: code not found")
    y0, y1 = rr[0][0] + l0, rr[0][1] + l0
    zx0 = x0 + int(w * 0.04)
    cc = runs((zrel[y0 - l0 : y1 - l0 + 1] < thr).sum(0) > max(1, (y1 - y0) // 8))
    cc = [c for c in cc if c[1] - c[0] >= 2]
    dx0, dx1 = cc[-1][0] + zx0 - 1, cc[-1][1] + zx0 + 1
    return dx0, dx1, y0, y1


def repaint_digit(out, a2, L2, dx0, dx1, y0, y1, digit, font_path):
    blk = a2[y0 : y1 + 1, dx0 : dx1 + 1, :3]
    bl = blk.mean(-1)
    ink_rgb = np.median(blk[bl <= np.percentile(bl, 25)], axis=0)
    dw = dx1 - dx0 + 1
    # Paper over the old digit: the paper just right of it, same rows.
    a2[y0 - 1 : y1 + 2, dx0 : dx1 + 1] = a2[y0 - 1 : y1 + 2, dx1 + 2 : dx1 + 2 + dw]
    out = Image.fromarray(a2.astype("uint8"), "RGBA")
    d = ImageDraw.Draw(out)
    # Size the new digit so its height matches the old one.
    size = 4
    while True:
        f2 = ImageFont.truetype(font_path, size + 1)
        f2.set_variation_by_name("Regular")
        bb = d.textbbox((0, 0), digit, font=f2)
        if bb[3] - bb[1] > (y1 - y0 + 1):
            break
        size += 1
    f2 = ImageFont.truetype(font_path, size)
    f2.set_variation_by_name("Regular")
    bb = d.textbbox((0, 0), digit, font=f2)
    d.text((dx0 - bb[0] + (dw - (bb[2] - bb[0])) / 2, y0 - bb[1]), digit, font=f2, fill=tuple(int(v) for v in ink_rgb) + (255,))
    return out

if __name__ == "__main__":
    font, src, dst, *bottles = sys.argv[1:]
    img = Image.open(src).convert("RGBA")
    for b in bottles:
        kind, *nums = b.split(",")
        n = [int(v) for v in nums]
        # "red!" = leave the code alone (covered by something in the picture).
        # Optional after the rows: the old digit's box (dx0,dy0,dx1,dy1), then the vintage's centre x.
        img = relabel(img, font, kind.rstrip("!"), n[0], n[1], n[2:6] if len(n) >= 6 else None, code=not kind.endswith("!"), digit=n[6:10] if len(n) >= 10 else None, mid_x=n[10] if len(n) >= 11 else None)
    if dst.lower().endswith((".jpg", ".jpeg")) or Image.open(src).mode != "RGBA":
        img = img.convert("RGB")
    img.save(dst, quality=92)
    print(dst)
