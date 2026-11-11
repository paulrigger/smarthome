import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_THRESHOLDS, FLOOR_NAMES, ROOMS, deviceState, ease, fitCam, floorZ, doorLines, doorsOn, furnBoxLines, furnitureOn, houseScene, lerpCam, modelCam, panelsOn, project, roomCenter,
  type Cam, type EnergySummary, type Face, type FloorId, type P3, type LiveSnapshot, type RoomDef, type SceneState, type Thresholds,
} from '@smarthome/shared';
import { place } from '@smarthome/shared';
import { energyShort as energy, join, num, power } from '../format';
import { Close, Coffee, Dishwasher, Freezer, Fridge, Oven, Router, Stove, Washer } from './Icons';
import { runLabel } from '@smarthome/shared';

/*
 * Haus als Explosionszeichnung (Hausmodell antippen): Das Haus startet exakt auf dem Linienmodell, die Knoten fliegen
 * aus dem Bild (FlowModel, Klasse exit), Dach / OG / EG fahren auseinander und füllen den Bildschirm.
 * Raum antippen → Kamera zoomt auf den Raum, danach erst die Einrichtung (Möbel, Geräte). Keine Stockwerksansicht.
 * Geometrie + Projektion rein in packages/shared/src/floors.ts.
 */

interface Props {
  /** Bildschirm-Rechteck des Modell-SVG beim Antippen + dessen viewBox */
  from: { rect: DOMRect; vb: { w: number; h: number } };
  live: LiveSnapshot | null;
  summary: EnergySummary | null;
  isLive: boolean;
  th?: Thresholds;
  /** Rückweg beginnt (Knoten wieder einfliegen lassen) */
  onClosing: () => void;
  onClose: () => void;
  onAppliance: (id: string) => void;
}

const OPEN_MS = 900;
const FOCUS_MS = 650;
const ICONS: Record<string, typeof Coffee> = {
  coffeemachine: Coffee, herd: Stove, backrohr: Oven, geschirrspueler: Dishwasher, washingmachine: Washer, kuehlschrank: Fridge, freezer: Freezer, router: Router,
};
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Phase = 'opening' | 'open' | 'zooming' | 'zoomed' | 'unzooming' | 'closing';

