import { describe, it, expect } from "vitest";
import { Random } from "../src/core/random";
import { DEFAULT_CONFIG } from "../src/core/types";
import { EXAMPLE_MAPS } from "../src/core/maps";
import { createPolicy, softmax, logits } from "../src/learning/network";
import { GeneticTrainer } from "../src/learning/ga";
import {
  PPOTrainer,
  initTensorflow,
  tensorMemory,
  gae,
  clippedObjective,
} from "../src/learning/ppo";
import { evaluate } from "../src/learning/evaluate";
describe("phase 4: neuroevolution", () => {
  it("preserves elites, crosses and mutates independent weights", () => {
    const ga = new GeneticTrainer(EXAMPLE_MAPS[0], {
      ...DEFAULT_CONFIG,
      population: 8,
      elite: 0.25,
      mutation: 1,
    });
    const elite = structuredClone(ga.population[7]);
    const prior = structuredClone(ga.population);
    ga.reproduce([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(ga.population[0]).toEqual(elite);
    expect(ga.population[2].weights).not.toEqual(prior[2].weights);
    expect(ga.population[0].weights).not.toBe(elite.weights);
    expect(ga.generation).toBe(1);
  });
  it("checkpoint restores exact next generation", () => {
    const a = new GeneticTrainer(EXAMPLE_MAPS[0], {
      ...DEFAULT_CONFIG,
      population: 4,
      horizon: 30,
    });
    a.run();
    const b = new GeneticTrainer(EXAMPLE_MAPS[0], a.config);
    b.restore(JSON.parse(JSON.stringify(a.checkpoint())));
    expect(a.run()).toEqual(b.run());
    expect(a.checkpoint()).toEqual(b.checkpoint());
  });
  it("evaluation never mutates policy weights", () => {
    const p = createPolicy(12, 5, new Random(42));
    const old = JSON.stringify(p);
    evaluate(p, EXAMPLE_MAPS[0], [1, 2], 60);
    expect(JSON.stringify(p)).toBe(old);
  });
});
describe("phase 5: PPO", () => {
  it("categorical distribution and log probabilities are finite and normalized", () => {
    const p = softmax([1000, 1001, -1000]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(Math.log(p[1])).toBeCloseTo(-0.3132616875);
    const policy = createPolicy(12, 5, new Random(4));
    expect(logits(policy, new Float32Array(12))).toHaveLength(5);
  });
  it("GAE handles true termination and bootstraps truncation separately", () => {
    expect(
      gae([1, 2], [0.5, 0.5], [0.5, 9], [false, true], [false, true], 1, 1)
        .advantages,
    ).toEqual([2.5, 1.5]);
    expect(gae([1], [0.5], [2], [false], [true], 1, 1).advantages).toEqual([
      2.5,
    ]);
  });
  it("clipped objective matches both signs", () => {
    expect(clippedObjective(1.5, 2)).toBeCloseTo(2.4);
    expect(clippedObjective(0.5, -2)).toBeCloseTo(-1.6);
  });
  it("updates parameters with bounded tensor counts and restores Adam state", async () => {
    await initTensorflow();
    const base = tensorMemory().numTensors;
    const config = {
      ...DEFAULT_CONFIG,
      rollout: 32,
      epochs: 2,
      minibatch: 16,
      horizon: 30,
    };
    const p = new PPOTrainer(EXAMPLE_MAPS[0], config);
    const before = p.getPolicy();
    const r = p.run();
    expect(r.policyLoss).toBeTypeOf("number");
    expect(p.getPolicy().weights).not.toEqual(before.weights);
    expect(p.getPolicy().weights.every(Number.isFinite)).toBe(true);
    const count = tensorMemory().numTensors;
    p.run();
    expect(tensorMemory().numTensors).toBe(count);
    const cp = await p.checkpoint();
    const b = new PPOTrainer(EXAMPLE_MAPS[0], config);
    await b.restore(JSON.parse(JSON.stringify(cp)));
    expect(b.getPolicy()).toEqual(p.getPolicy());
    p.run();
    b.run();
    p.getPolicy().weights.forEach((w, i) =>
      expect(w).toBeCloseTo(b.getPolicy().weights[i], 5),
    );
    p.dispose();
    b.dispose();
    expect(tensorMemory().numTensors).toBe(base);
  });
});
