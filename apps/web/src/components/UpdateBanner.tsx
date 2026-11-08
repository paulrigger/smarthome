import { useState } from 'react';
import { dismissUpdate, reloadToUpdate, useUpdateReady } from '../swUpdate';
import { Close } from './Icons';

/** Overlay oben: neue Version verfügbar → „Neu laden“. */
export function UpdateBanner() {
  const ready = useUpdateReady();
  const [busy, setBusy] = useState(false);
  if (!ready) return null;
  return (
    <div className="upd" role="status" aria-live="polite">
      <span className="upd-txt">
        <b>Neue Version verfügbar</b>
        <small>Jetzt aktualisieren</small>
      </span>
      <button className="upd-go" disabled={busy} onClick={() => (setBusy(true), void reloadToUpdate())}>
        {busy ? 'Lädt …' : 'Neu laden'}
      </button>
      <button className="upd-x" onClick={dismissUpdate} aria-label="Später">
        <Close size={18} />
      </button>
    </div>
  );
}
