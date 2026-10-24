import { Simulator } from "../core/environment";
import {
  SCHEMAS,
  schemasFor,
  type PolicyData,
  type SavedModel,
  type TrackMap,
} from "../core/types";
import { actionOf, weightCount } from "./network";
export function validatePolicy(p: PolicyData, output: number) {
  if (
    !p ||
    p.input !== 12 ||
    p.hidden !== 24 ||
    p.output !== output ||
    !Array.isArray(p.weights) ||
    p.weights.length !== weightCount(12, 24, output) ||
    !p.weights.every((v) => Number.isFinite(v) && Math.abs(v) < 1e6)
  )
    throw Error("신경망 구조 또는 가중치가 유효하지 않습니다.");
}
export function assertCompatible(model: SavedModel, map: TrackMap) {
  if (
    model.mode !== map.mode ||
    !model.schemas ||
    Object.entries(schemasFor(map)).some(
      ([k, v]) => model.schemas[k as keyof typeof SCHEMAS] !== v,
    )
  )
    throw Error(
      "환경 버전 또는 관측·행동 스키마가 호환되지 않습니다. 기존 모델은 원래 환경에서 실행하세요.",
    );
  validatePolicy(model.policy, map.mode === "racing" ? 5 : 6);
}
export function evaluate(
  policy: PolicyData,
  map: TrackMap,
  seeds = [101, 202, 303],
  horizon = 600,
) {
  validatePolicy(policy, map.mode === "racing" ? 5 : 6);
  const results = seeds.map((seed) => {
    const env = new Simulator(map, horizon);
    env.reset(seed);
    for (let i = 0; i < horizon; i++) {
      const r = env.step(actionOf(policy, env.observe()));
      if (r.terminated || r.truncated) break;
    }
    return env.getMetrics();
  });
  const successes = results.filter((r) => r.success);
  return {
    seeds,
    successRate: successes.length / results.length,
    meanProgress: results.reduce((s, r) => s + r.progress, 0) / results.length,
    meanReward: results.reduce((s, r) => s + r.reward, 0) / results.length,
    completionTime: successes.length
      ? successes.reduce((s, r) => s + r.time, 0) / successes.length
      : null,
    failures: {
      collision: results.filter((r) => !r.success && r.collisions).length,
      timeout: results.filter((r) => !r.success && !r.collisions).length,
    },
    results,
  };
}
