import { magneticAngle } from "./angle-snap";
import type { Point, TrackMap } from "./types";
import { segmentDistance } from "./maps";
import {
  circleObject,
  clampObject,
  gateAt,
  gateEnds,
  objectLocal,
  objectWorld,
} from "./geometry";
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
    if (s.kind === "object") {
      const o = m.objects.find((o) => o.id === s.id)!;
      Object.assign(o, clampObject(o, m));
    } else {
      p.x = Math.max(0, Math.min(m.width, p.x));
      p.y = Math.max(0, Math.min(m.height, p.y));
    }
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
      m.checkpoints.forEach((p, i) => {
        if (p.order !== undefined) p.order = i;
      });
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
    (o) => protectedLayers.has("object:" + o.id) || !circleObject(o, p, radius),
  );
  m.checkpoints = m.checkpoints.filter(
    (a, i) =>
      protectedLayers.has("checkpoint:" + i) ||
      protectedLayers.has(`checkpoint-at:${a.x}:${a.y}`) ||
      !near(a),
  );
  m.checkpoints.forEach((p, i) => {
    if (p.order !== undefined) p.order = i;
  });
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
        ? next.checkpoints.findIndex((q) =>
            p.id ? q.id === p.id : q.x === p.x && q.y === p.y,
          )
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
    if (
      near(q) ||
      segmentDistance(p, ...gateEnds(gateAt(map, index))) <= tolerance
    )
      hits.push({ kind: "checkpoint", index });
  });
  for (const o of [...map.objects].reverse())
    if (circleObject(o, p, tolerance / 3))
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
  return { ...map, road };
}

export type TransformHandle =
  "nw" | "ne" | "se" | "sw" | "rotate" | "gate-a" | "gate-b";
export function transformHandles(
  map: TrackMap,
  s: Selection | null,
  unit = 1,
): { kind: TransformHandle; point: Point }[] {
  if (s?.kind === "object") {
    const o = map.objects.find((o) => o.id === s.id);
    if (!o) return [];
    const handles: { kind: TransformHandle; point: Point }[] = (
      [
        [-1, -1, "nw"],
        [1, -1, "ne"],
        [1, 1, "se"],
        [-1, 1, "sw"],
      ] as const
    ).map(([x, y, kind]) => ({
      kind,
      point: objectWorld(o, { x: (x * o.w) / 2, y: (y * o.h) / 2 }),
    }));
    if ((map.environmentVersion ?? 1) >= 2)
      handles.push({
        kind: "rotate",
        point: objectWorld(o, { x: 0, y: -o.h / 2 - 28 * unit }),
      });
    return handles;
  }
  if (s?.kind === "checkpoint" && map.checkpoints[s.index]) {
    const g = gateAt(map, s.index),
      [a, b] = gateEnds(g);
    return (map.environmentVersion ?? 1) >= 2
      ? [
          { kind: "gate-a", point: a },
          { kind: "gate-b", point: b },
          {
            kind: "rotate",
            point: {
              x: g.x + Math.cos(g.angle) * 35 * unit,
              y: g.y + Math.sin(g.angle) * 35 * unit,
            },
          },
        ]
      : [];
  }
  return [];
}
export function transformSelection(
  map: TrackMap,
  s: Selection,
  h: TransformHandle,
  p: Point,
  shift = false,
  rotation: { enabled: boolean; previous?: number } = { enabled: true },
): TrackMap {
  const m = structuredClone(map),
    snap = (a: number) =>
      magneticAngle(a, rotation.enabled, rotation.previous).angle;
  if (s.kind === "object") {
    const o = m.objects.find((o) => o.id === s.id);
    if (!o) return map;
    if (h === "rotate") {
      if ((map.environmentVersion ?? 1) < 2) return map;
      o.angle = snap(
        Math.atan2(p.y - o.y - o.h / 2, p.x - o.x - o.w / 2) + Math.PI / 2,
      );
    } else {
      const q = objectLocal(o, p),
        sx = h.includes("e") ? 1 : -1,
        sy = h.includes("s") ? 1 : -1;
      const anchor = { x: (-sx * o.w) / 2, y: (-sy * o.h) / 2 };
      let w = Math.max(10, (q.x - anchor.x) * sx),
        height = Math.max(10, (q.y - anchor.y) * sy);
      if (shift) {
        const ratio = o.w / o.h;
        if (w / height > ratio) height = w / ratio;
        else w = height * ratio;
      }
      const center = objectWorld(o, {
        x: anchor.x + (sx * w) / 2,
        y: anchor.y + (sy * height) / 2,
      });
      o.w = w;
      o.h = height;
      o.x = center.x - w / 2;
      o.y = center.y - height / 2;
    }
    Object.assign(o, clampObject(o, m));
  } else if (s.kind === "checkpoint" && (map.environmentVersion ?? 1) >= 2) {
    const g = gateAt(m, s.index);
    if (h === "rotate") g.angle = snap(Math.atan2(p.y - g.y, p.x - g.x));
    else
      g.width = Math.max(
        10,
        Math.min(
          Math.max(m.width, m.height),
          Math.abs(
            -(p.x - g.x) * Math.sin(g.angle) + (p.y - g.y) * Math.cos(g.angle),
          ) * 2,
        ),
      );
    m.checkpoints[s.index] = g;
  }
  return m;
}
export type EditorClipboard =
  | { kind: "object"; value: TrackMap["objects"][number] }
  | { kind: "checkpoint"; value: TrackMap["checkpoints"][number] };
