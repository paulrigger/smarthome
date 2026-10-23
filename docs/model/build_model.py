#!/usr/bin/env python3
"""Rudimentäres 3D-Modell Haus + Carport (Maße aus Einreichplan 2012, Carport aus Lageplan 1:200).

Koordinaten in Metern: x = Ost, y = Nord, z = oben. Ursprung = SW-Ecke Hauptbaukörper EG.
Ausgabe:
  - <name>.svg  Linienzeichnung (verdeckte Kanten entfernt), stroke = currentColor
  - haus.obj    Flächenmodell für 3D-Viewer (three.js etc.)
Aufruf: python3 build_model.py [ausgabeordner]
"""
import math
import sys
from pathlib import Path

import numpy as np

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------ Maße (m)
BODY_X = (0.0, 12.0)        # Hauptbaukörper Ost-West
BODY_Y = (0.0, 8.2)         # Süd-Nord
ROOF_X = (-2.4, 14.0)       # Dach inkl. Überstand (Dachaufsicht 16,4 m)
ROOF_Y = (-1.9, 9.1)        # 11,0 m, Süd-Überstand über Terrasse
RIDGE_Y = 3.6
EAVE_Z, RIDGE_Z, ROOF_T = 5.3, 6.9, 0.25
ANNEX = dict(x=(-1.7, 0.0), y=(0.0, 5.4))          # Stiegenhaus West
ZUBAU = dict(x=(12.0, 17.0), y=(3.3, 8.2), z=3.0)  # Flachdach-Zubau Ost
POSTS_X = (-1.9, 0.65, 2.7, 4.8, 6.8, 8.9, 10.9, 13.5)
PV_ROOF = dict(x=(-0.3, 8.7), y=(-1.8, 2.9), cols=8, rows=3)
COLLECTORS = [dict(x=(11.4, 13.4), y=(1.0, 3.2)), dict(x=(11.4, 13.4), y=(-1.4, 0.85))]
# Carport: Schmetterlingsdach (Kehle Nord-Süd, tiefste Stelle), Westflügel länger (2 PV-Reihen), Ostflügel 1 Reihe.
# Nordteil geschlossen (Abstellraum mit Fensterband), Südteil offen, Zufahrt von Westen, Südwand geschlossen.
CARPORT = dict(x=(-5.5, 0.1), y=(-11.1, -3.2), valley_x=-2.1, z_west=3.25, z_valley=2.6, z_east=3.0,
               t=0.15, overhang=0.15, store_y=(-7.3, -3.2), band_z=2.5, pv_cols=7)
BATTERY = dict(x=(-1.0, -0.45), y=(-7.6, -7.3), z=(0.0, 1.25))
WALLBOX = dict(x=(-3.7, -3.3), y=(-7.45, -7.3), z=(1.0, 1.5))


def roof_top(y):
    if y <= RIDGE_Y:
        return EAVE_Z + (RIDGE_Z - EAVE_Z) * (y - ROOF_Y[0]) / (RIDGE_Y - ROOF_Y[0])
    return EAVE_Z + (RIDGE_Z - EAVE_Z) * (ROOF_Y[1] - y) / (ROOF_Y[1] - RIDGE_Y)


def roof_bottom(y):
    return roof_top(y) - ROOF_T


faces = []   # Polygone (n×3), für Verdeckung + OBJ
edges = []   # sichtbare Linien (2×3)


def add_face(*pts):
    faces.append(np.array(pts, float))


def add_edge(a, b, cls="edge"):
    """cls: edge (Bauteilkante), pv (Modulrahmen), cell (Zellraster), tube (Kollektorröhre)."""
    edges.append((np.array(a, float), np.array(b, float), cls))


