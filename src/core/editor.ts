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
export function eraseAt(
  map: TrackMap,
  p: Point,
  radius: number,
  protectedLayers: ReadonlySet<string> = new Set(),
): TrackMap {
  const m = structuredClone(map),
    near = (a: Point) => Math.hypot(a.x - p.x, a.y - p.y) <= radius;
  m.objects = m.objects.filter(
    (o) =>
      protectedLayers.has("object:" + o.id) ||
      Math.hypot(
        p.x - Math.max(o.x, Math.min(p.x, o.x + o.w)),
        p.y - Math.max(o.y, Math.min(p.y, o.y + o.h)),
      ) > radius,
  );
  m.checkpoints = m.checkpoints.filter(
    (a, i) =>
      protectedLayers.has("checkpoint:" + i) ||
      protectedLayers.has(`checkpoint-at:${a.x}:${a.y}`) ||
      !near(a),
  );
  if (!protectedLayers.has("start") && near(m.start))
    m.draft = { ...m.draft, missingStart: true };
  if (!protectedLayers.has("goal") && near(m.goal))
    m.draft = { ...m.draft, missingGoal: true };
  if (m.mode === "racing" && !protectedLayers.has("road")) {
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

/** Session-only layer keys; never added to the persisted map format. */
export function selectionKey(s: Selection): string {
  return s.kind === "object"
    ? "object:" + s.id
    : s.kind === "checkpoint"
      ? "checkpoint:" + s.index
      : s.kind;
}
export function remapCheckpointLayers(
  previous: TrackMap,
  next: TrackMap,
  keys: ReadonlySet<string>,
): Set<string> {
  return new Set(
    [...keys].flatMap((key) => {
      if (!key.startsWith("checkpoint:")) return [key];
      const p = previous.checkpoints[Number(key.slice(11))];
      const index = p
        ? next.checkpoints.findIndex((q) => q.x === p.x && q.y === p.y)
        : -1;
      return index < 0 ? [] : ["checkpoint:" + index];
    }),
  );
}
export function hitSelections(
  map: TrackMap,
  p: Point,
  tolerance = 15,
): Selection[] {
  const hits: Selection[] = [];
  const near = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) <= tolerance;
  if (!map.draft?.missingStart && near(map.start)) hits.push({ kind: "start" });
  if (!map.draft?.missingGoal && near(map.goal)) hits.push({ kind: "goal" });
  map.checkpoints.forEach((q, index) => {
    if (near(q)) hits.push({ kind: "checkpoint", index });
  });
  for (const o of [...map.objects].reverse())
    if (
      p.x >= o.x - tolerance / 3 &&
      p.x <= o.x + o.w + tolerance / 3 &&
      p.y >= o.y - tolerance / 3 &&
      p.y <= o.y + o.h + tolerance / 3
    )
      hits.push({ kind: "object", id: o.id });
  const road = hitSelection(
    {
      ...map,
      objects: [],
      checkpoints: [],
      draft: { ...map.draft, missingStart: true, missingGoal: true },
    },
    p,
    tolerance,
  );
  if (road) hits.push(road);
  return hits;
}
/** Bake corner cutting into map geometry so physics and rendering use identical segments. */
export function smoothRoad(map: TrackMap): TrackMap {
  if (
    map.road.length < 3 ||
    map.road.length > 500 ||
    map.draft?.roadBreaks?.length
  )
    return map;
  const road: Point[] = [map.road[0]];
  for (let i = 0; i < map.road.length - 1; i++) {
    const a = map.road[i],
      b = map.road[i + 1];
    road.push(
      { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
      { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
    );
  }
  road.push(map.road.at(-1)!);
  const checkpoints = map.checkpoints.map((p) => {
    let closest = p,
      distance = Infinity;
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1],
        b = road[i],
        dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
      const q = { x: a.x + t * dx, y: a.y + t * dy },
        d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < distance) {
        distance = d;
        closest = q;
      }
    }
    return closest;
  });
  return { ...map, road, checkpoints };
}
