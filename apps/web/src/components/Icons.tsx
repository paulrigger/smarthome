// Linien-Icons, 24er Raster, Farbe über currentColor.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 24): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
});

export const Sun = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
  </svg>
);
export const Panel = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 4h14l2 11H3z" /><path d="M4 9.5h16M9.3 4l-.8 11M14.7 4l.8 11M12 15v4M8 19.5h8" />
  </svg>
);
export const Battery = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="6.5" y="4.5" width="11" height="17" rx="2" /><path d="M10 2.5h4M12.8 8.5 10.2 13h3.6l-2.6 4.5" />
  </svg>
);
export const Pylon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 2 7 22M12 2l5 20M8.6 15.5h6.8M9.6 10.5h4.8M5 6h14M6.2 6 12 10.5 17.8 6M8.6 15.5 15.9 22M15.4 15.5 8.1 22" />
  </svg>
);
export const HeatPump = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="2.5" y="5" width="19" height="13" rx="2" /><circle cx="9" cy="11.5" r="3.6" />
    <path d="M9 7.9v7.2M5.4 11.5h7.2M15.5 9h3M15.5 12h3M15.5 15h3M5 18v2M19 18v2" />
  </svg>
);
export const Car = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3.5 16.5v-4l2-5a2 2 0 0 1 1.9-1.3h9.2a2 2 0 0 1 1.9 1.3l2 5v4" /><path d="M2.5 12.5h19v4h-19z" />
    <circle cx="7" cy="14.5" r=".6" fill="currentColor" /><circle cx="17" cy="14.5" r=".6" fill="currentColor" /><path d="M5 16.5v2.5M19 16.5v2.5" />
  </svg>
);
export const Home = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3 11 12 4l9 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></svg>
);
export const Euro = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M18 6.5A7 7 0 1 0 18 17.5" /><path d="M4 10h10M4 14h10" /></svg>
);
export const Flame = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 21c4 0 6.5-2.6 6.5-6.2 0-4.3-3.6-6.3-4.6-10.3-2.3 1.4-3.6 3.6-3.6 6-1.3-.5-2.1-1.6-2.4-2.8-1.6 1.7-2.4 3.7-2.4 6.1 0 4.2 2.6 7.2 6.5 7.2Z" /></svg>
);
export const Chart = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3.5 20.5h17" /><path d="m4.5 15 4.5-5 4 3.5 6.5-8" /></svg>
);
export const Close = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);

// ---------- Geräte ----------
export const Coffee = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 3.5h14v4H5z" /><path d="M6 7.5v13h12v-13" /><path d="M9.5 7.5v3h5v-3" /><path d="M9 14.5h4.5v3.5H9z" /><path d="M13.5 15h1.3a1.2 1.2 0 0 1 0 2.4h-1.3" /><circle cx="16" cy="5.5" r=".5" fill="currentColor" />
  </svg>
);
export const Freezer = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="7" width="18" height="12" rx="1.5" /><path d="M3 10.5h18M10 8.8h4M12 13v4.5M10 14l4 2.5M14 14l-4 2.5" />
  </svg>
);
export const Oven = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><path d="M3.5 8h17" /><rect x="6.5" y="10.5" width="11" height="7" rx="1" />
    <path d="M10 12.5c-.6.7.6 1.3 0 2M12 12.5c-.6.7.6 1.3 0 2M14 12.5c-.6.7.6 1.3 0 2" /><circle cx="7" cy="5.8" r=".5" fill="currentColor" /><circle cx="9.5" cy="5.8" r=".5" fill="currentColor" />
  </svg>
);
export const Dishwasher = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><path d="M3.5 8h17M6 5.8h4" /><path d="M6.5 16.5h11" /><path d="M8 16.5v-4.5a2 2 0 0 1 4 0v4.5" /><path d="M13.5 16.5V12M15.5 16.5V12" />
  </svg>
);
export const Router = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="13.5" width="18" height="6" rx="1.5" /><path d="M7 13.5 5.5 8M17 13.5 18.5 8" /><path d="M9.2 7.2a4 4 0 0 1 5.6 0M7.4 5a6.6 6.6 0 0 1 9.2 0" />
    <circle cx="7" cy="16.5" r=".6" fill="currentColor" /><circle cx="9.5" cy="16.5" r=".6" fill="currentColor" />
  </svg>
);
export const Fridge = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="6" y="2.5" width="12" height="19" rx="1.5" /><path d="M6 9.5h12M9 5v2.5M9 12v3.5" />
  </svg>
);
export const Stove = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><circle cx="8.5" cy="8.5" r="2.3" /><circle cx="15.5" cy="8.5" r="2.3" /><circle cx="8.5" cy="15" r="2.3" /><circle cx="15.5" cy="15" r="2.3" />
  </svg>
);
export const Washer = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3.5" y="2.5" width="17" height="19" rx="1.5" /><path d="M3.5 7h17" /><circle cx="12" cy="14" r="4.6" /><path d="M8.8 14.5c1.5-1 2.8 1 4.3 0s2-.7 2.3-.3" /><circle cx="6.5" cy="4.8" r=".5" fill="currentColor" /><path d="M13 4.8h4.5" />
  </svg>
);

export const ChevronLeft = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M15 5l-7 7 7 7" /></svg>
);
export const ChevronRight = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M9 5l7 7-7 7" /></svg>
);