def box(x, y, z, edges_on=True):
    (x0, x1), (y0, y1), (z0, z1) = x, y, z
    v = lambda i, j, k: (x[i], y[j], z[k])
    quads = [((0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)), ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)),
             ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)), ((0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)),
             ((0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1)), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1))]
    for q in quads:
        add_face(*[v(*c) for c in q])
    if edges_on:
        for a, b in [((0, 0, 0), (1, 0, 0)), ((0, 1, 0), (1, 1, 0)), ((0, 0, 1), (1, 0, 1)), ((0, 1, 1), (1, 1, 1)),
                     ((0, 0, 0), (0, 1, 0)), ((1, 0, 0), (1, 1, 0)), ((0, 0, 1), (0, 1, 1)), ((1, 0, 1), (1, 1, 1)),
                     ((0, 0, 0), (0, 0, 1)), ((1, 0, 0), (1, 0, 1)), ((0, 1, 0), (0, 1, 1)), ((1, 1, 0), (1, 1, 1))]:
            add_edge(v(*a), v(*b))


def extrude_x(section, x0, x1, close_edges=True):
    """Querschnitt (Liste (y,z), konvex oder in Quads zerlegt) entlang x extrudieren."""
    n = len(section)
    p0 = [(x0, y, z) for y, z in section]
    p1 = [(x1, y, z) for y, z in section]
    for i in range(n):
        j = (i + 1) % n
        add_face(p0[i], p0[j], p1[j], p1[i])
        add_edge(p0[i], p1[i])
        add_edge(p0[i], p0[j])
        add_edge(p1[i], p1[j])
    # Deckel (Fächer – Querschnitte hier sind konvex)
    for p in (p0, p1):
        for i in range(1, n - 1):
            add_face(p[0], p[i], p[i + 1])


# ------------------------------------------------------------------ Hauptbaukörper mit Giebel
extrude_x([(BODY_Y[0], 0), (BODY_Y[1], 0), (BODY_Y[1], roof_bottom(BODY_Y[1])),
           (RIDGE_Y, roof_bottom(RIDGE_Y)), (BODY_Y[0], roof_bottom(BODY_Y[0]))], *BODY_X)
extrude_x([(ANNEX["y"][0], 0), (ANNEX["y"][1], 0), (ANNEX["y"][1], roof_bottom(ANNEX["y"][1])),
           (ANNEX["y"][0], roof_bottom(ANNEX["y"][0]))], *ANNEX["x"])

# Dach (zwei Platten, damit Querschnitte konvex bleiben)
ys, yr, yn = ROOF_Y[0], RIDGE_Y, ROOF_Y[1]
extrude_x([(ys, roof_bottom(ys)), (yr, roof_bottom(yr)), (yr, roof_top(yr)), (ys, roof_top(ys))], *ROOF_X)
extrude_x([(yr, roof_bottom(yr)), (yn, roof_bottom(yn)), (yn, roof_top(yn)), (yr, roof_top(yr))], *ROOF_X)

# Zubau, Attika
box(ZUBAU["x"], ZUBAU["y"], (0, ZUBAU["z"]))
box((ZUBAU["x"][0], ZUBAU["x"][1]), (ZUBAU["y"][0], ZUBAU["y"][1]), (ZUBAU["z"], ZUBAU["z"] + 0.15))

# Stützen unter dem Süd-Überstand
for x in POSTS_X:
    box((x - 0.08, x + 0.08), (ROOF_Y[0] + 0.15, ROOF_Y[0] + 0.31), (0, roof_bottom(ROOF_Y[0] + 0.3)))


def on_roof(x, y, lift=0.04):
    return (x, y, roof_top(y) + lift)


def modules(zfn, x, y, cols, rows, cells, gap=0.06, lift=0.05):
    """PV-Module als einzelne Rahmen mit Fuge und Zellraster. cells = (Teilung in x, Teilung in y)."""
    (x0, x1), (y0, y1) = x, y
    P = lambda a, b: (a, b, zfn(a, b) + lift)
    mw, mh = (x1 - x0) / cols, (y1 - y0) / rows
    for c in range(cols):
        for r in range(rows):
            a0, a1 = x0 + c * mw + gap / 2, x0 + (c + 1) * mw - gap / 2
            b0, b1 = y0 + r * mh + gap / 2, y0 + (r + 1) * mh - gap / 2
            for (pa, pb) in [((a0, b0), (a1, b0)), ((a1, b0), (a1, b1)), ((a1, b1), (a0, b1)), ((a0, b1), (a0, b0))]:
                add_edge(P(*pa), P(*pb), "pv")
            for k in range(1, cells[0]):
                xx = a0 + (a1 - a0) * k / cells[0]
                add_edge(P(xx, b0), P(xx, b1), "cell")
            for k in range(1, cells[1]):
                yy = b0 + (b1 - b0) * k / cells[1]
                add_edge(P(a0, yy), P(a1, yy), "cell")


