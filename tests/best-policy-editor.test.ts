import { describe, it, expect } from "vitest";
import { editableV4, v4EditorName } from "../src/core/editor";
import { EXAMPLE_MAPS, newMap } from "../src/core/maps";
import { EDITOR_TOOLS, toolsFor } from "../src/components/studio/editor-tools";
import { GeneticTrainer } from "../src/learning/ga";
import { PPOTrainer, initTensorflow } from "../src/learning/ppo";
import { evaluatedPolicy, betterPolicy } from "../src/learning/best-policy";
import { DEFAULT_CONFIG } from "../src/core/types";
describe("latest editor", () => {
  it.each([1, 2, 3, 4] as const)(
    "preserves v%i original while creating an independent v5 copy",
    (version) => {
      const original = {
        ...structuredClone(EXAMPLE_MAPS[0]),
        environmentVersion: version,
      };
      const before = JSON.stringify(original),
        draft = editableV4(original);
      expect(draft.environmentVersion).toBe(5);
      expect(draft.id).not.toBe(original.id);
      expect(draft.sourceMapId).toBe(original.id);
      expect(JSON.stringify(original)).toBe(before);
      draft.road[0].x++;
      expect(JSON.stringify(original)).toBe(before);
    },
  );
  it("keeps latest identity, both new modes and concise names", () => {
    for (const mode of ["racing", "bounce"] as const) {
      const m = newMap(mode);
      expect(editableV4(m).id).toBe(m.id);
      expect(m.environmentVersion).toBe(5);
    }
    expect(
      v4EditorName("09 / 도약 회랑 · 편집본 · 확장 편집본 · 요소 확장본 (v5)"),
    ).toBe("09 / 도약 회랑 (v5)");
    expect(v4EditorName(v4EditorName("Map"))).toBe("Map (v5)");
    expect(v4EditorName("Map (v4) (v5) 편집본 편집본")).toBe("Map (v5)");
  });
  it("assigns unique icons and descriptions to every available tool", () => {
    expect(new Set(EDITOR_TOOLS.map((t) => t.iconName)).size).toBe(
      EDITOR_TOOLS.length,
    );
    expect(new Set(EDITOR_TOOLS.map((t) => t.id)).size).toBe(
      EDITOR_TOOLS.length,
    );
    for (const t of EDITOR_TOOLS) {
      expect(typeof t.icon).not.toBe("undefined");
      expect(t.description.length).toBeGreaterThan(5);
    }
    expect(toolsFor("racing").some((t) => t.id === "spring")).toBe(false);
    expect(toolsFor("bounce").some((t) => t.id === "checkpoint")).toBe(false);
  });
});
describe("retained policies", () => {
  it("captures the actual generation winner before reproduction and preserves historical discovery", () => {
    const ga = new GeneticTrainer(EXAMPLE_MAPS[0], {
      ...DEFAULT_CONFIG,
      population: 4,
      horizon: 30,
    });
    const prior = structuredClone(ga.population);
    const result = ga.run(),
      index = result.scores.indexOf(Math.max(...result.scores));
    expect(ga.lastGenerationBest?.policy).toEqual(prior[index]);
    expect(ga.bestGeneration).toBe(1);
    expect(ga.bestState?.reward).toBe(ga.bestScore);
    const cp = ga.checkpoint(),
      restored = new GeneticTrainer(EXAMPLE_MAPS[0], ga.config);
    restored.restore(cp);
    expect(restored.bestGeneration).toBe(1);
    expect(restored.best).toEqual(ga.best);
    expect(restored.run()).toEqual(ga.run());
  });
  it("uses reproducible evaluation without touching PPO rollout, RNG or weights", async () => {
    await initTensorflow();
    const p = new PPOTrainer(EXAMPLE_MAPS[0], {
      ...DEFAULT_CONFIG,
      horizon: 30,
      rollout: 16,
      epochs: 1,
      minibatch: 8,
    });
    p.advance();
    const state = p.environment.getState(),
      rng = p.rng.state,
      weights = p.getPolicy(),
      samples = p.totalSamples,
      env = p.environment;
    const a = evaluatedPolicy(weights, p.map, "PPO", 0, 30),
      b = evaluatedPolicy(weights, p.map, "PPO", 0, 30);
    expect(a).toEqual(b);
    expect(a.seeds).toEqual([101, 202, 303]);
    expect(p.environment.getState()).toEqual(state);
    expect(p.getPolicy()).toEqual(weights);
    expect(p.rng.state).toBe(rng);
    expect(p.totalSamples).toBe(samples);
    p.run();
    p.run();
    expect(p.environment).toBe(env);
    p.dispose();
  });
  it("ranks evaluated PPO policies by success then progress then reward, not one lucky reward", () => {
    const ga = new GeneticTrainer(EXAMPLE_MAPS[0], {
      ...DEFAULT_CONFIG,
      population: 4,
      horizon: 30,
    });
    const base = evaluatedPolicy(
      ga.population[0],
      EXAMPLE_MAPS[0],
      "PPO",
      1,
      30,
    );
    const best = { ...base, successRate: 1, progress: 1, fitness: 10 },
      lucky = { ...base, successRate: 0, progress: 0.9, fitness: 1000 };
    expect(betterPolicy(lucky, best)).toBe(false);
    expect(betterPolicy(best, lucky)).toBe(true);
    expect(betterPolicy({ ...best, iteration: 2, fitness: 11 }, best)).toBe(
      true,
    );
  });
});
