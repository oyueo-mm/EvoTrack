import { mkdirSync, writeFileSync } from "node:fs";
import { EXAMPLE_MAPS } from "../src/core/maps";
import { DEFAULT_CONFIG } from "../src/core/types";
import { GeneticTrainer } from "../src/learning/ga";
import { PPOTrainer, initTensorflow } from "../src/learning/ppo";
import { evaluate } from "../src/learning/evaluate";

await initTensorflow();
const report = [];
for (const id of ["r-straight", "r-s-curves"])
  for (const algorithm of ["GA", "PPO"] as const)
    for (const version of [1, 2] as const) {
      if (
        process.env.EVOTRACK_REWARD_VERSIONS &&
        !process.env.EVOTRACK_REWARD_VERSIONS.split(",").includes(
          String(version),
        )
      )
        continue;
      const map = structuredClone(EXAMPLE_MAPS.find((m) => m.id === id)!);
      map.environmentVersion = version;
      if (version === 1)
        map.checkpoints = map.checkpoints.map(({ x, y }) => ({ x, y }));
      const config = {
        ...DEFAULT_CONFIG,
        population: 24,
        horizon: 1200,
        rollout: 256,
        epochs: 4,
        seed: 42,
      };
      const trainer =
        algorithm === "GA"
          ? new GeneticTrainer(map, config)
          : new PPOTrainer(map, config);
      const policy = () =>
        trainer instanceof GeneticTrainer
          ? (trainer.best ?? trainer.population[0])
          : trainer.getPolicy();
      const initial = evaluate(policy(), map, [101, 202, 303], config.horizon);
      let steps = 0;
      const history = [];
      for (let i = 0; i < (algorithm === "GA" ? 20 : 30); i++) {
        steps += trainer.run().steps;
        const evaluation = evaluate(
          policy(),
          map,
          [101, 202, 303],
          config.horizon,
        );
        history.push({
          iteration: i + 1,
          steps,
          reward: evaluation.meanReward,
          progress: evaluation.meanProgress,
          successRate: evaluation.successRate,
        });
      }
      const result = {
        map: id,
        algorithm,
        environmentVersion: version,
        seed: 42,
        initial: {
          reward: initial.meanReward,
          progress: initial.meanProgress,
          successRate: initial.successRate,
        },
        final: history.at(-1),
        history,
      };
      report.push(result);
      console.log(JSON.stringify({ ...result, history: undefined }));
      trainer.dispose();
    }
mkdirSync(".cache", { recursive: true });
writeFileSync(
  process.env.EVOTRACK_REWARD_REPORT ?? ".cache/reward-comparison.json",
  JSON.stringify(report, null, 2),
);