def roof_rect(x, y, cols=1, rows=1, lift=0.04, tubes=0):
    (x0, x1), (y0, y1) = x, y
    for a, b in [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))]:
        add_edge(on_roof(*a, lift), on_roof(*b, lift))
    for c in range(1, cols):
        xx = x0 + (x1 - x0) * c / cols
        add_edge(on_roof(xx, y0, lift), on_roof(xx, y1, lift))
    for r in range(1, rows):
        yy = y0 + (y1 - y0) * r / rows
        add_edge(on_roof(x0, yy, lift), on_roof(x1, yy, lift))
    for t in range(1, tubes):
        xx = x0 + (x1 - x0) * t / tubes
        add_edge(on_roof(xx, y0 + 0.1, lift), on_roof(xx, y1 - 0.1, lift), "tube")


modules(lambda x, y: roof_top(y), PV_ROOF["x"], PV_ROOF["y"], PV_ROOF["cols"], PV_ROOF["rows"], cells=(3, 5))
for c in COLLECTORS:
    roof_rect(c["x"], c["y"], tubes=14)

# Carport
C = CARPORT
cx0, cx1 = C["x"]; cy0, cy1 = C["y"]; xv = C["valley_x"]


def cp_top(x):
    """Dachoberkante Carport (Schmetterlingsdach)."""
    if x <= xv:
        return C["z_valley"] + (C["z_west"] - C["z_valley"]) * (xv - x) / (xv - cx0)
    return C["z_valley"] + (C["z_east"] - C["z_valley"]) * (x - xv) / (cx1 - xv)


def cp_bot(x):
    return cp_top(x) - C["t"]


def extrude_y(section, y0, y1):
    n = len(section)
    p0 = [(x, y0, z) for x, z in section]
    p1 = [(x, y1, z) for x, z in section]
    for i in range(n):
        j = (i + 1) % n
        add_face(p0[i], p0[j], p1[j], p1[i])
        add_edge(p0[i], p1[i]); add_edge(p0[i], p0[j]); add_edge(p1[i], p1[j])
    for p in (p0, p1):
        for i in range(1, n - 1):
            add_face(p[0], p[i], p[i + 1])


def wall_y(y0, y1, x0=cx0, x1=cx1):
    """Geschlossener Baukörper unter dem Schmetterlingsdach (zwei konvexe Hälften, Innenkante nicht zeichnen)."""
    for xa, xb in ((x0, xv), (xv, x1)):
        quad = [(xa, 0), (xb, 0), (xb, cp_bot(xb)), (xa, cp_bot(xa))]
        for y in (y0, y1):
            add_face(*[(x, y, z) for x, z in quad])
        add_face((xa, y0, 0), (xb, y0, 0), (xb, y1, 0), (xa, y1, 0))
    add_face((x0, y0, 0), (x0, y1, 0), (x0, y1, cp_bot(x0)), (x0, y0, cp_bot(x0)))
    add_face((x1, y0, 0), (x1, y1, 0), (x1, y1, cp_bot(x1)), (x1, y0, cp_bot(x1)))
    outline = [(x0, 0), (x1, 0), (x1, cp_bot(x1)), (xv, cp_bot(xv)), (x0, cp_bot(x0))]
    for y in (y0, y1):
        for i in range(len(outline)):
            (xa, za), (xb, zb) = outline[i], outline[(i + 1) % len(outline)]
            add_edge((xa, y, za), (xb, y, zb))
    for x in (x0, x1):
        add_edge((x, y0, 0), (x, y1, 0)); add_edge((x, y0, cp_bot(x)), (x, y1, cp_bot(x)))


