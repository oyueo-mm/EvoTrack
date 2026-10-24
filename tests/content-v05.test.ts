import { describe, it, expect } from "vitest";
import { EXAMPLE_MAPS, validateMap } from "../src/core/maps";
import { V05_MAPS, MAP_VARIANTS } from "../src/core/v05-maps";
import { demonstrate } from "../src/core/demonstrations";
import { curriculumStages, curriculumPass } from "../src/learning/curriculum";
import { schemasFor } from "../src/core/types";
import { Simulator } from "../src/core/environment";
import recordings from "../src/core/home-recordings.json";
import { actionOf } from "../src/learning/network";
describe("v0.5 content", () => {
  it.each(V05_MAPS.map((m) => [m.id, m] as const))(
    "%s has a physically completable scripted route (not an AI claim)",
    (_, map) => {
      expect(validateMap(map)).toEqual(map);
      expect(demonstrate(map, 1800).success).toBe(true);
    },
  );
  it("keeps original IDs and all variants accessible; recommends 16 distinct tasks", () => {
    expect(new Set(EXAMPLE_MAPS.map((m) => m.id)).size).toBe(
      EXAMPLE_MAPS.length,
    );
    expect(EXAMPLE_MAPS.filter((m) => m.recommended)).toHaveLength(16);
    for (const [id, parent] of Object.entries(MAP_VARIANTS)) {
      expect(EXAMPLE_MAPS.find((m) => m.id === id)?.variantOf).toBe(parent);
      expect(EXAMPLE_MAPS.some((m) => m.id === parent)).toBe(true);
    }
  });
  it("keeps curriculum schemas compatible and requires repeated fixed evaluation successes", () => {
    const stages = curriculumStages(
      V05_MAPS.find((m) => m.id === "b-v5-mixed")!,
    );
    expect(stages).toHaveLength(8);
    expect(stages.every((m) => schemasFor(m).observation === 2)).toBe(true);
    expect(curriculumPass({ successRate: 0, progress: 1 })).toBe(false);
    expect(curriculumPass({ successRate: 1, progress: 0.95 })).toBe(true);
    expect(() => curriculumStages(EXAMPLE_MAPS[0])).toThrow();
  });
  it("replays actual recorded GA policies to their recorded outcomes", () => {
    for (const record of recordings.records)
      for (const checkpoint of record.policies) {
        const map = EXAMPLE_MAPS.find((m) => m.id === record.mapId)!,
          env = new Simulator(map, record.horizon);
        env.reset(record.seed);
        while (!env.done) env.step(actionOf(checkpoint.policy, env.observe()));
        expect(env.getState().success).toBe(
          checkpoint.evaluation.results[0].success,
        );
        expect(env.getState().steps).toBe(
          checkpoint.evaluation.results[0].steps,
        );
      }
  });
});
