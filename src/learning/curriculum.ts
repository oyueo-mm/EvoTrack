import { V05_MAPS } from "../core/v05-maps";
import { schemasFor, type TrackMap } from "../core/types";
export const CURRICULUM_IDS = [
  "b-v5-flat",
  "b-v5-jump",
  "b-spikes",
  "b-v5-horizontal",
  "b-v5-elevator",
  "b-v5-crumble",
  "b-v5-elastic",
];
/** All stages use the same v5 observation/action schemas. No parallel environments. */
export function curriculumStages(target: TrackMap) {
  if (target.mode !== "bounce" || target.environmentVersion !== 5)
    throw Error("커리큘럼은 v5 Bounce 환경에서 사용할 수 있습니다.");
  const stages = CURRICULUM_IDS.map((id) => {
    if (id === "b-spikes") {
      const m = structuredClone(V05_MAPS.find((m) => m.id === "b-v5-flat")!);
      m.id = "curriculum-hazard";
      m.name = "가시 회피";
      m.objects.push({
        id: "spike",
        kind: "spike",
        x: 440,
        y: 526,
        w: 45,
        h: 24,
      });
      return m;
    }
    return structuredClone(V05_MAPS.find((m) => m.id === id)!);
  }).filter((m) => m.id !== target.id);
  stages.push(structuredClone(target));
  if (
    stages.some(
      (m) =>
        JSON.stringify(schemasFor(m)) !== JSON.stringify(schemasFor(target)),
    )
  )
    throw Error("커리큘럼 스키마가 호환되지 않습니다.");
  return stages;
}
export function curriculumPass(result: {
  successRate: number;
  progress: number;
}) {
  return result.successRate >= 2 / 3 && result.progress >= 0.9;
}
