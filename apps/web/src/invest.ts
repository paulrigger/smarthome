// Investitions-Annahmen für die Amortisation, pro Gerät (localStorage). Strompreise kommen aus den Tarifen (API).
import { useEffect, useState } from 'react';

export interface AssetCfg {
  invest: number; // € nach Förderung
  since: string; // YYYY-MM-DD Inbetriebnahme ('' = aus Daten)
}

export interface InvestCfg {
  carport: AssetCfg & { kwp: number };
  battery: AssetCfg & { kwh: number };
}

// Fiktive Annahmen – in der App anpassbar
export const DEFAULT_INVEST: InvestCfg = {
  carport: { invest: 12_000, since: '', kwp: 10 },
  battery: { invest: 7_000, since: '', kwh: 10 },
};

const KEY = 'invest.v1';

function load(): InvestCfg {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_INVEST;
    const v = JSON.parse(raw) as Partial<InvestCfg>;
    return {
      carport: { ...DEFAULT_INVEST.carport, ...v.carport },
      battery: { ...DEFAULT_INVEST.battery, ...v.battery },
    };
  } catch {
    return DEFAULT_INVEST;
  }
}

export function useInvest(): [InvestCfg, (c: InvestCfg) => void] {
  const [cfg, setCfg] = useState<InvestCfg>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cfg));
    } catch {
      /* privat */
    }
  }, [cfg]);
  return [cfg, setCfg];
}
