import type { MapObject, Point, TrackMap } from "./types";
const stamp = "2026-10-24T00:00:00.000Z";
function race(
  id: string,
  name: string,
  road: Point[],
  gateIndices: number[],
  difficulty: "Medium" | "Hard",
  features: string[],
  objects: MapObject[] = [],
): TrackMap {
  return {
    id,
    name,
    description: features.join(" · "),
    version: 1,
    environmentVersion: 2,
    difficulty,
    features,
    recommendedHorizon: difficulty === "Hard" ? 2400 : 1200,
    mode: "racing",
    createdAt: stamp,
    updatedAt: stamp,
    width: 1800,
    height: 1000,
    road,
    roadWidth: 110,
    start: {
      ...road[0],
      angle: Math.atan2(road[1].y - road[0].y, road[1].x - road[0].x),
    },
    goal: road.at(-1)!,
    checkpoints: gateIndices.map((i, order) => ({
      id: `${id}-gate-${order}`,
      order,
      ...road[i],
      width: 100,
      angle: Math.atan2(
        road[i + 1].y - road[i - 1].y,
        road[i + 1].x - road[i - 1].x,
      ),
      directional: true,
    })),
    objects,
    physics: { maxSpeed: 240, gravity: 760 },
  };
}
const sRoad = Array.from({ length: 65 }, (_, i) => ({
  x: 120 + i * 24,
  y: 480 + 220 * Math.sin((i / 64) * Math.PI * 3),
}));
function hairpins(turns: number): Point[] {
  const road: Point[] = [
    { x: 120, y: 120 },
    { x: 1400, y: 120 },
  ];
  let y = 120;
  for (let i = 0; i < turns; i++) {
    const right = i % 2 === 0,
      cx = right ? 1400 : 350,
      cy = y + 110;
    for (let j = 1; j <= 18; j++) {
      const a = -Math.PI / 2 + ((right ? 1 : -1) * j * Math.PI) / 18;
      road.push({ x: cx + 110 * Math.cos(a), y: cy + 110 * Math.sin(a) });
    }
    y += 220;
    road.push({ x: right ? 350 : 1400, y });
  }
  return road;
}
function puzzle(
  id: string,
  name: string,
  difficulty: "Medium" | "Hard",
  objects: MapObject[],
  features: string[],
): TrackMap {
  return {
    id,
    name,
    description: features.join(" · "),
    version: 1,
    environmentVersion: 2,
    difficulty,
    features,
    mode: "bounce",
    createdAt: stamp,
    updatedAt: stamp,
    width: 1400,
    height: 700,
    road: [],
    roadWidth: 100,
    start: { x: 70, y: 539, angle: 0 },
    goal: { x: 1320, y: 539 },
    checkpoints: [],
    objects,
    physics: { maxSpeed: 180, gravity: 760 },
  };
}
const ledges = (gaps: number[][]): MapObject[] => {
  const objects: MapObject[] = [];
  let x = 20;
  for (const [a, b] of gaps) {
    objects.push({
      id: `ledge-${x}`,
      kind: "platform",
      x,
      y: 550,
      w: a - x,
      h: 35,
    });
    x = b;
  }
  objects.push({
    id: `ledge-${x}`,
    kind: "platform",
    x,
    y: 550,
    w: 1380 - x,
    h: 35,
  });
  return objects;
};
export const CHALLENGE_MAPS: TrackMap[] = [
  race("r-s-curves", "05 / 연속 S커브", sRoad, [12, 32, 52], "Medium", [
    "연속 S커브",
    "수동 게이트 3개",
  ]),
  race(
    "r-angled-walls",
    "06 / 사선 장벽",
    Array.from({ length: 33 }, (_, i) => ({ x: 120 + i * 48, y: 480 })),
    [8, 24],
    "Medium",
    ["회전 벽 회피", "직선과 좁은 통과 구간"],
    [
      {
        id: "angled-1",
        kind: "wall",
        x: 610,
        y: 430,
        w: 18,
        h: 34,
        angle: Math.PI / 4,
      },
      {
        id: "angled-2",
        kind: "wall",
        x: 1050,
        y: 496,
        w: 18,
        h: 34,
        angle: -Math.PI / 4,
      },
    ],
  ),
  race(
    "r-hairpin-chain",
    "07 / 연속 헤어핀",
    hairpins(3),
    [12, 33, 52],
    "Hard",
    ["반경 110 헤어핀 3개", "진행 구간 추적"],
  ),
  race(
    "r-endurance",
    "08 / 지구력 코스",
    Array.from({ length: 97 }, (_, i) => ({
      x: 100 + i * 16.5,
      y: 480 + 260 * Math.sin((i / 96) * Math.PI * 4),
    })),
    [14, 36, 60, 82],
    "Hard",
    ["장거리 복합 코너", "체크포인트 4개"],
  ),
  puzzle(
    "b-precision",
    "06 / 정밀 도약",
    "Medium",
    ledges([
      [290, 380],
      [640, 750],
      [1030, 1130],
    ]),
    ["낙하 위험", "간격 90–110px 점프"],
  ),
  puzzle(
    "b-moving-gap",
    "07 / 움직이는 다리",
    "Medium",
    [
      ...ledges([
        [370, 530],
        [870, 1030],
      ]),
      {
        id: "bridge-1",
        kind: "moving",
        x: 420,
        y: 530,
        w: 70,
        h: 18,
        amplitude: 35,
        period: 3,
      },
      {
        id: "bridge-2",
        kind: "moving",
        x: 915,
        y: 530,
        w: 70,
        h: 18,
        amplitude: 35,
        period: 4,
      },
    ],
    ["이동 발판 2개", "넓은 틈"],
  ),
  puzzle(
    "b-spring-relay",
    "08 / 탄성 릴레이",
    "Hard",
    [
      ...ledges([
        [330, 510],
        [850, 1000],
      ]),
      { id: "spring", kind: "spring", x: 260, y: 536, w: 55, h: 14 },
      { id: "elastic", kind: "elastic", x: 755, y: 536, w: 55, h: 14 },
      { id: "spike", kind: "spike", x: 1090, y: 526, w: 45, h: 24 },
    ],
    ["점프대와 탄성 발판", "마지막 가시 회피"],
  ),
  puzzle(
    "b-moving-gauntlet",
    "09 / 도약 회랑",
    "Hard",
    [
      ...ledges([
        [250, 375],
        [575, 705],
        [940, 1070],
      ]),
      {
        id: "mv-1",
        kind: "moving",
        x: 280,
        y: 530,
        w: 65,
        h: 18,
        amplitude: 25,
        period: 2.5,
      },
      {
        id: "mv-2",
        kind: "moving",
        x: 605,
        y: 530,
        w: 65,
        h: 18,
        amplitude: 25,
        period: 3,
      },
      {
        id: "mv-3",
        kind: "moving",
        x: 970,
        y: 530,
        w: 65,
        h: 18,
        amplitude: 25,
        period: 3.5,
      },
      { id: "sp", kind: "spike", x: 1160, y: 526, w: 45, h: 24 },
    ],
    ["이동 발판 3개", "연속 정밀 점프", "가시 회피"],
  ),
];
