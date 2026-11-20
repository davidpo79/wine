# The Poço do Canto ad that sells in Spain (barrels, six bottles, red bar, price circle), in other languages and prices.
# Usage: python3 -I scripts/ads/poco-winner-langs.py <source.jpg> <fonts dir> <out dir>
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC, FONTS, OUT = sys.argv[1:4]
LANGS = {
    "nl": {"bar": [("Gratis", "verzending"), ("Btw", "inbegrepen"), ("Rechtstreeks van de", "producent uit de Douro")], "circle": ("SPECIAAL", "BLACK FRIDAY", "60€", "120€", "NORMALE PRIJS"), "left": ("POÇO DO CANTO", "PALHETE 2019", "6 FLESSEN", "RODE DOURO-WIJN")},
    "de": {"bar": [("Gratis-", "versand"), ("Inkl.", "MwSt."), ("Direkt vom Erzeuger", "aus dem Douro")], "circle": ("BLACK FRIDAY", "SPECIAL", "60€", "120€", "NORMALPREIS"), "left": ("POÇO DO CANTO", "PALHETE 2019", "6 FLASCHEN", "DOURO-ROTWEIN")},
    "fr": {"bar": [("Livraison", "offerte"), ("TVA", "comprise"), ("Direct du producteur", "du Douro")], "circle": ("SPÉCIAL", "BLACK FRIDAY", "60€", "120€", "PRIX HABITUEL"), "left": ("POÇO DO CANTO", "PALHETE 2019", "6 BOUTEILLES", "VIN ROUGE DU DOURO")},
}


def font(name, size, var=None):
    f = ImageFont.truetype(f"{FONTS}/{name}", size)
    if var:
        f.set_variation_by_name(var)
    return f


def inpaint(a, box, is_text):
    x0, y0, x1, y1 = box
    reg = a[y0:y1, x0:x1].copy()
    m = Image.fromarray((is_text(reg) * 255).astype("uint8")).filter(ImageFilter.MaxFilter(7))
    text = np.asarray(m) > 0
    known = (~text).astype(float)
    for rad in [3, 6, 12, 24, 48]:
        num = np.stack([np.asarray(Image.fromarray(np.clip(reg[..., c] * known, 0, 255).astype("uint8")).filter(ImageFilter.GaussianBlur(rad))).astype(float) for c in range(3)], -1)
        den = np.asarray(Image.fromarray((known * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(rad))).astype(float) / 255
        fill = num / np.maximum(den[..., None], 1e-3)
        sel = (known == 0) & (den > 0.15)
        reg[sel] = fill[sel]
        known[sel] = 1
    a[y0:y1, x0:x1] = reg


def make(lang, t):
    im = Image.open(SRC).convert("RGB")
    a = np.asarray(im).astype(float)
    # Left caption over the barrels: light text on dark wood.
    inpaint(a, (55, 670, 360, 820), lambda r: r.mean(-1) > 95)
    im = Image.fromarray(a.astype("uint8"))
    d = ImageDraw.Draw(im)
    red = (226, 15, 28)
    # Bar texts: repaint the text column next to each icon (the icons stay).
    cols = [(305, 430), (522, 705), (795, 1132)]
    size = 27  # one size for the three columns, the largest that fits all of them
    while any(d.textlength(l, font=font("Montserrat-var.ttf", size, "Medium")) > x1 - x0 - 8 for (x0, x1), pair in zip(cols, t["bar"]) for l in pair):
        size -= 1
    f = font("Montserrat-var.ttf", size, "Medium")
    for (x0, x1), (l1, l2) in zip(cols, t["bar"]):
        d.rectangle((x0, 398, x1, 476), fill=red)
        d.text((x0 + 6, 408), l1, font=f, fill="white")
        d.text((x0 + 6, 438), l2, font=f, fill="white")
    # Price circle.
    cx, cy, r = 1074, 694, 152
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(182, 6, 17))
    top1, top2, price, old, lab = t["circle"]

    def c(text, f, y, fill="white", features=None):
        bb = d.textbbox((0, 0), text, font=f, features=features)
        d.text((cx - (bb[2] - bb[0]) / 2 - bb[0], y - bb[1]), text, font=f, fill=fill, features=features)
        return bb

    c(top1, font("Montserrat-var.ttf", 24, "Medium"), 565)
    c(top2, font("Montserrat-var.ttf", 24, "Medium"), 596)
    c(price, font("PlayfairDisplay-var.ttf", 104, "Bold"), 632, features=["lnum"])
    bb = c(old, font("Montserrat-var.ttf", 34, "SemiBold"), 744, (255, 225, 225))
    w = bb[2] - bb[0]
    d.line((cx - w / 2 - 4, 764, cx + w / 2 + 4, 760), fill="white", width=3)
    c(lab, font("Montserrat-var.ttf", 17, "Medium"), 792)
    # Left caption.
    gold = (214, 170, 104)
    y = 682
    for i, line in enumerate(t["left"]):
        f = font("Montserrat-var.ttf", 25, "Bold" if i == 0 else "SemiBold")
        while d.textlength(line, font=f) > 300:
            f = font("Montserrat-var.ttf", f.size - 1, "SemiBold")
        bb = d.textbbox((0, 0), line, font=f)
        d.text((340 - (bb[2] - bb[0]) - bb[0], y), line, font=f, fill="white" if i == 0 else gold)
        y += 36 if i == 0 else 33
    out = f"{OUT}/bf12_poco_winner_{lang}_4x5.jpg"
    im.save(out, quality=92)
    print(out)


for lang, t in LANGS.items():
    make(lang, t)
