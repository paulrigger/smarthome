"""Mockup G: Haus antippen → Explosionszeichnung (Dach / OG / EG auseinander) → Stockwerk → Raum mit Geräten.
Raumgeometrie aus dem Einreichplan 2012 (EG 04 01, OG 03), Koordinaten wie build_model.py: x Ost, y Nord, Ursprung SW-Ecke EG (m).
Aufruf: python3 gen_g.py  → G-stockwerke.html (+ PNG mit Playwright)."""
import math

import numpy as np

# ---------------------------------------------------------------- Räume (Polygone in m, grob aus dem Plan)
EG = [
    ('werkstatt', 'Werkstatt', [(0.3, 5.1), (5.5, 5.1), (5.7, 8.1), (0.3, 8.1)]),
    ('holz', 'Holzlager', [(5.7, 6.4), (8.5, 6.4), (8.5, 8.1), (5.7, 8.1)]),
    ('keller', 'Keller', [(8.8, 6.5), (11.8, 6.5), (11.8, 8.1), (8.8, 8.1)]),
    ('trocken', 'Trockenraum', [(8.8, 4.7), (11.8, 4.7), (11.8, 6.3), (8.8, 6.3)]),
    ('kueche', 'Küche', [(8.8, 1.9), (11.8, 1.9), (11.8, 4.5), (8.8, 4.5)]),
    ('wohnen', 'Wohnraum', [(5.4, 6.2), (8.5, 6.2), (8.5, 0.1), (3.9, 0.1)]),
    ('vorraum', 'Vorraum', [(-1.5, 2.6), (4.3, 2.6), (4.7, 4.9), (-1.5, 4.9)]),
    ('wc', 'WC', [(2.2, 4.0), (3.7, 4.0), (3.7, 4.9), (2.2, 4.9)]),
    ('biblio', 'Bibliothek', [(0.3, 0.1), (3.9, 0.1), (4.3, 2.4), (0.3, 2.4)]),
    ('wasch', 'Waschraum', [(12.2, 3.5), (16.8, 3.5), (16.8, 8.1), (12.2, 8.1)]),
]
OG = [
    ('z1', 'Zimmer', [(0.1, 5.1), (5.0, 5.1), (5.1, 8.1), (0.1, 8.1)]),
    ('bad', 'Bad', [(5.3, 5.3), (8.5, 5.3), (8.5, 8.1), (5.3, 8.1)]),
    ('z2', 'Zimmer', [(8.7, 5.3), (11.8, 5.3), (11.8, 8.1), (8.7, 8.1)]),
    ('galerie', 'Galerie', [(1.6, 3.0), (5.0, 3.0), (5.0, 5.0), (8.5, 5.0), (8.5, 0.1), (4.0, 0.1), (4.7, 3.0)]),
    ('z3', 'Zimmer', [(0.1, 0.1), (4.0, 0.1), (4.7, 3.0), (0.1, 3.0)]),
    ('z4', 'Zimmer', [(8.7, 2.0), (11.8, 2.0), (11.8, 5.1), (8.7, 5.1)]),
    ('vorog', 'Vorraum', [(-1.7, 3.0), (1.6, 3.0), (1.6, 5.0), (-1.7, 5.0)]),
]
BODY = [(0, 0), (12, 0), (12, 8.2), (0, 8.2)]
ANNEX = [(-1.7, 0), (0, 0), (0, 5.4), (-1.7, 5.4)]
ZUBAU = [(12, 3.3), (17, 3.3), (17, 8.2), (12, 8.2)]

# Geräte je Raum (Annahme – mit Paul abstimmen): id, Name, Wert, an?
DEV = {
    'kueche': [('Kaffeemaschine', '3 W', 'standby'), ('Kühlschrank', '62 W', 'on'), ('Herd', 'aus', 'off'),
               ('Backrohr', '2,4 kW', 'on'), ('Geschirrspüler', '1:12 h', 'on')],
    'keller': [('Gefrierer', '0 W', 'standby')],
    'wasch': [('Waschmaschine', 'aus', 'off'), ('Speicher', 'WW 52 °C', 'heat')],
    'wohnen': [('Raumklima', '21,4 °C · 48 %', 'clima'), ('Router', '9 W', 'on')],
    'galerie': [('Raumklima', '22,1 °C · 812 ppm', 'clima')],
}

