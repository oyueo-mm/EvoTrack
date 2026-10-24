import { Simulator, objectPosition } from "./environment";
import { projectRoad, roadLengths } from "./geometry";
import { wrapAngle } from "./random";
import type { TrackMap } from "./types";
/** Scripted play demonstrates physical reachability, not a learned policy. */
export function demonstrate(
  map: TrackMap,
  horizon = 12000,
  edgeDistance = map.id === "b-precision" ? 45 : 5,
  obstacleDistance = map.id === "b-spring-relay"
    ? 105
    : map.id === "b-precision"
      ? 70
      : 25,
) {
  const env = new Simulator(map, horizon);
  env.reset(42);
  const lengths = roadLengths(map.road);
  let arc = 0;
  const actions: number[] = [];
  for (let i = 0; i < horizon && !env.done; i++) {
    const s = env.getState(false);
    let action = 0;
    if (map.mode === "racing") {
      const nearby = map.road
        .slice(1)
        .map((_, i) => i)
        .filter((i) => lengths[i] <= arc + 80 && lengths[i + 1] >= arc - 30);
      arc = projectRoad(s, map.road, lengths, nearby).arc;
      const lookahead = arc + 55;
      let idx = lengths.findIndex((v) => v >= lookahead);
      if (idx < 1) idx = map.road.length - 1;
      const t = Math.min(
        1,
        (lookahead - lengths[idx - 1]) / (lengths[idx] - lengths[idx - 1] || 1),
      );
      const target = {
        x: map.road[idx - 1].x + (map.road[idx].x - map.road[idx - 1].x) * t,
        y: map.road[idx - 1].y + (map.road[idx].y - map.road[idx - 1].y) * t,
      };
      const error = wrapAngle(
        Math.atan2(target.y - s.y, target.x - s.x) - s.angle,
      );
      action = Math.abs(error) > 0.035 ? (error < 0 ? 1 : 2) : 0;
    } else {
      const objects = map.objects.map((o) => objectPosition(o, i / 60, 42));
      const ground = objects
        .filter(
          (o) =>
            o.kind !== "spike" &&
            s.x >= o.x - 2 &&
            s.x <= o.x + o.w + 2 &&
            Math.abs(s.y + 11 - o.y) < 5,
        )
        .sort((a, b) => a.x + a.w - b.x - b.w)[0];
      const danger = objects.some(
        (o) =>
          o.kind === "spike" &&
          o.x > s.x &&
          o.x - s.x < obstacleDistance &&
          o.y < s.y + 25,
      );
      const blocker = objects.some(
        (o) =>
          o.kind !== "spike" &&
          o.x > s.x &&
          o.x - s.x < obstacleDistance &&
          o.y < s.y + 11 &&
          o.y > s.y - 110,
      );
      const edge =
        ground &&
        ground.x + ground.w - s.x < edgeDistance &&
        ground.x + ground.w < map.goal.x;
      action = s.grounded && (edge || danger || blocker) ? 5 : 2;
    }
    actions.push(action);
    env.step(action);
  }
  return {
    success: env.getState().success,
    steps: actions.length,
    reward: env.getState().reward,
    checkpoint: env.getState().checkpoint,
    final: env.getState(false),
    actions,
  };
}
