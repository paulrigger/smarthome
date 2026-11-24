import type { Problem } from '@smarthome/shared';

/** Störungsmarke an einem Symbol: rot (Gerät down) bzw. gelb (verspätet). */
export function ProblemMark({ x, y, level }: { x: number; y: number; level: Problem }) {
  return (
    <g className={`pmark ${level}`} pointerEvents="none" aria-label={level === 'down' ? 'Störung' : 'verspätet'}>
      <circle cx={x} cy={y} r={6.5} />
      <text x={x} y={y + 3.5} textAnchor="middle">!</text>
    </g>
  );
}