export function HouseExplode({ from, live, summary, isLive, th = DEFAULT_THRESHOLDS, onClosing, onClose, onAppliance }: Props) {
  const [vw, setVw] = useState(() => ({ w: innerWidth, h: innerHeight }));
  const [phase, setPhase] = useState<Phase>('opening');
  const [t, setT] = useState(0); // Explosion 0..1
  const [f, setF] = useState(0); // Fokus 0..1
  const [room, setRoom] = useState<string | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    const on = () => setVw({ w: innerWidth, h: innerHeight });
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);

  const animate = (set: (v: number) => void, a: number, b: number, ms: number, done: () => void) => {
    cancelAnimationFrame(raf.current);
    const dur = reduced() ? 1 : ms;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = clamp((now - t0) / dur);
      set(a + (b - a) * k);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else done();
    };
    raf.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    animate(setT, 0, 1, OPEN_MS, () => setPhase('open'));
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (phase !== 'open') return;
    setPhase('closing');
    onClosing();
    animate(setT, 1, 0, OPEN_MS * 0.85, onClose);
  };
  // Raum antippen: Kamera zoomt auf den Raum (f 0 → 1), danach erscheinen Einrichtung und Geräte
  const pickRoom = (id: string) => {
    if (phase === 'zooming' || phase === 'unzooming' || phase === 'closing') return;
    setRoom(id);
    if (phase === 'open') {
      setPhase('zooming');
      animate(setF, 0, 1, FOCUS_MS, () => setPhase('zoomed'));
    }
  };
  const unzoom = () => {
    if (phase !== 'zoomed' && phase !== 'zooming') return;
    setPhase('unzooming');
    animate(setF, f, 0, FOCUS_MS, () => (setPhase('open'), setRoom(null)));
  };
  const back = () => (room ? unzoom() : close());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  // Kameras: Start = Linienmodell, Explosion = ganzer Bildschirm, Raum = Zoom auf den Raum
  const top = 64;
  const box = { x: 14, y: top, w: vw.w - 28, h: vw.h - top - 84 }; // unten Platz für „Erdgeschoss“ + Hinweis
  const cam0 = useMemo(() => modelCam(from.rect, from.vb), [from]);
  const camE = useMemo(() => fitCam(houseScene({ e: 1 }), box, ['eg', 'og']), [vw.w, vw.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const roomDef = room ? ROOMS.find((r) => r.id === room) : undefined;
  const S1: SceneState = { e: 1, focus: null, f: 0 };
  // Zoom-Ziel: Grundriss des Raumes im Stockwerk (ohne Verdeckung), oberer Teil des Bildschirms (unten: Raum-Blatt)
  const camR = useMemo(() => {
    if (!roomDef) return camE;
    const z = floorZ(roomDef.floor, S1) + 0.5;
    const faces: Face[] = [{ pts: roomDef.poly.map(([x, y]) => place([x, y, z], S1)), kind: 'room', group: roomDef.floor }];
    return fitCam(faces, { x: box.x, y: top + 40, w: box.w, h: box.h * 0.55 });
  }, [room, camE]); // eslint-disable-line react-hooks/exhaustive-deps
  const e = ease(t);
  const ef = ease(f);
  const cam: Cam = room ? lerpCam(camE, camR, ef) : lerpCam(cam0, camE, e);
  const st: SceneState = { e, focus: null, f: 0 };
  const faces = houseScene(st);

  const appl = (id: string) => ({
    live: live?.appliances.find((a) => a.id === id) ?? null,
    sum: summary?.appliances.find((a) => a.id === id) ?? null,
  });
  const floorValue = (fl: FloorId) => {
    const rs = ROOMS.filter((r) => r.floor === fl);
    const ids = rs.flatMap((r) => r.devices ?? []);
    const temp = rs.map((r) => (r.climate ? live?.rooms.find((x) => x.id === r.climate)?.climate.temp : null)).find((x) => x != null);
    const parts = [];
    if (ids.length) parts.push(isLive ? join(power(ids.reduce((s, id) => s + (appl(id).live?.power ?? 0), 0))) : join(energy(ids.reduce((s, id) => s + (appl(id).sum?.kwh ?? 0), 0))));
    if (temp != null) parts.push(`${num(temp)} °C`);
    return parts.join(' · ');
  };
  const active = (r: RoomDef) => !!(r.devices?.length || r.climate || r.tank);

  // Flächen zeichnen; das Dach verschwindet mit der Explosion
  const fade = (g: string) => (g === 'roof' ? clamp(1 - e * 1.4) : 1);
  const shapes = faces.map((fc, i) => {
    const pts = fc.pts.map((p) => project(p, cam).map((v) => v.toFixed(1)).join(',')).join(' ');
    const r = fc.room ? ROOMS.find((x) => x.id === fc.room) : undefined;
    const cls =
      `hx-${fc.kind}` +
      (fc.kind === 'room' && r && active(r) ? ' act' : '') +
      (fc.kind === 'room' && room === fc.room ? ' sel' : '');
    const op = fade(fc.group) * (fc.room === '__zubauRoof' ? clamp(1 - e * 2) : 1);
    if (op <= 0.01) return null;
    const clickRoom = fc.kind === 'room' && !!r && (phase === 'open' || phase === 'zoomed');
    const props = {
      className: cls,
      'data-room': fc.kind === 'room' ? fc.room : undefined,
      opacity: op < 1 ? op : undefined,
      onClick: clickRoom ? (ev: React.MouseEvent) => (ev.stopPropagation(), pickRoom(fc.room!)) : undefined,
    };
    if (fc.strokes)
      return (
        <g key={i} opacity={props.opacity} onClick={props.onClick} className="hx-wallg">
          <polygon points={pts} className={`${cls} nostroke`} />
          {fc.strokes.map((l, j) => (
            <polyline key={j} points={l.map((p) => project(p, cam).map((v) => v.toFixed(1)).join(',')).join(' ')} className="hx-edge" />
          ))}
        </g>
      );
    return fc.line ? <polyline key={i} points={pts} {...props} /> : <polygon key={i} points={pts} {...props} />;
  });

  // Einrichtung im Erdgeschoss (Küche): Umrisse ohne Verdeckung, folgt dem Stockwerk
  // Einrichtung erst nach dem Zoom auf die Küche (wie besprochen): Geräte und Möbel nur dort
  const fg = room === 'kueche' ? ef : 0;
  const zEg = floorZ('eg', st);
  const pt = (p: P3) => project(place([p[0], p[1], p[2] + zEg], st), cam).map((v) => v.toFixed(1)).join(',');
  const furniture = fg > 0.01 ? (
    <g opacity={fg < 1 ? fg : undefined} className="hx-furn" pointerEvents="none">
      {furnitureOn('eg').flatMap((b) => furnBoxLines(b)).map((l, i) => (
        <polyline key={`f${i}`} points={l.map(pt).join(' ')} className="hx-furn-l" />
      ))}
      {panelsOn('eg').map((pn, i) => (
        <polyline key={`p${i}`} points={pn.pts.map(pt).join(' ')} className="hx-furn-p" />
      ))}
      {doorsOn('eg').flatMap((d) => doorLines(d)).map((l, i) => (
        <polyline key={`d${i}`} points={l.map(pt).join(' ')} className="hx-door" />
      ))}
    </g>
  ) : null;

  // Beschriftungen
  const labelOp = phase === 'closing' || phase === 'opening' ? clamp((e - 0.75) / 0.25) : 1;
  const floorLabels =
    (['og', 'eg'] as FloorId[]).map((fl) => {
      const op = labelOp * (room ? 0 : 1);
      if (op <= 0.01) return null;
      const [x, y] = project(place([-1.7, 0, floorZ(fl, st)], st), cam);
      return (
        <text key={fl} x={16} y={y + 30} opacity={op} className="hx-flabel">
          <tspan className="hx-fname">{FLOOR_NAMES[fl]}</tspan>
          <tspan className="hx-fval" dx="8">{floorValue(fl)}</tspan>
        </text>
      );
    });
  const roomLabels = ROOMS.map((r) => {
      const [cx, cy] = roomCenter(r);
      // etwas über dem Boden verankert (sonst hängen die Texte optisch zu tief), Block mittig darum
      const [x, y] = project(place([cx, cy, floorZ(r.floor, st) + 0.7], st), cam);
      const ids = r.devices ?? [];
      const c = r.climate ? live?.rooms.find((q) => q.id === r.climate)?.climate : null;
      const lines: { t: string; cls: string; h: number }[] = [];
      if (!r.noLabel) lines.push({ t: r.name, cls: 'hx-rname', h: 15 });
      if (ids.length)
        lines.push({
          t: isLive ? join(power(ids.reduce((s, id) => s + (appl(id).live?.power ?? 0), 0))) : join(energy(ids.reduce((s, id) => s + (appl(id).sum?.kwh ?? 0), 0))),
          cls: 'hx-rval', h: 18,
        });
      if (c?.temp != null) lines.push({ t: `${num(c.temp)} °C`, cls: 'hx-rval', h: 18 });
      const air = [c?.hum != null ? `${num(c.hum, 0)} %` : null, c?.co2 != null ? `${num(c.co2, 0)} ppm` : null].filter(Boolean).join(' · ');
      if (air) lines.push({ t: air, cls: 'hx-rair', h: 15 });
      if (!lines.length) return null;
      const total = lines.reduce((s, l) => s + l.h, 0);
      let yy = y - total / 2;
      return (
        <g key={r.id} opacity={labelOp * (1 - ef)} className={`hx-rlabel${active(r) ? ' act' : ''}`}>
          {lines.map((l, i) => {
            yy += l.h;
            return <text key={i} x={x} y={yy - 4} className={l.cls}>{l.t}</text>;
          })}
        </g>
      );
    });

  const bg = clamp((e - 0.2) / 0.45);
  const houseOp = clamp(t / 0.12);
  const sel = room ? ROOMS.find((r) => r.id === room)! : null;
  const title = roomDef ? roomDef.name : 'Haus';

  return (
    <div className="hx" onClick={() => (room ? unzoom() : close())}>
      <div className="hx-bg" style={{ opacity: bg }} />
      <svg className="hx-svg" viewBox={`0 0 ${vw.w} ${vw.h}`} style={{ opacity: houseOp }} role="img" aria-label="Haus als Explosionszeichnung: Dach, Obergeschoss, Erdgeschoss">
        {shapes}
        {furniture}
        {floorLabels}
        {roomLabels}
      </svg>
      <header className="hx-head" style={{ opacity: bg }}>
        <button onClick={(ev) => (ev.stopPropagation(), back())} aria-label="Zurück">‹ {room ? 'Haus' : 'Übersicht'}</button>
        <b>{title}</b>
        <span />
      </header>
      {phase === 'open' && <p className="hx-hint">Raum antippen</p>}
      {sel && <RoomSheet room={sel} live={live} summary={summary} isLive={isLive} th={th} onClose={() => setRoom(null)} onAppliance={onAppliance} />}
    </div>
  );
}

function RoomSheet({ room, live, summary, isLive, th, onClose, onAppliance }: {
  room: RoomDef; live: LiveSnapshot | null; summary: EnergySummary | null; isLive: boolean; th: Thresholds; onClose: () => void; onAppliance: (id: string) => void;
}) {
  const devs = (room.devices ?? []).map((id) => {
    const l = live?.appliances.find((a) => a.id === id);
    const s = summary?.appliances.find((a) => a.id === id);
    return { id, name: (s?.name ?? l?.name ?? id).replace(/­/g, ''), w: l?.power ?? null, kwh: s?.kwh ?? null, run: l?.run ?? null };
  });
  const clima = room.climate ? live?.rooms.find((r) => r.id === room.climate)?.climate : null;
  const totalW = devs.reduce((s, d) => s + (d.w ?? 0), 0);
  const totalKwh = devs.reduce((s, d) => s + (d.kwh ?? 0), 0);
  return (
    <div className="hx-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Raum ${room.name}`}>
      <div className="hx-grab" />
      <div className="hx-sh">
        <b>{room.name}</b>
        {devs.length > 0 && <span>{isLive ? `jetzt ${join(power(totalW))} · ` : ''}{join(energy(totalKwh))}</span>}
        <button className="hx-x" onClick={onClose} aria-label="Schließen"><Close size={20} /></button>
      </div>
      {clima && (
        <div className="hx-row">
          <span className="hx-ic on">°C</span>
          <span className="hx-nm">Raumklima<small>{[clima.hum != null ? `${num(clima.hum, 0)} % Feuchte` : null, clima.co2 != null ? `${num(clima.co2, 0)} ppm CO₂` : null].filter(Boolean).join(' · ')}</small></span>
          <span className="hx-v">{clima.temp != null ? `${num(clima.temp)} °C` : '–'}</span>
        </div>
      )}
      {room.tank && live && (
        <div className="hx-row">
          <span className="hx-ic on">WW</span>
          <span className="hx-nm">Speicher<small>Puffer {live.heatpump.bufferTop != null ? `${num(live.heatpump.bufferTop, 0)} °C` : '–'}</small></span>
          <span className="hx-v">{live.heatpump.dhwTop != null ? `${num(live.heatpump.dhwTop, 0)} °C` : '–'}</span>
        </div>
      )}
      {devs.map((d) => {
        const stt = isLive ? deviceState(d.id, d.w, th) : null;
        const Icon = ICONS[d.id];
        const left = isLive ? runLabel(d.run) : null;
        return (
          <button key={d.id} className={`hx-row ${stt ?? ''}`} onClick={() => onAppliance(d.id)}>
            <span className={`hx-ic ${stt ?? ''}`}>{Icon && <Icon size={20} />}</span>
            <span className="hx-nm">{d.name}<small>{stt === 'on' ? 'an' : stt === 'standby' ? 'Standby' : stt === 'off' ? 'aus' : ''}</small></span>
            <span className="hx-v">
              {isLive ? (left ?? (stt === 'off' ? 'aus' : join(power(d.w)))) : join(energy(d.kwh))}
              {isLive && <small>{join(energy(d.kwh))}</small>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
