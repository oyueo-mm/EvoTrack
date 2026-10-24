import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXAMPLE_MAPS } from "../src/core/maps";
import { DEFAULT_CONFIG, SCHEMAS, type SavedModel } from "../src/core/types";
import { Random } from "../src/core/random";
import { createPolicy } from "../src/learning/network";
import {
  exportWorkspace,
  list,
  put,
  remove,
  restoreWorkspace,
  validateModel,
  validateWorkspace,
  workspaceSummary,
  type Workspace,
} from "../src/storage";

const original = EXAMPLE_MAPS[0];
const experiment = {
  id: "experiment-1",
  name: "기록",
  createdAt: "2026-10-24T00:00:00Z",
  mapId: original.id,
  mapName: original.name,
  algorithm: "both",
  result: { histories: { GA: [] } },
};
const legacy = (): Workspace => ({
  maps: [structuredClone(original)],
  models: [],
  experiments: [structuredClone(experiment)],
});
beforeEach(async () => {
  vi.restoreAllMocks();
  for (const store of ["maps", "models", "experiments"] as const)
    for (const item of await list<{ id: string }>(store))
      await remove(store, item.id);
});
describe("workspace migration safety", () => {
  it("round-trips models, embedded training maps and experiment results together", async () => {
    const model: SavedModel = {
      id: "policy-1",
      name: "가져올 정책",
      kind: "inference",
      algorithm: "GA",
      mode: original.mode,
      schemas: SCHEMAS,
      policy: createPolicy(12, 5, new Random(42)),
      config: DEFAULT_CONFIG,
      trainingMap: original,
      mapId: original.id,
      createdAt: experiment.createdAt,
      stats: {
        algorithm: "GA",
        iteration: 1,
        steps: 100,
        episodes: 1,
        elapsed: 1,
        best: 1,
        mean: 1,
        successRate: 0,
        completionTime: null,
        collisions: 0,
        progress: 0,
        policyLoss: 0,
        valueLoss: 0,
        entropy: 0,
        kl: 0,
        tensors: 0,
        bytes: 0,
        stepsPerSecond: 100,
        fitness: [],
      },
    };
    const incoming = { ...legacy(), models: [model] };
    await restoreWorkspace(incoming, "skip", await exportWorkspace());
    const result = await exportWorkspace();
    expect(result.models).toEqual([model]);
    expect(result.experiments).toEqual([experiment]);
    const broken = structuredClone(incoming);
    broken.models[0].policy.weights[0] = NaN;
    await expect(
      restoreWorkspace(broken, "overwrite", result),
    ).rejects.toThrow();
    expect(await exportWorkspace()).toEqual(result);
    const legacyModel = structuredClone(model);
    legacyModel.schemas.environment = 1;
    delete legacyModel.trainingMap.environmentVersion;
    legacyModel.trainingMap.checkpoints =
      legacyModel.trainingMap.checkpoints.map(({ x, y }) => ({ x, y }));
    expect(validateModel(legacyModel)).toEqual(legacyModel);
    const backup = {
      format: "evotrack-workspace",
      version: 1,
      schemas: { environment: 1, observation: 1, action: 1 },
      maps: [legacyModel.trainingMap],
      models: [legacyModel],
      experiments: [experiment],
    };
    await restoreWorkspace(backup, "overwrite", result);
    expect((await exportWorkspace()).models[0].schemas.environment).toBe(1);
  });
  it("imports legacy v0.1 backups and exports a versioned snapshot", async () => {
    await restoreWorkspace(legacy(), "skip", await exportWorkspace());
    const result = await exportWorkspace();
    expect(result).toMatchObject({
      ...legacy(),
      format: "evotrack-workspace",
      version: 1,
      schemas: SCHEMAS,
    });
    expect(validateWorkspace(JSON.parse(JSON.stringify(result)))).toEqual(
      result,
    );
  });
  it("summarizes duplicates; skip and overwrite preserve unrelated records", async () => {
    await put("maps", original);
    const incoming = legacy();
    incoming.maps[0].name = "가져온 맵";
    const existing = await exportWorkspace();
    expect(workspaceSummary(incoming, existing)[0]).toEqual({
      store: "maps",
      count: 1,
      conflicts: 1,
    });
    await restoreWorkspace(incoming, "skip", existing);
    expect((await list<typeof original>("maps"))[0].name).toBe(original.name);
    await put("maps", EXAMPLE_MAPS[1]);
    await restoreWorkspace(incoming, "overwrite", await exportWorkspace());
    expect(await list("maps")).toHaveLength(2);
    expect(
      (await list<typeof original>("maps")).find((m) => m.id === original.id)
        ?.name,
    ).toBe("가져온 맵");
  });
  it.each([
    { ...legacy(), version: 2 },
    { ...legacy(), schemas: { ...SCHEMAS, action: 8 } },
    { ...legacy(), maps: [original, original] },
    { ...legacy(), experiments: [{ ...experiment, result: undefined }] },
    { ...legacy(), models: [{ id: "broken" }] },
    { ...legacy(), experiments: null },
    { ...legacy(), maps: [{ ...original, roadWidth: 1 }] },
  ])("rejects the entire invalid backup without writing", async (value) => {
    await put("maps", original);
    const before = await exportWorkspace();
    await expect(
      restoreWorkspace(value, "overwrite", before),
    ).rejects.toThrow();
    expect(await exportWorkspace()).toEqual(before);
  });
  it("rolls back earlier puts if a later store write fails", async () => {
    await put("maps", original);
    const before = await exportWorkspace();
    const incoming = legacy();
    incoming.maps[0].name = "must roll back";
    const putImpl = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === "experiments")
        throw new DOMException("disk failure", "QuotaExceededError");
      return putImpl.call(this, value, key);
    });
    await expect(
      restoreWorkspace(incoming, "overwrite", before),
    ).rejects.toThrow("기존 데이터는 보존");
    expect(await exportWorkspace()).toEqual(before);
  });
  it("requires another preview when another tab modifies storage", async () => {
    const reviewed = await exportWorkspace();
    await put("maps", original);
    const before = await exportWorkspace();
    await expect(
      restoreWorkspace(legacy(), "overwrite", reviewed),
    ).rejects.toThrow("다시 선택");
    expect(await exportWorkspace()).toEqual(before);
  });
});
