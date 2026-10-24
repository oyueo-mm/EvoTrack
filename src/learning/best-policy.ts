import type {
  Algorithm,
  PolicyData,
  PolicyRecord,
  PolicySummary,
  TrackMap,
} from "../core/types";
import { evaluate } from "./evaluate";
export const POLICY_EVALUATION_SEEDS = [101, 202, 303];
export const POLICY_EVALUATION_INTERVAL = 5;
export function evaluatedPolicy(
  policy: PolicyData,
  map: TrackMap,
  algorithm: Algorithm,
  iteration: number,
  horizon: number,
): PolicyRecord {
  const result = evaluate(policy, map, POLICY_EVALUATION_SEEDS, horizon);
  return {
    algorithm,
    iteration,
    source: "evaluation",
    fitness: result.meanReward,
    successRate: result.successRate,
    progress: result.meanProgress,
    seeds: [...POLICY_EVALUATION_SEEDS],
    horizon,
    policy: structuredClone(policy),
  };
}
export function betterPolicy(candidate: PolicyRecord, previous?: PolicyRecord) {
  if (!previous) return true;
  if (candidate.source === "generation")
    return candidate.fitness > previous.fitness;
  return candidate.successRate !== previous.successRate
    ? candidate.successRate > previous.successRate
    : candidate.progress !== previous.progress
      ? candidate.progress > previous.progress
      : candidate.fitness > previous.fitness;
}
export function policySummary(
  record?: PolicyRecord,
): PolicySummary | undefined {
  if (!record) return;
  const { policy, ...summary } = record;
  return summary;
}
