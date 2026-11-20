# Repaint text on a finished ad image: paint each box with the colour around it, then draw new text in its place.
# Used for the marketing team's creatives when only a number changes (e.g. Spain Poço do Canto 60 € -> 55 €).
# Usage: python3 -I scripts/ads/repaint.py <in> <out> <spec.json>
# spec: [{"box":[x0,y0,x1,y1], "text":"55€", "font":"path.ttf", "var":"Bold"?, "color":[r,g,b], "align":"center|left|right",
#         "size":auto?, "strike":[r,g,b]?, "bg":[r,g,b]?}]
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def ring_colour(a, box, pad=3):
    x0, y0, x1, y1 = box
    h, w = a.shape[:2]
    xs0, ys0, xs1, ys1 = max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)
    ring = np.concatenate([a[ys0:y0, xs0:xs1].reshape(-1, 3), a[y1:ys1, xs0:xs1].reshape(-1, 3), a[ys0:ys1, xs0:x0].reshape(-1, 3), a[ys0:ys1, x1:xs1].reshape(-1, 3)])
    return tuple(int(v) for v in np.median(ring, axis=0))


def main(src, dst, spec):
    im = Image.open(src).convert("RGB")
    for s in spec:
        a = np.asarray(im)
        box = s["box"]
        bg = tuple(s["bg"]) if s.get("bg") else ring_colour(a, box)
        d = ImageDraw.Draw(im)
        d.rectangle(box, fill=bg)
        f = ImageFont.truetype(s["font"], 10)
        if s.get("var"):
            f.set_variation_by_name(s["var"])
        x0, y0, x1, y1 = box
        tw, th = x1 - x0 - s.get("padx", 2) * 2, y1 - y0 - s.get("pady", 2) * 2
        size = s.get("size") or 6
        if not s.get("size"):
            while True:
                g = ImageFont.truetype(s["font"], size + 1)
                if s.get("var"):
                    g.set_variation_by_name(s["var"])
                bb = d.textbbox((0, 0), s["text"], font=g)
                if bb[2] - bb[0] > tw or bb[3] - bb[1] > th:
                    break
                size += 1
        f = ImageFont.truetype(s["font"], size)
        if s.get("var"):
            f.set_variation_by_name(s["var"])
        bb = d.textbbox((0, 0), s["text"], font=f)
        w, h = bb[2] - bb[0], bb[3] - bb[1]
        align = s.get("align", "center")
        x = x0 + (x1 - x0 - w) / 2 if align == "center" else (x0 + s.get("padx", 2) if align == "left" else x1 - s.get("padx", 2) - w)
        y = y0 + (y1 - y0 - h) / 2
        d.text((x - bb[0], y - bb[1]), s["text"], font=f, fill=tuple(s["color"]))
        if s.get("strike"):
            sy = y + h * 0.55
            d.line((x - 2, sy, x + w + 2, sy - 2), fill=tuple(s["strike"]), width=max(2, h // 9))
    im.save(dst, quality=93)
    print(dst)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], json.load(open(sys.argv[3])))