# ---------------------------------------------------------------- Projektion wie build_model.render (Blick von SW)
def camera(az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    w = np.array([math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)])
    r = np.cross([0, 0, 1], w); r /= np.linalg.norm(r)
    return r, np.cross(w, r), w


R, U, W = camera(-40, 28)
S = 19  # px/m


def P(x, y, z):
    p = np.array([x, y, z])
    return (p @ R) * S, -(p @ U) * S, p @ W


def pts(poly, z):
    return ' '.join(f'{P(x, y, z)[0]:.1f},{P(x, y, z)[1]:.1f}' for x, y in poly)


def floor(rooms, outline_parts, z, wall=0.9, active=None, labels=True):
    """Bodenplatte + Wände (niedrig geschnitten) als Painter-Algorithmus."""
    out = []
    for poly in outline_parts:  # Platte mit Dicke
        out.append(f'<polygon points="{pts(poly, z - 0.3)}" class="slab-side"/>')
    for poly in outline_parts:
        out.append(f'<polygon points="{pts(poly, z)}" class="slab"/>')
    for key, name, poly in rooms:
        cls = 'room hot' if key in DEV else 'room'
        if key == active:
            cls += ' sel'
        out.append(f'<polygon points="{pts(poly, z + 0.02)}" class="{cls}"/>')
    # Wände: alle Raumkanten, nach Tiefe sortiert
    faces = []
    for key, name, poly in rooms:
        for i in range(len(poly)):
            (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % len(poly)]
            q = [(x0, y0, z), (x1, y1, z), (x1, y1, z + wall), (x0, y0, z + wall)]
            depth = sum(P(*c)[2] for c in q) / 4
            faces.append((depth, ' '.join(f'{P(*c)[0]:.1f},{P(*c)[1]:.1f}' for c in q)))
    for _, f in sorted(faces):
        out.append(f'<polygon points="{f}" class="wall"/>')
    if labels:
        for key, name, poly in rooms:
            cx, cy = sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)
            x, y, _ = P(cx, cy, z + wall)
            n = len(DEV.get(key, []))
            if n:
                out.append(f'<circle cx="{x:.1f}" cy="{y - 4:.1f}" r="8" class="badge"/><text x="{x:.1f}" y="{y - 0.5:.1f}" class="bn">{n}</text>')
    return out


def roof(z):
    # vereinfachte Dachfläche (Satteldach, First bei y = 3,6) über dem Hauptbaukörper
    a, b, c, d = (-2.4, -1.9), (14.0, -1.9), (14.0, 9.1), (-2.4, 9.1)
    rz = lambda y: z + (1.6 * (1 - abs(y - 3.6) / 5.5))
    sp = lambda poly: ' '.join(f'{P(x, y, rz(y))[0]:.1f},{P(x, y, rz(y))[1]:.1f}' for x, y in poly)
    north = [(-2.4, 3.6), (14.0, 3.6), (14.0, 9.1), (-2.4, 9.1)]
    south = [(-2.4, -1.9), (14.0, -1.9), (14.0, 3.6), (-2.4, 3.6)]
    pv = [(-0.3, -1.8), (8.7, -1.8), (8.7, 2.9), (-0.3, 2.9)]
    o = [f'<polygon points="{sp(north)}" class="roof"/>', f'<polygon points="{sp(south)}" class="roof"/>']
    o.append(f'<polygon points="{sp(pv)}" class="pv"/>')
    for i in range(1, 8):
        x = -0.3 + 9.0 * i / 8
        o.append(f'<polyline points="{sp([(x, -1.8), (x, 2.9)])}" class="cell"/>')
    for col in [(11.4, 13.4)]:
        for y0, y1 in ((1.0, 3.2), (-1.4, 0.85)):
            o.append(f'<polygon points="{sp([(col[0], y0), (col[1], y0), (col[1], y1), (col[0], y1)])}" class="pv"/>')
    return o


