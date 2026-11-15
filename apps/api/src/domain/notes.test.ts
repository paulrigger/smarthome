import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { openNotesStore } from '../sources/notesStore';

describe('Notizen', () => {
  it('legt an, listet offene und markiert erledigt', () => {
    const s = openNotesStore(new DatabaseSync(':memory:'));
    const a = s.add({ route: '#/?detail=node:battery', target: 'Akku 24 W', text: 'Schrift größer' });
    const b = s.add({ route: '#/auto', target: 'Auto', text: 'Ziel-SoC fehlt' });
    expect(a.done).toBe(false);
    expect(s.list(false).map((n) => n.id)).toEqual([b.id, a.id]);
    expect(s.setDone(a.id, true)?.done).toBe(true);
    expect(s.list(false).map((n) => n.id)).toEqual([b.id]);
    expect(s.list(true)).toHaveLength(2);
    expect(s.setDone(999, true)).toBeNull();
  });

  it('bearbeitet Text und Pfeil', () => {
    const s = openNotesStore(new DatabaseSync(':memory:'));
    const a = s.add({ route: '', target: 'x', text: 'mit Pfeil', anchor: 'Haus', fx: 0.2, fy: 0.3 });
    const b = s.add({ route: '', target: 'x', text: 'ohne Pfeil' });
    expect(s.edit(a.id, { fx: 0.5, fy: 0.6 })).toMatchObject({ fx: 0.5, fy: 0.6, anchor: 'Haus' });
    expect(s.edit(a.id, { text: 'neu' })).toMatchObject({ text: 'neu', fx: 0.5 });
    expect(s.edit(a.id, { anchor: 'Auto', fx: 0.1, fy: 0.2 })).toMatchObject({ anchor: 'Auto', fx: 0.1, fy: 0.2 });
    expect(s.edit(b.id, { fx: 0.5, fy: 0.6 })?.fx).toBeNull();
    expect(s.edit(b.id, { anchor: 'Auto', fx: 0.1, fy: 0.2 })).toMatchObject({ anchor: 'Auto' });
  });
});
