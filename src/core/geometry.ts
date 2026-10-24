import type { Checkpoint, MapObject, Point, TrackMap } from "./types";

export function gateAt(map: TrackMap, index: number): Required<Checkpoint> {
  const p = map.checkpoints[index],
    previous = map.checkpoints[index - 1] ?? map.start;
  return {
    ...p,
    id: p.id ?? `${map.id}:legacy-gate:${index}`,
    width: p.width ?? map.roadWidth * 0.8,
    angle: p.angle ?? Math.atan2(p.y - previous.y, p.x - previous.x),
    order: index,
    directional: p.directional ?? true,
  };
}
export function gateEnds(
  g: Checkpoint & { width: number; angle: number },
): [Point, Point] {
  const dx = (-Math.sin(g.angle) * g.width) / 2,
    dy = (Math.cos(g.angle) * g.width) / 2;
  return [
    { x: g.x - dx, y: g.y - dy },
    { x: g.x + dx, y: g.y + dy },
  ];
}
/** Forward negative→positive plane crossing, interpolated at the finite gate segment. */
export function gateCrossing(
  previous: Point,
  current: Point,
  gate: Required<Checkpoint>,
): number | null {
  const nx = Math.cos(gate.angle),
    ny = Math.sin(gate.angle);
  const a = (previous.x - gate.x) * nx + (previous.y - gate.y) * ny;
  const b = (current.x - gate.x) * nx + (current.y - gate.y) * ny;
  const forward = a < -1e-7 && b >= -1e-7;
  if (!forward && (gate.directional || !(a > 1e-7 && b <= 1e-7))) return null;
  const t = a / (a - b);
  const x = previous.x + (current.x - previous.x) * t - gate.x,
    y = previous.y + (current.y - previous.y) * t - gate.y;
  return Math.abs(-x * ny + y * nx) <= gate.width / 2 ? t : null;
}
export const crossesGate = (
  previous: Point,
  current: Point,
  gate: Required<Checkpoint>,
) => gateCrossing(previous, current, gate) !== null;
export function objectLocal(o: MapObject, p: Point): Point {
  const a = o.angle ?? 0,
    c = Math.cos(a),
    s = Math.sin(a),
    x = p.x - o.x - o.w / 2,
    y = p.y - o.y - o.h / 2;
  return { x: x * c + y * s, y: -x * s + y * c };
}
export function objectWorld(o: MapObject, p: Point): Point {
  const a = o.angle ?? 0,
    c = Math.cos(a),
    s = Math.sin(a);
  return {
    x: o.x + o.w / 2 + p.x * c - p.y * s,
    y: o.y + o.h / 2 + p.x * s + p.y * c,
  };
}
export function circleObject(o: MapObject, p: Point, radius: number): boolean {
  const q = objectLocal(o, p);
  const dx = q.x - Math.max(-o.w / 2, Math.min(o.w / 2, q.x)),
    dy = q.y - Math.max(-o.h / 2, Math.min(o.h / 2, q.y));
  return radius === 0
    ? Math.abs(q.x) <= o.w / 2 && Math.abs(q.y) <= o.h / 2
    : dx * dx + dy * dy < radius * radius;
}
/** Minimum separation for a circle vs OBB. The normal is in world space. */
export function circleContact(
  o: MapObject,
  p: Point,
  radius: number,
): { normal: Point; depth: number } | null {
  const q = objectLocal(o, p),
    cx = Math.max(-o.w / 2, Math.min(o.w / 2, q.x)),
    cy = Math.max(-o.h / 2, Math.min(o.h / 2, q.y));
  let dx = q.x - cx,
    dy = q.y - cy,
    d = Math.hypot(dx, dy),
    depth = radius - d;
  if (depth <= 0) return null;
  if (d < 1e-8) {
    const ex = o.w / 2 - Math.abs(q.x),
      ey = o.h / 2 - Math.abs(q.y);
    if (ex < ey) {
      dx = q.x >= 0 ? 1 : -1;
      dy = 0;
      depth = radius + ex;
    } else {
      dx = 0;
      dy = q.y >= 0 ? 1 : -1;
      depth = radius + ey;
    }
    d = 1;
  }
  const a = o.angle ?? 0,
    c = Math.cos(a),
    s = Math.sin(a);
  return {
    normal: { x: (dx * c - dy * s) / d, y: (dx * s + dy * c) / d },
    depth,
  };
}
export function objectBounds(o: MapObject) {
  const c = Math.abs(Math.cos(o.angle ?? 0)),
    s = Math.abs(Math.sin(o.angle ?? 0));
  return { x: (c * o.w) / 2 + (s * o.h) / 2, y: (s * o.w) / 2 + (c * o.h) / 2 };
}
export function clampObject(
  o: MapObject,
  map: Pick<TrackMap, "width" | "height">,
): MapObject {
  let next = { ...o, w: Math.max(10, o.w), h: Math.max(10, o.h) };
  let b = objectBounds(next);
  const ratio = Math.min(1, map.width / (b.x * 2), map.height / (b.y * 2));
  if (ratio < 1) next = { ...next, w: next.w * ratio, h: next.h * ratio };
  b = objectBounds(next);
  const cx = Math.max(b.x, Math.min(map.width - b.x, next.x + next.w / 2));
  const cy = Math.max(b.y, Math.min(map.height - b.y, next.y + next.h / 2));
  return { ...next, x: cx - next.w / 2, y: cy - next.h / 2 };
}

export function roadLengths(road: Point[]): number[] {
  const lengths = [0];
  for (let i = 1; i < road.length; i++)
    lengths.push(
      lengths[i - 1] +
        Math.hypot(road[i].x - road[i - 1].x, road[i].y - road[i - 1].y),
    );
  return lengths;
}
export function projectRoad(
  p: Point,
  road: Point[],
  lengths: number[],
  indices?: number[],
) {
  let best = { distance: Infinity, arc: 0, segment: 0 };
  for (const i of indices ?? road.slice(1).map((_, i) => i)) {
    if (i < 0 || i >= road.length - 1) continue;
    const a = road[i],
      b = road[i + 1],
      dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    const distance = Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
    if (distance < best.distance)
      best = {
        distance,
        arc: lengths[i] + t * (lengths[i + 1] - lengths[i]),
        segment: i,
      };
  }
  return best;
}