def exploded():
    g = []
    g += floor(EG, [BODY, ANNEX, ZUBAU], 0, active=None)
    g += floor(OG, [BODY, ANNEX], 8.5)
    g += roof(17.5)
    # Führungslinien an den Ecken (Explosion)
    for x, y in ((0, 0), (12, 0), (12, 8.2)):
        a, b = P(x, y, 1.0), P(x, y, 8.1)
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" class="guide"/>')
        a, b = P(x, y, 9.4), P(x, y, 17.3)
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" class="guide"/>')
    # Stockwerks-Etiketten
    for z, t, s in ((0, 'Erdgeschoss', '2,5 kW · 4 Räume'), (8.5, 'Obergeschoss', 'Galerie 22,1 °C')):
        x, y, _ = P(-1.7, 0, z) if z == 0 else P(-1.7, 5.4, z)
        if z: y -= 95
        g.append(f'<text x="{x - 10:.1f}" y="{y + 30:.1f}" class="fl">{t}</text><text x="{x - 10:.1f}" y="{y + 46:.1f}" class="fs">{s}</text>')
    return g


def plan2d(rooms, outline_parts, sel, sx=20, ox=40, oy=330):
    T = lambda x, y: (ox + x * sx, oy - y * sx)
    pp = lambda poly: ' '.join(f'{T(x, y)[0]:.1f},{T(x, y)[1]:.1f}' for x, y in poly)
    o = [f'<polygon points="{pp(p)}" class="slab"/>' for p in outline_parts]
    for key, name, poly in rooms:
        cls = 'room2' + (' hot' if key in DEV else '') + (' sel' if key == sel else '')
        o.append(f'<polygon points="{pp(poly)}" class="{cls}"/>')
    for key, name, poly in rooms:
        cx, cy = sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)
        x, y = T(cx, cy)
        devs = DEV.get(key, [])
        o.append(f'<text x="{x:.1f}" y="{y - (6 if devs else -4):.1f}" class="rn{" dim" if not devs else ""}">{name}</text>')
        if devs:
            kw = {'kueche': '2,5 kW', 'keller': '0 W', 'wasch': 'aus', 'wohnen': '21,4 °C', 'galerie': '22,1 °C'}[key]
            o.append(f'<text x="{x:.1f}" y="{y + 10:.1f}" class="rv">{kw}</text>')
    return o


CSS = """
body{margin:0;background:#111;font-family:Barlow,system-ui,sans-serif;color:#fff;display:flex;gap:28px;padding:28px;align-items:flex-start}
.ph{width:390px;height:780px;background:#000;border:1px solid #333;border-radius:28px;overflow:hidden;position:relative}
.cap{font:600 13px Barlow,system-ui;color:#a6a6a6;margin:0 0 10px 4px;letter-spacing:.04em;text-transform:uppercase}
.hdr{display:flex;justify-content:space-between;align-items:center;padding:16px 18px 6px;font-size:15px;color:#a6a6a6}
.hdr b{color:#fff;font-size:17px}
.slab{fill:#000;stroke:#fff;stroke-width:1.1}.slab-side{fill:#000;stroke:#fff;stroke-width:.8}
.room{fill:#000;stroke:none}.room.hot{fill:#1c1c1c}.room.sel{fill:#3d3d3d}
.wall{fill:#000;stroke:#fff;stroke-width:.8;stroke-linejoin:round}
.roof{fill:#000;stroke:#fff;stroke-width:1}.pv{fill:#000;stroke:#fff;stroke-width:.9}.cell{stroke:#fff;stroke-opacity:.45;stroke-width:.5;fill:none}
.guide{stroke:#a6a6a6;stroke-dasharray:2 4;stroke-width:.8}
.badge{fill:#fff}.bn{fill:#000;font:700 10px 'Barlow Semi Condensed',sans-serif;text-anchor:middle}
.fl{fill:#fff;font:600 15px Barlow,sans-serif}.fs{fill:#a6a6a6;font:400 12px Barlow,sans-serif}
.room2{fill:#000;stroke:#fff;stroke-width:1.2}.room2.hot{fill:#1c1c1c}.room2.sel{fill:#3d3d3d;stroke-width:2}
.rn{fill:#fff;font:600 11.5px Barlow,sans-serif;text-anchor:middle}.rn.dim{fill:#7a7a7a;font-weight:400}
.rv{fill:#fff;font:700 13px 'Barlow Semi Condensed',sans-serif;text-anchor:middle}
.seg{display:flex;margin:6px 18px 0;border:1px solid #3d3d3d;border-radius:10px;overflow:hidden}
.seg div{flex:1;text-align:center;padding:12px 0;font-size:14px;color:#a6a6a6}.seg .on{background:#fff;color:#000;font-weight:600}
.hint{position:absolute;left:0;right:0;bottom:22px;text-align:center;font-size:12.5px;color:#7a7a7a}
.sheet{position:absolute;left:0;right:0;bottom:0;background:#1c1c1c;border-radius:20px 20px 0 0;padding:10px 18px 26px;border-top:1px solid #3d3d3d}
.grab{width:40px;height:5px;border-radius:3px;background:#595959;margin:0 auto 12px}
.sh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}.sh b{font-size:19px}.sh span{color:#a6a6a6;font-size:13px}
.row{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid #333;min-height:44px}
.ic{width:34px;height:34px;border-radius:50%;border:1.6px solid #fff;flex:none}.ic.standby{border-color:#7a7a7a}.ic.off{border-color:#3d3d3d}
.nm{flex:1;font-size:15px}.nm small{display:block;color:#a6a6a6;font-size:12px}
.v{text-align:right;font:700 18px 'Barlow Semi Condensed',sans-serif}.v small{display:block;font:400 12px Barlow,sans-serif;color:#a6a6a6}
.off .v,.off .nm{color:#7a7a7a}
.back{position:absolute;top:14px;left:14px;font-size:14px;color:#a6a6a6}
"""


