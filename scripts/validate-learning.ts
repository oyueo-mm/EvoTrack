import { mkdirSync, writeFileSync } from "node:fs";
import { EXAMPLE_MAPS } from "../src/core/maps";
import { DEFAULT_CONFIG } from "../src/core/types";
import { GeneticTrainer } from "../src/learning/ga";
import { PPOTrainer, initTensorflow, tensorMemory } from "../src/learning/ppo";
import { evaluate } from "../src/learning/evaluate";
await initTensorflow();
const report = [];
for (const mode of ["racing", "bounce"] as const) {
  const map = structuredClone(EXAMPLE_MAPS[mode === "racing" ? 0 : 4]);
  // The first Bounce benchmark is a flat, obstacle-free baseline. Harder built-ins remain separate evaluation tasks.
  if (mode === "bounce") {
    map.id = "validation-bounce-flat";
    map.name = "Validation / flat";
    map.objects = map.objects.filter((o) => o.id === "floor");
  }
  for (const algorithm of ["GA", "PPO"] as const) {
    const config = {
      ...DEFAULT_CONFIG,
      population: 24,
      horizon: 420,
      rollout: 256,
      epochs: 4,
      seed: 42,
    };
    const trainer =
      algorithm === "GA"
        ? new GeneticTrainer(map, config)
        : new PPOTrainer(map, config);
    const getPolicy = () =>
      trainer instanceof GeneticTrainer
        ? (trainer.best ?? trainer.population[0])
        : trainer.getPolicy();
    const initial = evaluate(getPolicy(), map, [101, 202, 303], config.horizon);
    let steps = 0;
    const started = performance.now();
    const history = [];
    const iterations = algorithm === "GA" ? 12 : 30;
    for (let i = 0; i < iterations; i++) {
      steps += trainer.run().steps;
      const r = evaluate(getPolicy(), map, [101, 202, 303], config.horizon);
      history.push({
        iteration: i + 1,
        steps,
        reward: r.meanReward,
        progress: r.meanProgress,
        successRate: r.successRate,
      });
    }
    const final = evaluate(getPolicy(), map, [101, 202, 303], config.horizon);
    const memory = tensorMemory();
    report.push({
      mode,
      algorithm,
      mapId: map.id,
      config,
      iterations,
      steps,
      elapsedSeconds: (performance.now() - started) / 1000,
      initial,
      final,
      deltaReward: final.meanReward - initial.meanReward,
      memory: { tensors: memory.numTensors, bytes: memory.numBytes },
      history,
    });
    console.log(
      JSON.stringify({
        mode,
        algorithm,
        initial: initial.meanReward,
        final: final.meanReward,
        delta: final.meanReward - initial.meanReward,
        successRate: final.successRate,
        steps,
      }),
    );
    trainer.dispose();
  }
}
mkdirSync("docs/results", { recursive: true });
writeFileSync(
  "docs/results/learning-validation.json",
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      backend: "tfjs-cpu",
      note: "Single training seed; deterministic greedy evaluation; flat Bounce fixture. This does not establish generalization.",
      runs: report,
    },
    null,
    2,
  ),
);
