// Zählerstände robust in Energie je Fenster umrechnen.
//
// Influx enthält vereinzelt falsche Zählerstände (Node-RED schreibt 0 bei Messlücken, Modbus liest Teilwerte,
// z. B. Smart Meter Mai/Sep/Okt 2025). Eine einfache Differenz macht daraus riesige Sprünge.
// Regeln (Basis = letzter gültiger Stand):
//  - Stand < Basis: Einbruch → ignorieren.
//  - Stand > Basis + maxKw × Zeit seit Basis: unmöglicher Sprung → ignorieren.
//  - Bleibt ein abweichender Stand über `confirm` Fenster stabil (Zählertausch/Reset), wird er neue Basis – ohne Energie.
//  - sonst: Energie = Stand − Basis.

export interface CounterReading {
  time: Date; // Fensteranfang
  value: number; // Rohwert (Einheit der Serie)
}

export interface CounterOpts {
  /** Rohwert → kWh */
  factor: number;
  /** größte mögliche mittlere Leistung in kW */
  maxKw: number;
  /** Fensterlänge in h (Mindestzeit für die Obergrenze) */
  stepH: number;
  /** so viele zusammenpassende abweichende Stände bestätigen eine neue Basis */
  confirm?: number;
}

/** Liefert je Fenster (ab dem zweiten) die Differenz in Rohwert-Einheiten, wie Flux difference(). */
export function counterDeltas(readings: CounterReading[], o: CounterOpts): CounterReading[] {
  const list = [...readings].filter((r) => Number.isFinite(r.value)).sort((a, b) => a.time.getTime() - b.time.getTime());
  const out: CounterReading[] = [];
  if (!list.length) return out;
  const confirm = o.confirm ?? 3;
  const f = Math.abs(o.factor) || 1;
  let base = list[0];
  let pending: CounterReading[] = [];

  for (const r of list.slice(1)) {
    const hours = Math.max(o.stepH, (r.time.getTime() - base.time.getTime()) / 3_600_000);
    const d = r.value - base.value;
    const ok = d >= 0 && d * f <= o.maxKw * hours;
    if (ok) {
      out.push({ time: r.time, value: d });
      // Zeit der letzten Änderung behalten: hängt ein Ausleser (gleicher Stand über Tage), darf der Nachholsprung
      // so groß sein wie maxKw × Hängezeit (Smart Meter 13.–18.01.2025: 181 kWh nach 5 Tagen)
      if (d > 0) base = r;
      pending = [];
      continue;
    }
    // Abweichung: merken; passen die letzten `confirm` Stände zueinander, ist das der neue echte Stand
    const prev = pending[pending.length - 1];
    const fits = prev && r.value >= prev.value && (r.value - prev.value) * f <= o.maxKw * Math.max(o.stepH, (r.time.getTime() - prev.time.getTime()) / 3_600_000);
    pending = fits ? [...pending, r] : [r];
    if (pending.length >= confirm) {
      // neue Basis; Energie zwischen den bestätigenden Ständen zählt
      for (let k = 1; k < pending.length; k++) out.push({ time: pending[k].time, value: pending[k].value - pending[k - 1].value });
      base = pending[pending.length - 1];
      pending = [];
    }
  }
  return out;
}
