import type { MapObject, Point, TrackMap } from "./types";
const stamp = "2026-10-24T12:00:00.000Z";
function base(
  id: string,
  name: string,
  mode: "racing" | "bounce",
  difficulty: TrackMap["difficulty"],
  features: string[],
): TrackMap {
  return {
    id,
    name,
    mode,
    difficulty,
    features,
    description: features.join(" · "),
    version: 1,
    environmentVersion: 5,
    recommended: true,
    recommendedHorizon: 1800,
    createdAt: stamp,
    updatedAt: stamp,
    width: 1000,
    height: 640,
    road: [],
    roadWidth: 100,
    start: { x: 70, y: 529, angle: 0 },
    goal: { x: 930, y: 529 },
    checkpoints: [],
    objects: [],
    physics: { maxSpeed: 180, gravity: 760 },
  };
}
function race(
  id: string,
  name: string,
  difficulty: TrackMap["difficulty"],
  road: Point[],
  width: number,
  features: string[],
  objects: MapObject[] = [],
) {
  const m = base(id, name, "racing", difficulty, features);
  m.road = road;
  m.roadWidth = width;
  m.start = {
    ...road[0],
    angle: Math.atan2(road[1].y - road[0].y, road[1].x - road[0].x),
  };
  m.goal = road.at(-1)!;
  m.objects = objects;
  m.physics.maxSpeed = 230;
  return m;
}
function bounce(
  id: string,
  name: string,
  difficulty: TrackMap["difficulty"],
  features: string[],
  objects: MapObject[],
  goal?: Point,
) {
  const m = base(id, name, "bounce", difficulty, features);
  m.objects = objects;
  if (goal) m.goal = goal;
  return m;
}
const floor = (x: number, w: number, y = 550): MapObject => ({
  id: `floor-${x}-${y}`,
  kind: "platform",
  x,
  y,
  w,
  h: 40,
});
const wave = (height: number, turns = 2) =>
  Array.from({ length: 41 }, (_, i) => ({
    x: 70 + i * 21.5,
    y: 320 + height * Math.sin((i / 40) * Math.PI * turns),
  }));
