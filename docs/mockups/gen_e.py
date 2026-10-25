"""Mockup E: Hausmodell in der Mitte, Knoten außen, geschwungene Flusslinien.
Oben PV-Kette (PV Carport → Akku, PV Dach), unten Wärme-Kette (WP → Speicher ← Solarthermie), links Netz / Haushalt / Auto."""
import json
import math
import re
import subprocess

model = open('model/out/haus-sw.svg').read()
inner = re.sub(r'<title>.*?</title>', '', re.search(r'<svg[^>]*>(.*)</svg>', model, re.S).group(1))
VBW, VBH = map(float, re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', model).groups())
A0 = json.loads(subprocess.run(['python3', 'anchors.py'], cwd='model', capture_output=True, text=True).stdout.strip().splitlines()[-1])

f = 0.168
GW, GH = 358, 575
ox, oy = (GW - VBW * f) / 2, 170
A = {k: (ox + v[0] * f, oy + v[1] * f) for k, v in A0.items()}

# id, Anker, Label, Wert, Position, Radius, Farbe, Fluss (+1 zum Modell, -1 vom Modell, 0 ruhig), Art, kW, Icon, Kontrollpunkte (c1, c2), Label oben?
NODES = [
    ('pvCarport', 'pvCarport', 'PV Carport', '2,4 kW', (62, 112), 21, 'sun', 1, 'elec', 2.4, 'panel', ((118, 150), (172, 210)), True),
    ('battery', 'battery', 'Akku · 54 %', '+1,2 kW', (179, 78), 24, 'battery', -1, 'elec', 1.2, 'battery', ((205, 170), (240, 270)), True),
    ('pvRoof', 'pvRoof', 'PV Dach', '2,1 kW', (296, 112), 21, 'sun', 1, 'elec', 2.1, 'panel', ((296, 190), (240, 209)), True),
    ('grid', 'gridW', 'Netz', '−1,8 kW', (40, 196), 21, 'grid', -1, 'elec', 1.8, 'pylon', ((80, 200), (95, 231)), False),
    ('house', 'houseW', 'Haushalt', '0,6 kW', (40, 290), 21, 'text', -1, 'elec', 0.6, 'home', ((85, 290), (105, 250)), False),
    ('wallbox', 'wallbox', 'Auto · 35 %', 'Standby', (40, 384), 21, 'car', 0, 'elec', 0, 'car', ((95, 384), (130, 340)), False),
    ('heatpump', 'heatpump', 'Wärmepumpe', '0,9 → 4,1 kW', (96, 478), 21, 'heat', -1, 'elec', 0.9, 'hp', ((96, 380), (101, 300)), False),
    ('tank', 'tank', 'Speicher', 'WW 65 · P 36 °C', (184, 500), 28, 'warmth', 0, 'heat', 0, 'tank', ((240, 440), (245, 320)), False),
    ('solar', 'solar', 'Solarthermie', '1,4 kW · 71 °C', (292, 470), 21, 'warmth', 1, 'heat', 1.4, 'tubes', ((325, 320), (265, 225)), False),
]
# Ketten zwischen Knoten: (von, nach, kW, aktiv, Durchhang)
LINKS = [
    ('pvCarport', 'battery', 1.2, True, -26, 'elec'),
    ('pvRoof', 'battery', 0, False, -26, 'elec'),
    ('heatpump', 'tank', 4.1, True, 22, 'heat'),
    ('solar', 'tank', 1.4, True, 26, 'heat'),
]
ICON = {
    'panel': '<path d="M-9 3 L-6 -6 L9 -6 L6 3 Z M-7.5 -1.5 L7.5 -1.5 M-1.5 -6 L-3 3 M3.5 -6 L2 3" fill="none" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 3 V8 M-4 8 H4" stroke-width="1.6"/>',
    'tubes': '<path d="M-8 -7 V7 M-4 -7 V7 M0 -7 V7 M4 -7 V7 M8 -7 V7 M-9 -7 H9" stroke-width="1.6" fill="none"/>',
    'hp': '<rect x="-6" y="-9" width="12" height="18" rx="1.5" fill="none" stroke-width="1.6"/><path d="M-4 -6 H4 M-4 -3 H4 M-4 0 H4" stroke-width="1.2"/>',
    'pylon': '<path d="M-6 9 L0 -9 L6 9 M-4 3 H4 M-2.5 -3 H2.5 M-8 -5 H8" fill="none" stroke-width="1.6" stroke-linejoin="round"/>',
    'home': '<path d="M-8 0 L0 -8 L8 0 V8 H-8 Z" fill="none" stroke-width="1.6" stroke-linejoin="round"/>',
    'car': '<path d="M-9 3 L-7 -3 L7 -3 L9 3 V7 H-9 Z M-6 7 V9 M6 7 V9" fill="none" stroke-width="1.6" stroke-linejoin="round"/>',
    'battery': '<rect x="-6" y="-10" width="12" height="20" rx="2" fill="none" stroke-width="1.7"/><path d="M-2.5 -12 H2.5" stroke-width="1.7"/><rect x="-3.5" y="-1" width="7" height="8" stroke="none"/><rect x="-3.5" y="-7" width="7" height="4" stroke="none" fill-opacity="0.5"/>',
    'tank': '<rect x="-7.5" y="-12" width="15" height="24" rx="7.5" fill="none" stroke-width="1.8"/><path d="M-7.5 0 H7.5" stroke-width="1.3"/><path d="M-4 5 Q0 2.5 4 5 M-4 -6 Q0 -8.5 4 -6" fill="none" stroke-width="1.3"/>',
}


def edge_point(nx, ny, r, tx, ty):
    d = math.hypot(tx - nx, ty - ny) or 1
    return nx + (tx - nx) / d * (r + 2), ny + (ty - ny) / d * (r + 2)


def make(P, fname):
    paths, nodes = [], []
    pos = {n[0]: (n[4], n[5]) for n in NODES}
    dots = lambda d, col, kw, cls: f'<path class="dots {cls}" d="{d}" fill="none" stroke="{col}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 10" style="animation-duration: {max(0.8, 3.2 / max(kw, 0.3)):.1f}s"/>'
    for a, b, kw, active, sag, kind in LINKS:
        (p1, r1), (p2, r2) = pos[a], pos[b]
        mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 + sag
        s = edge_point(p1[0], p1[1], r1, mx, my)
        e = edge_point(p2[0], p2[1], r2, mx, my)
        d = f"M{s[0]:.1f} {s[1]:.1f} Q{mx:.1f} {my:.1f} {e[0]:.1f} {e[1]:.1f}"
        col = P['flow-heat'] if kind == 'heat' else P['flow-elec']
        paths.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-opacity="{0.5 if active else 0.25}" stroke-width="1"{"" if active else " stroke-dasharray=\"3 4\""}/>')
        if active:
            paths.append(dots(d, col, kw, 'fwd'))
    for (k, anc, label, val, (nx, ny), r, colk, flow, kind, kw, icon, (c1, c2), top) in NODES:
        ax, ay = A[anc]
        lc = P['flow-heat'] if kind == 'heat' else P['flow-elec']
        sx, sy = edge_point(nx, ny, r, *c1)
        d = f"M{sx:.1f} {sy:.1f} C{c1[0]} {c1[1]} {c2[0]} {c2[1]} {ax:.1f} {ay:.1f}"
        idle = flow == 0 and k != 'tank'
        paths.append(f'<path d="{d}" fill="none" stroke="{lc}" stroke-opacity="{0.22 if flow == 0 else 0.5}" stroke-width="1"/>')
        if flow != 0:
            paths.append(dots(d, lc, kw, 'fwd' if flow > 0 else 'rev'))
        paths.append(f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="2.4" fill="{lc}" fill-opacity="{0.4 if flow == 0 else 1}"/>')
        ic = P['muted'] if idle else P[colk]
        tc = P['muted'] if idle else P['text']
        scale = r / 21
        ly1, ly2 = (ny - r - 23, ny - r - 8) if top else (ny + r + 15, ny + r + 30)
        nodes.append(f'<g transform="translate({nx} {ny})"><circle r="{r}" fill="{P["bg"]}" stroke="{ic}" stroke-width="1.6" stroke-opacity="{0.55 if idle else 1}"/>'
                     f'<g transform="scale({scale:.2f})" stroke="{ic}" fill="{ic}">{ICON[icon]}</g></g>'
                     f'<text x="{nx}" y="{ly1}" text-anchor="middle" font-family="Barlow, sans-serif" font-size="12" font-weight="500" fill="{P["muted"]}">{label}</text>'
                     f'<text x="{nx}" y="{ly2}" text-anchor="middle" font-family="\'Barlow Semi Condensed\', sans-serif" font-size="14" font-weight="600" fill="{tc}">{val}</text>')
    model_svg = f'<svg x="{ox:.1f}" y="{oy}" width="{VBW * f:.0f}" height="{VBH * f:.0f}" viewBox="0 0 {VBW:.0f} {VBH:.0f}" fill="none" stroke="{P["structure"]}" class="model">{inner}</svg>'
    graphic = (f'<svg viewBox="0 0 {GW} {GH}" width="{GW}" height="{GH}" role="img" aria-label="Hausmodell mit Energieflüssen: oben PV Carport 2,4 kW lädt den Akku mit 1,2 kW, PV Dach 2,1 kW; '
               f'links Netz Einspeisung 1,8 kW, Haushalt 0,6 kW, Auto Standby; unten Wärmepumpe 0,9 kW Strom, 4,1 kW Wärme und Solarthermie 1,4 kW laden den Speicher">\n'
               f'    {model_svg}\n    {"".join(paths)}\n    {"".join(nodes)}\n  </svg>')
    path = f'haus-mockups/project/{fname}'
    old = open(path).read()
    new = re.sub(r'<svg viewBox="0 0 358 \d+".*?</svg>\n  <div style="display: grid', lambda m: graphic + '\n  <div style="display: grid', old, flags=re.S)
    assert new != old
    open(path, 'w').write(new)
    return new


night = {'bg': '#0f1b2a', 'surface': '#172739', 'surface-2': '#1e3248', 'line': '#2a4058', 'text': '#e8eef5', 'muted': '#8da0b5', 'structure': '#6f8aa8',
         'flow-elec': '#ffd447', 'flow-heat': '#ff5d8f', 'sun': '#ffc233', 'grid': '#8e9bff', 'battery': '#39d98a', 'heat': '#ff7a59', 'car': '#3fc8e8', 'warmth': '#ff5d8f'}
mono = {'bg': '#000000', 'surface': '#000000', 'surface-2': '#1c1c1c', 'line': '#3d3d3d', 'text': '#ffffff', 'muted': '#a6a6a6', 'structure': '#bdbdbd',
        'flow-elec': '#ffffff', 'flow-heat': '#939393', 'sun': '#ffffff', 'grid': '#b3b3b3', 'battery': '#bdbdbd', 'heat': '#ffffff', 'car': '#dedede', 'warmth': '#939393'}
for n, P, fn in (('e-mono', mono, 'ModellMono.dc.html'), ('e-night', night, 'ModellNacht.dc.html')):
    h = make(P, fn)
    for t in ('<script src="./support.js"></script>', '<x-dc>', '</x-dc>', '<helmet>', '</helmet>'):
        h = h.replace(t, '')
    open(n + '.html', 'w').write(h)
print('ok')