def svg(inner, vb):
    return f'<svg viewBox="{vb}" width="390">{"".join(inner)}</svg>'


g = exploded()
xs = []
for k in ('exploded',):
    pass
import re
_c = [tuple(map(float, m)) for m in re.findall(r'(-?[\d.]+),(-?[\d.]+)', ''.join(g))]
_x0, _x1 = min(c[0] for c in _c), max(c[0] for c in _c)
_y0, _y1 = min(c[1] for c in _c), max(c[1] for c in _c)
_w = max(_x1 - _x0 + 40, 390)
ex = svg(g, f'{_x0 - 20 - (_w - (_x1 - _x0 + 40)) / 2:.0f} {_y0 - 20:.0f} {_w:.0f} {(_y1 - _y0 + 60) * _w / 390 if _w > 390 else _y1 - _y0 + 60:.0f}')
eg = svg(plan2d(EG, [BODY, ANNEX, ZUBAU], 'kueche'), '0 140 390 220')
rows = ''.join(
    f'<div class="row {st}"><div class="ic {st}"></div><div class="nm">{n}<small>{ {"on": "an", "standby": "Standby", "off": "aus", "heat": "Wärme", "clima": "Raumklima"}[st]}</small></div>'
    f'<div class="v">{v}<small>{e}</small></div></div>'
    for (n, v, st), e in zip(DEV['kueche'], ['0,2 kWh', '1,4 kWh', '0 kWh', '1,1 kWh', '0,9 kWh']))
html = f"""<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Semi+Condensed:wght@400;700&display=swap" rel="stylesheet"><style>{CSS}</style></head><body>
<div><p class="cap">1 · Haus angetippt → Explosion</p><div class="ph"><div class="hdr"><span>‹ Übersicht</span><b>Haus</b><span>15:42</span></div>
{ex}<div class="hint">Stockwerk antippen · Tippen daneben = zurück</div></div></div>
<div><p class="cap">2 · Erdgeschoss</p><div class="ph"><div class="hdr"><span>‹ Haus</span><b>Erdgeschoss</b><span>15:42</span></div>
<div class="seg"><div>OG</div><div class="on">EG</div></div>{eg}
<div class="hint">Raum antippen</div></div></div>
<div><p class="cap">3 · Raum Küche</p><div class="ph"><div class="hdr"><span>‹ Haus</span><b>Erdgeschoss</b><span>15:42</span></div>
<div class="seg"><div>OG</div><div class="on">EG</div></div>{eg}
<div class="sheet"><div class="grab"></div><div class="sh"><b>Küche</b><span>jetzt 2,5 kW · heute 3,6 kWh</span></div>{rows}</div></div></div>
</body></html>"""
open('G-stockwerke.html', 'w').write(html)
print('ok')
