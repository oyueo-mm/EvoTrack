import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { EXAMPLE_MAPS } from "../src/core/maps";
import { V05_MAPS } from "../src/core/v05-maps";
import { DEFAULT_CONFIG } from "../src/core/types";
import { GeneticTrainer } from "../src/learning/ga";
import { PPOTrainer, initTensorflow } from "../src/learning/ppo";
import { evaluate } from "../src/learning/evaluate";
await initTensorflow();
const destination = process.argv[2] ?? ".cache/learning-benchmark.json";
const ids = ["r-straight", "r-serpent", "b-v5-horizontal"];
const seeds = [17, 42, 89], evaluationSeeds = [101, 202, 303];
const runs: unknown[] = [];
for (const id of ids) {
  const map = structuredClone([...EXAMPLE_MAPS, ...V05_MAPS].find((m) => m.id === id)!);
  for (const algorithm of ["GA", "PPO"] as const) {
    for (const seed of seeds) {
      const config = { ...DEFAULT_CONFIG, seed, horizon: 900, population: 32, rollout: 256, epochs: 4, minibatch: 64 };
      const trainer = algorithm === "GA" ? new GeneticTrainer(map, config) : new PPOTrainer(map, config);
      const policy = () => trainer instanceof GeneticTrainer ? trainer.best ?? trainer.population[0] : trainer.getPolicy();
      const initial = evaluate(policy(), map, evaluationSeeds, config.horizon);
      let best = initial, steps = 0, iterations = 0;
      const budget = algorithm === "GA" ? 32768 : 16384, started = performance.now();
      while (steps < budget) {
        const result = trainer.run();
        steps += result.steps;
        iterations++;
        if (algorithm === "GA" || iterations % 5 === 0 || steps >= budget) {
          const candidate = evaluate(policy(), map, evaluationSeeds, config.horizon);
          if (candidate.successRate > best.successRate ||
            (candidate.successRate === best.successRate && candidate.meanProgress > best.meanProgress) ||
            (candidate.successRate === best.successRate && candidate.meanProgress === best.meanProgress && candidate.meanReward > best.meanReward))
            best = candidate;
        }
      }
      const final = evaluate(policy(), map, evaluationSeeds, config.horizon);
      const record = { id, algorithm, seed, steps, iterations, budget, initial: { successRate: initial.successRate, meanProgress: initial.meanProgress, meanReward: initial.meanReward }, best: { successRate: best.successRate, meanProgress: best.meanProgress, meanReward: best.meanReward }, final: { successRate: final.successRate, meanProgress: final.meanProgress, meanReward: final.meanReward }, elapsedMs: performance.now() - started };
      runs.push(record);
      trainer.dispose();
      console.log(JSON.stringify({ id, algorithm, seed, steps, bestSuccess: best.successRate, bestProgress: best.meanProgress, finalSuccess: final.successRate }));
    }
  }
}
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, JSON.stringify({ evaluationSeeds, trainingSeeds: seeds, note: "Preliminary deterministic greedy evaluation. Same environment budget and fixed seeds for candidate and baseline. Each GA generation can exceed its budget boundary. Success is per-run 3-seed average.", runs }, null, 2));
