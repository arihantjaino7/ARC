// Score → colour interpolation — §1.3 "Score-driven colour". Plain module
// (no "use client") so server components can call it directly, e.g. to tint
// a static number without needing the animated Bar/Ring. Bar.tsx and Ring.tsx
// both build on this so a bar, a ring, and a plain number always agree.

const STOPS: [number, string][] = [
  [0, "#6b7770"], // ink-faint
  [40, "#4f7a5b"], // moss
  [75, "#a3c9a8"], // sage
  [100, "#d6e4b0"], // lime
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Interpolates the score palette at `score` (0-100), returned as an `rgb()` string. */
export function scoreColor(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  let lower = STOPS[0];
  let upper = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (clamped >= STOPS[i][0] && clamped <= STOPS[i + 1][0]) {
      lower = STOPS[i];
      upper = STOPS[i + 1];
      break;
    }
  }
  const span = upper[0] - lower[0];
  const t = span === 0 ? 0 : (clamped - lower[0]) / span;
  const [r1, g1, b1] = hexToRgb(lower[1]);
  const [r2, g2, b2] = hexToRgb(upper[1]);
  return `rgb(${Math.round(lerp(r1, r2, t))}, ${Math.round(lerp(g1, g2, t))}, ${Math.round(lerp(b1, b2, t))})`;
}
