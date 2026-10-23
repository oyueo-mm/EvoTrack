import type { Mode, Point, TrackMap } from "./types";
const stamp = "2026-10-23T00:00:00.000Z";
function racing(
  id: string,
  name: string,
  road: Point[],
  width = 108,
): TrackMap {
  const a = road[0],
    b = road[1];
  return {
    id,
    name,
    description: "순서대로 체크포인트를 통과하고 결승선에 도달하세요.",
    mode: "racing",
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
    width: 1000,
    height: 640,
    road,
    roadWidth: width,
    start: { ...a, angle: Math.atan2(b.y - a.y, b.x - a.x) },
    goal: road.at(-1)!,
    checkpoints: road.slice(1),
    objects: [],
    physics: { maxSpeed: 210, gravity: 760 },
  };
}
function bounce(
  id: string,
  name: string,
  objects: TrackMap["objects"],
): TrackMap {
  return {
    id,
    name,
    description: "발판을 건너 초록색 도착 지점까지 이동하세요.",
    mode: "bounce",
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
    width: 1000,
    height: 640,
    road: [],
    roadWidth: 100,
    start: { x: 80, y: 535, angle: 0 },
    goal: { x: 910, y: 535 },
    checkpoints: [],
    objects: [
      { id: "floor", kind: "platform", x: 20, y: 550, w: 960, h: 40 },
      ...objects,
    ],
    physics: { maxSpeed: 180, gravity: 760 },
  };
}
export const EXAMPLE_MAPS: TrackMap[] = [
  racing(
    "r-straight",
    "01 / Launch strip",
    [
      { x: 110, y: 320 },
      { x: 350, y: 320 },
      { x: 600, y: 320 },
      { x: 880, y: 320 },
    ],
    120,
  ),
  racing(
    "r-orbit",
    "02 / Orbital circuit",
    Array.from({ length: 17 }, (_, i) => ({
      x: 500 + 330 * Math.cos(Math.PI + (i * Math.PI * 1.85) / 16),
      y: 320 + 210 * Math.sin(Math.PI + (i * Math.PI * 1.85) / 16),
    })),
    100,
  ),
  racing(
    "r-serpent",
    "03 / Serpentine",
    [
      { x: 100, y: 450 },
      { x: 230, y: 440 },
      { x: 320, y: 370 },
      { x: 350, y: 235 },
      { x: 440, y: 170 },
      { x: 560, y: 200 },
      { x: 620, y: 350 },
      { x: 700, y: 430 },
      { x: 850, y: 405 },
      { x: 900, y: 270 },
    ],
    112,
  ),
  racing(
    "r-apex",
    "04 / Apex complex",
    [
      { x: 100, y: 500 },
      { x: 270, y: 500 },
      { x: 350, y: 390 },
      { x: 250, y: 250 },
      { x: 300, y: 120 },
      { x: 480, y: 130 },
      { x: 560, y: 290 },
      { x: 680, y: 320 },
      { x: 760, y: 150 },
      { x: 900, y: 140 },
      { x: 890, y: 480 },
    ],
    95,
  ),
  bounce("b-jump", "01 / First jump", [
    { id: "p1", kind: "platform", x: 350, y: 480, w: 100, h: 70 },
  ]),
  bounce(
    "b-stairs",
    "02 / Stairway",
    Array.from({ length: 5 }, (_, i) => ({
      id: "st" + i,
      kind: "platform" as const,
      x: 220 + i * 120,
      y: 520 - i * 26,
      w: 95,
      h: 30,
    })),
  ),
  bounce("b-spikes", "03 / Hazard field", [
    { id: "sp", kind: "spike", x: 440, y: 526, w: 80, h: 24 },
  ]),
  bounce("b-moving", "04 / Moving ground", [
    {
      id: "mv",
      kind: "moving",
      x: 400,
      y: 450,
      w: 130,
      h: 22,
      amplitude: 65,
      period: 3,
    },
  ]),
  bounce("b-puzzle", "05 / Spring theory", [
    { id: "s", kind: "spring", x: 270, y: 536, w: 70, h: 14 },
    { id: "e", kind: "elastic", x: 490, y: 440, w: 110, h: 20 },
    { id: "sp2", kind: "spike", x: 680, y: 526, w: 70, h: 24 },
  ]),
];
export function newMap(mode: Mode): TrackMap {
  const map = structuredClone(EXAMPLE_MAPS[mode === "racing" ? 0 : 4]);
  map.id = crypto.randomUUID();
  map.name = "Untitled " + (mode === "racing" ? "circuit" : "puzzle");
  map.createdAt = map.updatedAt = new Date().toISOString();
  return map;
}
export function validateMap(value: unknown): TrackMap {
  if (!value || typeof value !== "object")
    throw Error("맵 형식이 올바르지 않습니다.");
  const m = value as TrackMap;
  if (
    m.draft !== undefined &&
    (!m.draft ||
      typeof m.draft !== "object" ||
      Array.isArray(m.draft) ||
      (m.draft.missingStart !== undefined &&
        typeof m.draft.missingStart !== "boolean") ||
      (m.draft.missingGoal !== undefined &&
        typeof m.draft.missingGoal !== "boolean") ||
      (m.draft.roadBreaks !== undefined &&
        (!Array.isArray(m.draft.roadBreaks) ||
          m.draft.roadBreaks.length > 1000 ||
          m.draft.roadBreaks.some(
            (i) =>
              !Number.isInteger(i) ||
              i < 1 ||
              !Array.isArray(m.road) ||
              i >= m.road.length,
          ))))
  )
    throw Error("편집 상태 데이터가 손상되었습니다.");
  if (m.draft?.missingStart)
    throw Error("시작점이 없습니다. 시작점 도구로 배치하세요.");
  if (m.draft?.missingGoal)
    throw Error("결승점이 없습니다. 결승점 도구로 배치하세요.");
  if (m.draft?.roadBreaks?.length)
    throw Error(
      "도로가 끊어져 있습니다. 도로 속성에서 구간을 연결하거나 실행 취소하세요.",
    );
  if (m.version !== 1 || !["racing", "bounce"].includes(m.mode))
    throw Error("지원하지 않는 맵 버전 또는 모드입니다.");
  const finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  const point = (p: unknown) =>
    !!p &&
    typeof p === "object" &&
    finite((p as Point).x) &&
    finite((p as Point).y) &&
    Math.abs((p as Point).x) < 10000 &&
    Math.abs((p as Point).y) < 10000;
  if (
    typeof m.id !== "string" ||
    !m.id ||
    m.id.length > 200 ||
    typeof m.name !== "string" ||
    !m.name.trim() ||
    m.name.length > 200 ||
    typeof m.description !== "string" ||
    typeof m.createdAt !== "string" ||
    typeof m.updatedAt !== "string"
  )
    throw Error("맵 메타데이터가 손상되었습니다.");
  if (
    !finite(m.width) ||
    !finite(m.height) ||
    m.width < 100 ||
    m.width > 5000 ||
    m.height < 100 ||
    m.height > 5000 ||
    !finite(m.roadWidth) ||
    m.roadWidth < 30 ||
    m.roadWidth > 300
  )
    throw Error("맵 크기 또는 도로 폭이 유효하지 않습니다.");
  if (
    !point(m.start) ||
    !finite(m.start.angle) ||
    !point(m.goal) ||
    !Array.isArray(m.road) ||
    m.road.length > 1000 ||
    !m.road.every(point) ||
    !Array.isArray(m.checkpoints) ||
    m.checkpoints.length > 1000 ||
    !m.checkpoints.every(point) ||
    !Array.isArray(m.objects) ||
    m.objects.length > 1000
  )
    throw Error("시작점, 목표 또는 지형 데이터가 손상되었습니다.");
  if (
    !m.physics ||
    !finite(m.physics.maxSpeed) ||
    m.physics.maxSpeed < 10 ||
    m.physics.maxSpeed > 800 ||
    !finite(m.physics.gravity) ||
    m.physics.gravity < 100 ||
    m.physics.gravity > 2500
  )
    throw Error("물리 설정이 유효하지 않습니다.");
  if (
    !m.objects.every(
      (o) =>
        point(o) &&
        typeof o.id === "string" &&
        ["wall", "platform", "moving", "spike", "spring", "elastic"].includes(
          o.kind,
        ) &&
        finite(o.w) &&
        finite(o.h) &&
        o.w > 0 &&
        o.h > 0 &&
        o.w <= 5000 &&
        o.h <= 5000 &&
        (o.kind !== "moving" ||
          (finite(o.amplitude) &&
            Math.abs(o.amplitude) <= 500 &&
            finite(o.period) &&
            o.period >= 0.5)),
    )
  )
    throw Error("장애물 데이터가 유효하지 않습니다.");
  if (
    m.start.x < 12 ||
    m.start.x > m.width - 12 ||
    m.start.y < 12 ||
    m.start.y > m.height - 12 ||
    m.goal.x < 0 ||
    m.goal.x > m.width ||
    m.goal.y < 0 ||
    m.goal.y > m.height
  )
    throw Error("시작점 또는 목표가 맵 밖에 있습니다.");
  if (m.mode === "racing") {
    if (m.road.length < 2 || m.checkpoints.length < 1)
      throw Error("도로에 최소 두 점과 체크포인트가 필요합니다.");
    if (
      Math.min(
        ...m.road
          .slice(1)
          .map((b, i) => segmentDistance(m.start, m.road[i], b)),
      ) >
      m.roadWidth / 2 - 10
    )
      throw Error("출발 위치가 도로 밖에 있습니다.");
    if (
      m.road.some((p) => p.x < 0 || p.x > m.width || p.y < 0 || p.y > m.height)
    )
      throw Error("도로가 맵 밖에 있습니다.");
    if (
      [m.goal, ...m.checkpoints].some(
        (p) =>
          Math.min(
            ...m.road.slice(1).map((b, i) => segmentDistance(p, m.road[i], b)),
          ) >
          m.roadWidth / 2 - 9,
      )
    )
      throw Error("결승선과 체크포인트는 도로 안에 있어야 합니다.");
  }
  if (
    m.objects.some(
      (o) =>
        m.start.x + 11 > o.x &&
        m.start.x - 11 < o.x + o.w &&
        m.start.y + 11 > o.y &&
        m.start.y - 11 < o.y + o.h,
    )
  )
    throw Error("출발 위치가 장애물과 겹칩니다.");
  return structuredClone(m);
}
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