export function copySelection(
  map: TrackMap,
  s: Selection | null,
): EditorClipboard | null {
  if (s?.kind === "object") {
    const o = map.objects.find((o) => o.id === s.id);
    return o ? { kind: "object", value: structuredClone(o) } : null;
  }
  if (s?.kind === "checkpoint")
    return { kind: "checkpoint", value: gateAt(map, s.index) };
  return null;
}
export function pasteSelection(
  map: TrackMap,
  item: EditorClipboard,
  offset = 20,
): { map: TrackMap; selection: Selection } {
  const m = structuredClone(map);
  if (item.kind === "object") {
    const o = clampObject(
      {
        ...item.value,
        id: crypto.randomUUID(),
        x: item.value.x + offset,
        y: item.value.y + offset,
      },
      m,
    );
    m.objects.push(o);
    return { map: m, selection: { kind: "object", id: o.id } };
  }
  const p = {
    ...item.value,
    id: crypto.randomUUID(),
    x: Math.max(0, Math.min(m.width, item.value.x + offset)),
    y: Math.max(0, Math.min(m.height, item.value.y + offset)),
    order: m.checkpoints.length,
  };
  const angle = p.angle ?? 0;
  const width = p.width ?? m.roadWidth * 0.8;
  const scale = Math.min(
    1,
    m.width / (Math.abs(Math.sin(angle)) * width || 1),
    m.height / (Math.abs(Math.cos(angle)) * width || 1),
  );
  p.width = width * scale;
  const rx = (Math.abs(Math.sin(angle)) * p.width) / 2,
    ry = (Math.abs(Math.cos(angle)) * p.width) / 2;
  p.x = Math.max(rx, Math.min(m.width - rx, p.x));
  p.y = Math.max(ry, Math.min(m.height - ry, p.y));
  m.checkpoints.push(p);
  return {
    map: m,
    selection: { kind: "checkpoint", index: m.checkpoints.length - 1 },
  };
}

export function v4EditorName(name: string) {
  let base = name.trim(),
    previous = "";
  while (base !== previous) {
    previous = base;
    base = base
      .replace(
        /(?:\s*·\s*(?:확장 편집본|요소 확장본|게이트 편집본|편집본)|\s*\(v[1-4]\))\s*$/,
        "",
      )
      .trim();
  }
  return `${base || "Untitled"} (v4)`;
}
export function editableV4(map: TrackMap, forceCopy = false): TrackMap {
  if (map.environmentVersion === 4 && !forceCopy) return structuredClone(map);
  const now = new Date().toISOString();
  return {
    ...structuredClone(map),
    id: crypto.randomUUID(),
    sourceMapId: map.sourceMapId ?? map.id,
    name: v4EditorName(map.name),
    environmentVersion: 4,
    createdAt: now,
    updatedAt: now,
  };
}
