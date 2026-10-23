import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { EXAMPLE_MAPS } from "../src/core/maps";
import { DEFAULT_CONFIG, SCHEMAS, type SavedModel } from "../src/core/types";
import { Random } from "../src/core/random";
import { createPolicy } from "../src/learning/network";
import {
  list,
  put,
  remove,
  validateModel,
  validateConfig,
} from "../src/storage";
import { assertCompatible } from "../src/learning/evaluate";
describe("phase 7: local persistence and import safety", () => {
  it("round-trips a map and removes only the requested record", async () => {
    await put("maps", EXAMPLE_MAPS[0]);
    expect((await list("maps"))[0]).toEqual(EXAMPLE_MAPS[0]);
    await remove("maps", EXAMPLE_MAPS[0].id);
    expect(await list("maps")).toEqual([]);
  });
  it("round-trips an inference policy and blocks incompatible environments", async () => {
    const m: SavedModel = {
      id: "test-model",
      name: "Test",
      kind: "inference",
      algorithm: "GA",
      mode: "racing",
      schemas: SCHEMAS,
      policy: createPolicy(12, 5, new Random(4)),
      config: DEFAULT_CONFIG,
      mapId: EXAMPLE_MAPS[0].id,
      trainingMap: EXAMPLE_MAPS[0],
      createdAt: new Date().toISOString(),
      stats: {
        algorithm: "GA",
        iteration: 1,
        steps: 100,
        episodes: 2,
        elapsed: 1,
        best: 1,
        mean: 0,
        progress: 0.1,
        fitness: [],
        successRate: 0,
        completionTime: null,
        collisions: 0,
        policyLoss: 0,
        valueLoss: 0,
        entropy: 0,
        kl: 0,
        tensors: 0,
        bytes: 0,
        stepsPerSecond: 100,
      },
    };
    await put("models", m);
    expect((await list("models"))[0]).toEqual(m);
    expect(() => assertCompatible(m, EXAMPLE_MAPS[4])).toThrow();
    expect(() =>
      validateModel({ ...m, schemas: { ...SCHEMAS, action: 9 } }),
    ).toThrow();
    expect(() =>
      validateModel({ ...m, policy: { ...m.policy, weights: [NaN] } }),
    ).toThrow();
    expect(() =>
      validateModel({ ...m, kind: "checkpoint", checkpoint: { rng: 0 } }),
    ).toThrow();
  });
  it("rejects malformed and unbounded training settings", () => {
    expect(() =>
      validateConfig({ ...DEFAULT_CONFIG, population: 1e8 }),
    ).toThrow();
    expect(() => validateConfig({ ...DEFAULT_CONFIG, horizon: NaN })).toThrow();
  });
});