export const V05_MAPS: TrackMap[] = [
  race("r-v5-precision", "V5 / 바늘 S커브", "Hard", wave(130, 3), 82, [
    "조향",
    "좁은 도로",
    "연속 곡률",
  ]),
  race(
    "r-v5-speed",
    "V5 / 가속과 감속",
    "Medium",
    wave(80, 1),
    140,
    ["속도", "가속 벨트", "제동"],
    [
      {
        id: "boost",
        kind: "belt",
        x: 160,
        y: 315,
        w: 170,
        h: 110,
        beltType: "boost",
        beltStrength: 120,
        maxInfluenceSpeed: 300,
      },
      {
        id: "brake",
        kind: "belt",
        x: 600,
        y: 315,
        w: 150,
        h: 110,
        beltType: "brake",
        beltStrength: 260,
      },
    ],
  ),
  race(
    "r-v5-obstacles",
    "V5 / 엇갈린 통로",
    "Medium",
    wave(55, 2),
    105,
    ["장애물 회피", "조향"],
    [
      { id: "wall-a", kind: "wall", x: 290, y: 390, w: 40, h: 45 },
      { id: "bomb-a", kind: "bomb", x: 610, y: 234, w: 22, h: 22 },
    ],
  ),
  race(
    "r-v5-timing",
    "V5 / 횡단 신호",
    "Medium",
    [
      { x: 70, y: 320 },
      { x: 930, y: 320 },
    ],
    130,
    ["타이밍", "이동 장애물", "속도"],
    [
      {
        id: "cross",
        kind: "moving",
        x: 485,
        y: 280,
        w: 28,
        h: 80,
        moveAxis: "vertical",
        amplitude: 130,
        period: 3,
        phase: 0,
      },
    ],
  ),
  race("r-v5-corners", "V5 / 고속 코너", "Hard", wave(160, 2), 120, [
    "속도",
    "조향",
    "고속 코너",
  ]),
  race(
    "r-v5-endurance",
    "V5 / 종합 주행",
    "Hard",
    wave(125, 3),
    108,
    ["조향", "장애물 회피", "속도"],
    [
      { id: "edge-wall", kind: "wall", x: 295, y: 422, w: 24, h: 45 },
      {
        id: "slow",
        kind: "belt",
        x: 670,
        y: 320,
        w: 90,
        h: 100,
        beltType: "brake",
        beltStrength: 150,
      },
    ],
  ),
  bounce(
    "b-v5-flat",
    "V5 / 첫 걸음",
    "Easy",
    ["이동", "기초 정책"],
    [floor(20, 960)],
  ),
  bounce(
    "b-v5-jump",
    "V5 / 한 번의 점프",
    "Easy",
    ["점프", "단일 장애물"],
    [
      floor(20, 960),
      { id: "step", kind: "platform", x: 380, y: 500, w: 100, h: 50 },
    ],
  ),
  bounce(
    "b-v5-horizontal",
    "V5 / 왕복 다리",
    "Medium",
    ["이동 발판", "점프", "타이밍"],
    [
      floor(20, 260),
      floor(690, 290),
      {
        id: "bridge",
        kind: "moving",
        x: 365,
        y: 510,
        w: 240,
        h: 24,
        moveAxis: "horizontal",
        amplitude: 75,
        period: 4,
        phase: 0,
      },
    ],
  ),
  bounce(
    "b-v5-elevator",
    "V5 / 승강장",
    "Medium",
    ["수직 이동 발판", "타이밍", "점프"],
    [
      floor(20, 240),
      floor(690, 290, 430),
      {
        id: "lift",
        kind: "moving",
        x: 340,
        y: 475,
        w: 270,
        h: 24,
        moveAxis: "vertical",
        amplitude: 65,
        period: 4,
        phase: 0,
      },
    ],
    { x: 930, y: 409 },
  ),
  bounce(
    "b-v5-crumble",
    "V5 / 무너지는 길",
    "Medium",
    ["일회용 발판", "연속 점프", "타이밍"],
    [
      floor(20, 220),
      floor(790, 190),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `crumble-${i}`,
        kind: "crumble" as const,
        x: 285 + i * 155,
        y: 520,
        w: 140,
        h: 22,
        collapseDelay: 0.4,
      })),
    ],
  ),
  bounce(
    "b-v5-elastic",
    "V5 / 탄성 도약",
    "Medium",
    ["탄성", "점프대", "착지"],
    [
      floor(20, 960),
      {
        id: "assist",
        kind: "elastic",
        x: 310,
        y: 534,
        w: 100,
        h: 16,
        liftBoost: 160,
        minLaunchSpeed: 300,
        maxLaunchSpeed: 480,
      },
      {
        id: "spring",
        kind: "spring",
        x: 590,
        y: 536,
        w: 80,
        h: 14,
        launchStrength: 400,
      },
    ],
  ),
  bounce(
    "b-v5-belt",
    "V5 / 속도 퍼즐",
    "Medium",
    ["속도", "벨트", "보상 전략"],
    [
      floor(20, 960),
      {
        id: "brake",
        kind: "belt",
        x: 270,
        y: 508,
        w: 140,
        h: 42,
        beltType: "brake",
        beltStrength: 250,
      },
      {
        id: "fast",
        kind: "belt",
        x: 540,
        y: 508,
        w: 120,
        h: 42,
        beltType: "boost",
        beltStrength: 100,
        maxInfluenceSpeed: 270,
      },
      {
        id: "bonus",
        kind: "reward",
        x: 740,
        y: 480,
        w: 45,
        h: 70,
        rewardValue: 2,
        activation: "once",
        trigger: "enter",
      },
    ],
  ),
  bounce(
    "b-v5-mixed",
    "V5 / 마지막 릴레이",
    "Hard",
    ["점프", "수직 이동 발판", "일회용 발판", "장애물 회피"],
    [
      floor(20, 240),
      floor(770, 210),
      {
        id: "lift",
        kind: "moving",
        x: 320,
        y: 510,
        w: 150,
        h: 24,
        moveAxis: "vertical",
        amplitude: 35,
        period: 4,
        phase: 0,
      },
      {
        id: "fragile",
        kind: "crumble",
        x: 535,
        y: 490,
        w: 155,
        h: 22,
        collapseDelay: 0.5,
      },
      { id: "spike", kind: "spike", x: 870, y: 526, w: 24, h: 24 },
    ],
  ),
];
export const MAP_VARIANTS: Record<string, string> = {
  "r-sparse-expert": "r-s-curves",
  "r-precision-hairpins": "r-hairpin-chain",
  "r-free-endurance": "r-endurance",
  "r-bomb-run": "r-angled-walls",
  "b-recovery-route": "b-precision",
  "b-timing-hazards": "b-moving-gauntlet",
  "b-bomb-relay": "b-spring-relay",
};
