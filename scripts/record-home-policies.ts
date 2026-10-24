import { writeFileSync } from "node:fs";
import { EXAMPLE_MAPS } from "../src/core/maps";
import { DEFAULT_CONFIG } from "../src/core/types";
import { GeneticTrainer } from "../src/learning/ga";
import { evaluate } from "../src/learning/evaluate";
const records = [];
for (const id of ["r-straight", "b-jump"]) {
  const map = EXAMPLE_MAPS.find((m) => m.id === id)!,
    config = { ...DEFAULT_CONFIG, seed: 42, population: 32, horizon: 900 },
    t = new GeneticTrainer(map, config);
  const initial =
    t.population.find((p) => {
      const r = evaluate(p, map, [42], 900).results[0];
      return !r.success && r.collisions > 0 && r.progress > 0.02;
    }) ?? t.population[0];
  const policies = [{ generation: 0, policy: structuredClone(initial) }];
  for (let i = 0; i < 10; i++) {
    t.run();
    if ([1, 4, 10].includes(t.generation))
      policies.push({
        generation: t.generation,
        policy: structuredClone(t.best!),
      });
  }
  records.push({
    mapId: id,
    source: "recorded-ga",
    seed: 42,
    horizon: 900,
    config,
    policies: policies.map((p) => ({
      ...p,
      evaluation: evaluate(p.policy, map, [42], 900),
    })),
  });
  t.dispose();
}
writeFileSync(
  "src/core/home-recordings.json",
  JSON.stringify({
    recordedAt: new Date().toISOString(),
    note: "Actual GA training checkpoints. Replay runs frozen policies; no training runs on the home screen.",
    records,
  }),
);
