import type { Point, TrackMap } from "./types";
import { segmentDistance } from "./maps";
export type Selection =
  | { kind: "object"; id: string }
  | { kind: "road" | "checkpoint"; index: number }
  | { kind: "start" | "goal" };
export interface Viewport {
  zoom: number;
  pan: Point;
}
export interface Frame {
  width: number;
  height: number;
}
export const FIT_VIEW: Viewport = { zoom: 1, pan: { x: 0, y: 0 } };
export const baseScale = (map: TrackMap, frame: Frame) =>
  Math.min(frame.width / map.width, frame.height / map.height);
export function worldPoint(
  p: Point,
  map: TrackMap,
  frame: Frame,
  view: Viewport,
): Point {
  const scale = baseScale(map, frame) * view.zoom;
  return {
    x: (p.x - (frame.width - map.width * scale) / 2) / scale - view.pan.x,
    y: (p.y - (frame.height - map.height * scale) / 2) / scale - view.pan.y,
  };
}
export function anchorViewport(
  anchor: Point,
  screen: Point,
  map: TrackMap,
  frame: Frame,
  zoom: number,
): Viewport {
  const scale = baseScale(map, frame) * zoom;
  return {
    zoom,
    pan: {
      x: (screen.x - (frame.width - map.width * scale) / 2) / scale - anchor.x,
      y:
        (screen.y - (frame.height - map.height * scale) / 2) / scale - anchor.y,
    },
  };
}
export function zoomAt(
  view: Viewport,
  screen: Point,
  map: TrackMap,
  frame: Frame,
  zoom: number,
) {
  return anchorViewport(
    worldPoint(screen, map, frame, view),
    screen,
    map,
    frame,
    Math.max(0.4, Math.min(4, zoom)),
  );
}
export function selectionPoint(
  map: TrackMap,
  s: Selection | null,
): Point | undefined {
  if (!s) return;
  switch (s.kind) {
    case "object":
      return map.objects.find((o) => o.id === s.id);
    case "road":
      return map.road[s.index];
    case "checkpoint":
      return map.checkpoints[s.index];
    case "start":
      return map.draft?.missingStart ? undefined : map.start;
    case "goal":
      return map.draft?.missingGoal ? undefined : map.goal;
  }
}
export function hitSelection(
  map: TrackMap,
  p: Point,
  tolerance = 15,
): Selection | null {
  const near = (a: Point) => Math.hypot(p.x - a.x, p.y - a.y) <= tolerance;
  if (!map.draft?.missingStart && near(map.start)) return { kind: "start" };
  if (!map.draft?.missingGoal && near(map.goal)) return { kind: "goal" };
  for (let i = map.checkpoints.length - 1; i >= 0; i--)
    if (near(map.checkpoints[i])) return { kind: "checkpoint", index: i };
  for (const o of [...map.objects].reverse())
    if (
      p.x >= o.x - tolerance / 3 &&
      p.x <= o.x + o.w + tolerance / 3 &&
      p.y >= o.y - tolerance / 3 &&
      p.y <= o.y + o.h + tolerance / 3
    )
      return { kind: "object", id: o.id };
  if (map.mode === "racing") {
    let best = -1,
      d = Infinity;
    map.road.forEach((a, i) => {
      const n = Math.hypot(a.x - p.x, a.y - p.y);
      if (n < d) {
        best = i;
        d = n;
      }
    });
    if (
      best >= 0 &&
      (d < tolerance ||
        map.road
          .slice(1)
          .some(
            (b, i) =>
              !map.draft?.roadBreaks?.includes(i + 1) &&
              segmentDistance(p, map.road[i], b) < map.roadWidth / 2,
          ))
    )
      return { kind: "road", index: best };
  }
  return null;
}
export function moveSelection(map: TrackMap, s: Selection, delta: Point) {
  const m = structuredClone(map);
  const p = selectionPoint(m, s);
  if (p) {
    p.x += delta.x;
    p.y += delta.y;
  }
  return m;
}
function removeRoadIndices(map: TrackMap, removed: Set<number>) {
  const retained = map.road.map((_, i) => i).filter((i) => !removed.has(i));
  const breaks: number[] = [];
  for (let i = 1; i < retained.length; i++) {
    const a = retained[i - 1],
      b = retained[i];
    if (b - a > 1 || map.draft?.roadBreaks?.some((n) => n > a && n <= b))
      breaks.push(i);
  }
  map.road = retained.map((i) => map.road[i]);
  map.draft = { ...map.draft, roadBreaks: breaks };
}
export function removeSelection(map: TrackMap, s: Selection): TrackMap {
  const m = structuredClone(map);
  switch (s.kind) {
    case "object":
      m.objects = m.objects.filter((o) => o.id !== s.id);
      break;
    case "checkpoint":
      m.checkpoints.splice(s.index, 1);
      break;
    case "road":
      removeRoadIndices(m, new Set([s.index]));
      break;
    case "start":
      m.draft = { ...m.draft, missingStart: true };
      break;
    case "goal":
      m.draft = { ...m.draft, missingGoal: true };
      break;
  }
  return m;
}
export function eraseAt(map: TrackMap, p: Point, radius: number): TrackMap {
  const m = structuredClone(map),
    near = (a: Point) => Math.hypot(a.x - p.x, a.y - p.y) <= radius;
  m.objects = m.objects.filter(
    (o) =>
      Math.hypot(
        p.x - Math.max(o.x, Math.min(p.x, o.x + o.w)),
        p.y - Math.max(o.y, Math.min(p.y, o.y + o.h)),
      ) > radius,
  );
  m.checkpoints = m.checkpoints.filter((a) => !near(a));
  if (near(m.start)) m.draft = { ...m.draft, missingStart: true };
  if (near(m.goal)) m.draft = { ...m.draft, missingGoal: true };
  if (m.mode === "racing") {
    const oldBreaks = new Set(m.draft?.roadBreaks ?? []);
    m.road.slice(1).forEach((b, i) => {
      if (segmentDistance(p, m.road[i], b) <= radius) oldBreaks.add(i + 1);
    });
    m.draft = { ...m.draft, roadBreaks: [...oldBreaks] };
    removeRoadIndices(
      m,
      new Set(m.road.map((a, i) => (near(a) ? i : -1)).filter((i) => i >= 0)),
    );
  }
  return m;
}
