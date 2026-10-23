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
GLASS = dict(x=(18.2, 20.6), y=(3.2, 8.2), z=2.4)  # Gewächshaus
POSTS_X = (-1.9, 0.65, 2.7, 4.8, 6.8, 8.9, 10.9, 13.5)
PV_ROOF = dict(x=(-0.3, 8.7), y=(-1.8, 2.9), cols=8, rows=3)
SKYLIGHT = dict(x=(9.0, 10.8), y=(-1.8, 1.4))
COLLECTORS = [dict(x=(11.4, 13.4), y=(1.0, 3.2)), dict(x=(11.4, 13.4), y=(-1.4, 0.85))]
CARPORT = dict(x=(-5.5, 0.1), y=(-11.1, -3.2), z=2.6, t=0.18, cols=5, rows=4)
BATTERY = dict(x=(-0.7, -0.15), y=(-4.0, -3.45), z=(0.0, 1.25))
WALLBOX = dict(x=(-0.1, 0.05), y=(-6.25, -5.85), z=(1.0, 1.5))


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


def add_edge(a, b):
    edges.append((np.array(a, float), np.array(b, float)))


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

# Gewächshaus (Sprossen)
box(GLASS["x"], GLASS["y"], (0, GLASS["z"]))
for k in range(1, 4):
    x = GLASS["x"][0] + (GLASS["x"][1] - GLASS["x"][0]) * k / 4
    add_edge((x, GLASS["y"][0], 0), (x, GLASS["y"][0], GLASS["z"]))
    add_edge((x, GLASS["y"][0], GLASS["z"]), (x, GLASS["y"][1], GLASS["z"]))
for k in range(1, 6):
    y = GLASS["y"][0] + (GLASS["y"][1] - GLASS["y"][0]) * k / 6
    add_edge((GLASS["x"][0], y, 0), (GLASS["x"][0], y, GLASS["z"]))

# Stützen unter dem Süd-Überstand
for x in POSTS_X:
    box((x - 0.08, x + 0.08), (ROOF_Y[0] + 0.15, ROOF_Y[0] + 0.31), (0, roof_bottom(ROOF_Y[0] + 0.3)))


def on_roof(x, y, lift=0.04):
    return (x, y, roof_top(y) + lift)


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
        add_edge(on_roof(xx, y0 + 0.1, lift), on_roof(xx, y1 - 0.1, lift))


roof_rect(PV_ROOF["x"], PV_ROOF["y"], PV_ROOF["cols"], PV_ROOF["rows"])
roof_rect(SKYLIGHT["x"], SKYLIGHT["y"])
for c in COLLECTORS:
    roof_rect(c["x"], c["y"], tubes=14)

# Carport: Stützen, Dachplatte, PV-Raster, Akku, Wallbox
cx, cy, cz, ct = CARPORT["x"], CARPORT["y"], CARPORT["z"], CARPORT["t"]
for x in (cx[0] + 0.1, cx[1] - 0.1):
    for y in (cy[0] + 0.1, (cy[0] + cy[1]) / 2, cy[1] - 0.1):
        box((x - 0.07, x + 0.07), (y - 0.07, y + 0.07), (0, cz))
box(cx, cy, (cz, cz + ct))
top = cz + ct + 0.04
for c in range(CARPORT["cols"] + 1):
    x = cx[0] + 0.15 + (cx[1] - cx[0] - 0.3) * c / CARPORT["cols"]
    add_edge((x, cy[0] + 0.15, top), (x, cy[1] - 0.15, top))
for r in range(CARPORT["rows"] + 1):
    y = cy[0] + 0.15 + (cy[1] - cy[0] - 0.3) * r / CARPORT["rows"]
    add_edge((cx[0] + 0.15, y, top), (cx[1] - 0.15, y, top))
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
    for a, b in edges:
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
                    segs.append((px[start], py[start], px[end], py[end]))
                start = None

    k = width_px / raster
    Wv, Hv = width_px + 2 * pad, int(H * k) + 2 * pad
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {Wv} {Hv}" fill="none" stroke="currentColor" '
           f'stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">',
           f'<title>Haus und Carport ({name})</title>', '<path d="']
    for x0, y0, x1, y1 in segs:
        out.append(f"M{x0 * k + pad:.1f} {y0 * k + pad:.1f}L{x1 * k + pad:.1f} {y1 * k + pad:.1f}")
    out.append('"/></svg>')
    (OUT / f"{name}.svg").write_text("".join(out))
    return len(segs)


write_obj(OUT / "haus.obj")
for name, az, el in [("haus-sw", -40, 28), ("haus-so", 40, 28), ("haus-sued", -12, 18)]:
    print(name, render(name, az, el), "Segmente")
