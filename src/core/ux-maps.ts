import { CHALLENGE_MAPS } from "./challenge-maps";
import type { TrackMap } from "./types";
function variant(
  source: string,
  id: string,
  name: string,
  features: string[],
): TrackMap {
  return {
    ...structuredClone(CHALLENGE_MAPS.find((m) => m.id === source)!),
    id,
    name,
    description: features.join(" · "),
    features,
    environmentVersion: 3,
    difficulty: "Hard",
  };
}
const narrow = variant(
  "r-hairpin-chain",
  "r-precision-hairpins",
  "09 / 정밀 헤어핀",
  ["좁은 폭 80px", "연속 헤어핀"],
);
narrow.roadWidth = 80;
narrow.checkpoints = narrow.checkpoints.map((g, i) => ({
  ...g,
  id: `precision-${i}`,
  width: 72,
}));
const sparse = variant("r-s-curves", "r-sparse-expert", "10 / 한 번의 게이트", [
  "게이트 1개",
  "복합 S커브",
]);
sparse.roadWidth = 92;
sparse.checkpoints = [
  { ...sparse.checkpoints[1], id: "sparse-only", order: 0 },
];
const free = variant(
  "r-endurance",
  "r-free-endurance",
  "11 / 게이트 없는 지구력",
  ["체크포인트 0개", "중심선 진행도 실험"],
);
free.checkpoints = [];
const bombs = variant("r-angled-walls", "r-bomb-run", "12 / 폭탄 통과 구간", [
  "사선 벽",
  "폭탄 회피",
]);
bombs.objects.push({
  id: "race-bomb",
  kind: "bomb",
  x: 850,
  y: 430,
  w: 28,
  h: 28,
});
const timing = variant(
  "b-moving-gauntlet",
  "b-timing-hazards",
  "10 / 타이밍 회랑",
  ["이동 발판 3개", "가시와 부활 지점"],
);
timing.objects.push({
  id: "safe-marker",
  kind: "respawn",
  x: 770,
  y: 519,
  w: 40,
  h: 40,
});
const relay = variant("b-spring-relay", "b-bomb-relay", "11 / 폭발과 반발", [
  "방향 점프대",
  "탄성 계수 1.4",
  "폭탄",
]);
relay.objects = relay.objects.map((o) =>
  o.kind === "spring"
    ? { ...o, launchStrength: 600, launchAngle: -Math.PI / 2 + 0.35 }
    : o.kind === "elastic"
      ? { ...o, restitution: 1.4 }
      : o,
);
relay.objects.push(
  { id: "bomb-relay", kind: "bomb", x: 1240, y: 526, w: 24, h: 24 },
  { id: "relay-save", kind: "respawn", x: 680, y: 519, w: 40, h: 40 },
);
const recovery = variant(
  "b-precision",
  "b-recovery-route",
  "12 / 재도전의 발판",
  ["연속 정밀 점프", "구간별 부활 표식", "마지막 폭탄"],
);
recovery.objects.push(
  ...[210, 550, 940].map((x, i) => ({
    id: `recover-${i}`,
    kind: "respawn" as const,
    x,
    y: 519,
    w: 40,
    h: 40,
  })),
  { id: "recovery-bomb", kind: "bomb", x: 1220, y: 526, w: 25, h: 24 },
);
export const UX_MAPS = [narrow, sparse, free, bombs, timing, relay, recovery];
