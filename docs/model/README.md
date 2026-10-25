# 3D-Linienmodell Haus + Carport

Rudimentäres Modell für die App (Ersatz/Variante der Hausgrafik). Erzeugt von `build_model.py` (Python + numpy):
Flächenmodell → Projektion → verdeckte Kanten per Tiefenpuffer entfernt → SVG-Linien mit `stroke="currentColor"`
(Farbe kommt aus dem Theme-Token, z. B. `color: var(--structure)`).

- `haus-sw.svg` Blick von Südwest (Carport vorne), `haus-so.svg` von Südost, `haus-sued.svg` flach von Süden
- `haus.obj` Flächenmodell (Meter, OBJ: y oben) für einen 3D-Viewer
- Neu erzeugen: `python3 docs/model/build_model.py docs/model`

Quellen der Maße: Einreichplan 2012 (Erdgeschoss, Dachaufsicht, Ansichten 1:100, Lage 1:200).
Hauptdach 16,4 × 11,0 m, Traufe 5,3 m, First 6,9 m (~16°), Südüberstand 1,9 m auf Stützen, Zubau Ost 5 × 5 × 3 m (Flachdach). Gewächshaus und Dachverglasung weggelassen. Hohes Stiegenhausfenster in der Westwand des Anbaus, Lambda EU-L (Säule 1,6 m, oben Lamellengitter mit Schwungbögen, unten geschlossen, abgefaste Frontkanten) vor der Westwand im Nordteil.
**Carport** (Lage aus Lageplan, Form nach Pauls SketchUp-Skizze): 5,6 × 7,9 m, Schmetterlingsdach mit Kehle Nord-Süd
(tiefste Stelle 2,6 m), Westflügel 3,4 m bis 3,25 m hoch mit 2 PV-Reihen, Ostflügel 2,2 m bis 3,0 m mit 1 PV-Reihe (je 7 Module).
Nordteil geschlossener Abstellraum mit Fensterband (Westseite), Südteil offen mit Zufahrt von Westen (ohne Stützen gezeichnet), Südwand geschlossen.
Akku an der Südwand des Abstellraums. Huawei AC Smart Charger außen an der Westwand des Abstellraums (hochkant, helle Front mit Lichtring/Logo, Sockel mit Typ-2-Dose und Klappe, ohne Kabel). Höhen und Längen geschätzt – in `build_model.py` (CARPORT) anpassbar.
Hauptansicht für die App: `haus-sw.svg`.

SVG-Klassen (für Styling in der App): `m-edge` Bauteilkanten, `m-pv` Modulrahmen, `m-cell` Zellraster (dünn, 50 %), `m-tube` Kollektorröhren, `m-detail` Feinheiten (Fenster, Wallbox, Wärmepumpe).
