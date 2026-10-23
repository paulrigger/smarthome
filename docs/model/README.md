# 3D-Linienmodell Haus + Carport

Rudimentäres Modell für die App (Ersatz/Variante der Hausgrafik). Erzeugt von `build_model.py` (Python + numpy):
Flächenmodell → Projektion → verdeckte Kanten per Tiefenpuffer entfernt → SVG-Linien mit `stroke="currentColor"`
(Farbe kommt aus dem Theme-Token, z. B. `color: var(--structure)`).

- `haus-sw.svg` Blick von Südwest (Carport vorne), `haus-so.svg` von Südost, `haus-sued.svg` flach von Süden
- `haus.obj` Flächenmodell (Meter, OBJ: y oben) für einen 3D-Viewer
- Neu erzeugen: `python3 docs/model/build_model.py docs/model`

Quellen der Maße: Einreichplan 2012 (Erdgeschoss, Dachaufsicht, Ansichten 1:100, Lage 1:200).
Hauptdach 16,4 × 11,0 m, Traufe 5,3 m, First 6,9 m (~16°), Südüberstand 1,9 m auf Stützen, Zubau Ost 5 × 5 × 3 m (Flachdach), Gewächshaus.
**Annahmen:** Carport = Baukörper aus dem Lageplan südwestlich des Hauses (5,6 × 7,9 m, Höhe 2,6 m, Flachdach mit 20 PV-Modulen),
ohne die leichte Verdrehung zur Straße. PV-Belegung Hausdach (8 × 3) und 2 Röhrenkollektoren laut Plan 2012. Alle Maße oben in `build_model.py` anpassbar.
