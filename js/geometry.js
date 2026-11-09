// Small geometry + randomness helpers used by the layout.

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Area two rectangles ({x, y, w, h}) share; 0 if they don't touch. */
export function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Distance from a point to the nearest edge of a rectangle (0 if inside). */
export function distanceToRect(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** How far a ray from a w×h box's center at angle t travels before leaving the box. */
export function edgeDistance(w, h, t) {
  const cos = Math.max(Math.abs(Math.cos(t)), 1e-6);
  const sin = Math.max(Math.abs(Math.sin(t)), 1e-6);
  return Math.min(w / 2 / cos, h / 2 / sin);
}

/** Deterministic random numbers, so the layout comes out the same every visit. */
export function seededRandom(seed) {
  let s = seed >>> 0;
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  return {
    next,
    between: (a, b) => a + next() * (b - a),
    shuffle(list) {
      const a = [...list];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}