def beam(a, b, s=0.07):
    """Dünner Stab zwischen zwei Punkten (für die schräge Stütze)."""
    a, b = np.array(a, float), np.array(b, float)
    d = (b - a) / np.linalg.norm(b - a)
    n1 = np.cross(d, [0, 1, 0] if abs(d[1]) < 0.9 else [1, 0, 0]); n1 /= np.linalg.norm(n1)
    n2 = np.cross(d, n1)
    ring = lambda p: [p + s * (n1 * i + n2 * j) for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    r0, r1 = ring(a), ring(b)
    for i in range(4):
        j = (i + 1) % 4
        add_face(r0[i], r0[j], r1[j], r1[i])
        add_edge(r0[i], r1[i]); add_edge(r0[i], r0[j]); add_edge(r1[i], r1[j])


# Abstellraum (Nord) + geschlossene Südwand
wall_y(*C["store_y"])
wall_y(cy0, cy0 + 0.12)
# Fensterband Westseite Abstellraum
sy0, sy1 = C["store_y"]
add_edge((cx0, sy0, C["band_z"]), (cx0, sy1, C["band_z"]))
for k in range(1, 4):
    y = sy0 + (sy1 - sy0) * k / 4
    add_edge((cx0, y, C["band_z"]), (cx0, y, cp_bot(cx0)))
# Offener Teil: Einfahrt West ohne Stützen, eine Stütze Ost
beam((cx1 - 0.08, sy0 - 0.1, 0), (cx1 - 0.08, sy0 - 0.1, cp_bot(cx1)))
# Dach: zwei Platten (Kehle in der Mitte)
o = C["overhang"]
for xa, xb in ((cx0 - o, xv), (xv, cx1 + o)):
    extrude_y([(xa, cp_bot(xa)), (xb, cp_bot(xb)), (xb, cp_top(xb)), (xa, cp_top(xa))], cy0 - o, cy1 + o)


cp_z = lambda x, y: cp_top(x)
modules(cp_z, (cx0 - 0.05, xv - 0.08), (cy0 + 0.05, cy1 - 0.05), 2, C["pv_cols"], cells=(5, 3))   # West: 2 Reihen
modules(cp_z, (xv + 0.08, cx1 + 0.05), (cy0 + 0.05, cy1 - 0.05), 1, C["pv_cols"], cells=(5, 3))   # Ost: 1 Reihe
box(BATTERY["x"], BATTERY["y"], BATTERY["z"])
add_edge((BATTERY["x"][0], BATTERY["y"][0], 0.62), (BATTERY["x"][1], BATTERY["y"][0], 0.62))
box(WALLBOX["x"], WALLBOX["y"], WALLBOX["z"])

# ------------------------------------------------------------------ OBJ
def write_obj(path):
    lines = ["# Haus + Carport, Meter, y = Nord, z = oben (Einreichplan 2012 + Lageplan)"]
    idx = 1
    for f in faces:
        for p in f:
            lines.append(f"v {p[0]:.3f} {p[2]:.3f} {-p[1]:.3f}")  # OBJ: y oben
        lines.append("f " + " ".join(str(idx + i) for i in range(len(f))))
        idx += len(f)
    path.write_text("\n".join(lines) + "\n")


# ------------------------------------------------------------------ Projektion + Verdeckung
def camera(az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    w = np.array([math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)])  # zum Betrachter
    r = np.cross([0, 0, 1], w); r /= np.linalg.norm(r)
    u = np.cross(w, r)
    return r, u, w


def render(name, az, el, width_px=1200, raster=2400, pad=24):
    r, u, w = camera(az, el)
    proj = lambda P: np.stack([P @ r, P @ u, P @ w], axis=-1)
    allp = np.concatenate([proj(f) for f in faces])
    mn, mx = allp[:, :2].min(0), allp[:, :2].max(0)
    span = mx - mn
    s = raster / span[0]
    H = int(span[1] * s) + 2
    W = raster + 2
    zbuf = np.full((H, W), -np.inf)

    def to_px(q):
        return (q[..., 0] - mn[0]) * s, (mx[1] - q[..., 1]) * s

    # Dreiecke in den Tiefenpuffer
    for f in faces:
        q = proj(f)
        for i in range(1, len(q) - 1):
            tri = np.array([q[0], q[i], q[i + 1]])
            px, py = to_px(tri)
            x0, x1 = int(max(0, math.floor(px.min()))), int(min(W - 1, math.ceil(px.max())))
            y0, y1 = int(max(0, math.floor(py.min()))), int(min(H - 1, math.ceil(py.max())))
            if x1 < x0 or y1 < y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            (ax, bx, cx_), (ay, by, cy_) = px, py
            den = (by - cy_) * (ax - cx_) + (cx_ - bx) * (ay - cy_)
            if abs(den) < 1e-9:
                continue
            l1 = ((by - cy_) * (gx - cx_) + (cx_ - bx) * (gy - cy_)) / den
            l2 = ((cy_ - ay) * (gx - cx_) + (ax - cx_) * (gy - cy_)) / den
            l3 = 1 - l1 - l2
            inside = (l1 >= -1e-3) & (l2 >= -1e-3) & (l3 >= -1e-3)
            d = l1 * tri[0, 2] + l2 * tri[1, 2] + l3 * tri[2, 2]
            sub = zbuf[y0:y1 + 1, x0:x1 + 1]
            np.maximum(sub, np.where(inside, d, -np.inf), out=sub)

    # Kanten abtasten, sichtbare Abschnitte sammeln
    eps = 0.06  # m
    segs = []
    for a, b, cls in edges:
        qa, qb = proj(a), proj(b)
        pa, pb = np.array(to_px(qa)), np.array(to_px(qb))
        n = max(2, int(np.hypot(*(pb - pa)) / 1.5))
        t = np.linspace(0, 1, n)
        q = qa[None] * (1 - t[:, None]) + qb[None] * t[:, None]
        px, py = to_px(q)
        ix = np.clip(px.astype(int), 0, W - 1); iy = np.clip(py.astype(int), 0, H - 1)
        # Nachbarpixel mitprüfen (Kanten liegen genau auf Flächengrenzen)
        zb = zbuf[iy, ix]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            zb = np.minimum(zb, zbuf[np.clip(iy + dy, 0, H - 1), np.clip(ix + dx, 0, W - 1)])
        vis = q[:, 2] >= zb - eps
        start = None
        for i, v in enumerate(vis):
            if v and start is None:
                start = i
            if (not v or i == n - 1) and start is not None:
                end = i if v else i - 1
                if end > start:
                    segs.append((cls, px[start], py[start], px[end], py[end]))
                start = None

    k = width_px / raster
    Wv, Hv = width_px + 2 * pad, int(H * k) + 2 * pad
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {Wv} {Hv}" fill="none" stroke="currentColor" '
           f'stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">',
           f'<title>Haus und Carport ({name})</title>']
    style = {"edge": 'stroke-width="1.2"', "pv": 'stroke-width="1"', "cell": 'stroke-width="0.5" stroke-opacity="0.5"',
             "tube": 'stroke-width="0.7" stroke-opacity="0.8"'}
    for cls in ("edge", "pv", "cell", "tube"):
        d = "".join(f"M{x0 * k + pad:.1f} {y0 * k + pad:.1f}L{x1 * k + pad:.1f} {y1 * k + pad:.1f}"
                    for c, x0, y0, x1, y1 in segs if c == cls)
        if d:
            out.append(f'<path class="m-{cls}" {style[cls]} d="{d}"/>')
    out.append('</svg>')
    (OUT / f"{name}.svg").write_text("".join(out))
    return len(segs)


write_obj(OUT / "haus.obj")
for name, az, el in [("haus-sw", -40, 28), ("haus-so", 40, 28), ("haus-sued", -12, 18)]:
    print(name, render(name, az, el), "Segmente")
