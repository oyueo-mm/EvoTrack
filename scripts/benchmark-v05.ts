import { cpus, platform, release } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { EXAMPLE_MAPS } from "../src/core/maps";
import { Simulator } from "../src/core/environment";
import { DEFAULT_CONFIG } from "../src/core/types";
import { GeneticTrainer } from "../src/learning/ga";
import { PPOTrainer, initTensorflow, tensorMemory } from "../src/learning/ppo";
import { evaluate } from "../src/learning/evaluate";
import { actionOf, createPolicy, logits } from "../src/learning/network";
import { Random } from "../src/core/random";
await initTensorflow();
const output = process.argv[2] ?? ".cache/v05-baseline.json";
const seeds = [17, 42, 89],
  budget = 32768,
  runs: any[] = [],
  profiles: any[] = [];
const maps = [
  "r-straight",
  "r-serpent",
  "r-angled-walls",
  "b-jump",
  "b-moving",
  "b-spikes",
].map((id) => structuredClone(EXAMPLE_MAPS.find((m) => m.id === id)!));
for (const map of maps) {
  const env = new Simulator(map, 900),
    p = createPolicy(12, env.actionSize, new Random(42));
  let start = performance.now();
  for (let i = 0; i < 4000; i++) {
    if (env.done) env.reset(42);
    env.step(i % env.actionSize);
  }
  const stepMs = performance.now() - start;
  start = performance.now();
  for (let i = 0; i < 4000; i++) env.observe();
  const observeMs = performance.now() - start;
  const obs = env.observe();
  start = performance.now();
  for (let i = 0; i < 4000; i++) logits(p, obs);
  const inferenceMs = performance.now() - start;
  start = performance.now();
  for (let i = 0; i < 200; i++) env.reset(42);
  const resetMs = performance.now() - start;
  start = performance.now();
  for (let i = 0; i < 1000; i++) JSON.stringify(env.getState());
  const serializeMs = performance.now() - start;
  profiles.push({
    id: map.id,
    stepMs,
    observeMs,
    inferenceMs,
    resetMs,
    serializeMs,
    counts: {
      step: 4000,
      observe: 4000,
      inference: 4000,
      reset: 200,
      serialize: 1000,
    },
  });
  for (const algorithm of ["GA", "PPO"] as const)
    for (const seed of seeds) {
      const config = {
        ...DEFAULT_CONFIG,
        seed,
        population: 32,
        horizon: 900,
        rollout: 256,
        epochs: 4,
        minibatch: 64,
      };
      const t =
        algorithm === "GA"
          ? new GeneticTrainer(map, config)
          : new PPOTrainer(map, config);
      let steps = 0,
        firstSuccess: number | null = null,
        collisions = 0,
        episodes = 0,
        best: any = null,
        bestEval: any = null,
        updates = 0;
      const policy = () =>
        t instanceof GeneticTrainer
          ? (t.best ?? t.population[0])
          : t.getPolicy();
      const initial = evaluate(policy(), map, [101, 202, 303], 900);
      start = performance.now();
      let trainMs = 0,
        evalMs = 0;
      while (steps < budget) {
        const a = performance.now();
        const r = t instanceof GeneticTrainer ? t.advance() : t.advance();
        trainMs += performance.now() - a;
        steps =
          t instanceof GeneticTrainer
            ? t.environments.reduce((n, e) => n + e.getState(false).steps, 0) +
              episodes
            : t.totalSamples;
        // GA accounts completed generation transitions separately; advance returns boundary totals.
        if (r) {
          updates++;
          collisions += r.collisions;
          if (t instanceof GeneticTrainer) {
            episodes += r.steps;
            steps = episodes;
          }
          if (algorithm === "GA" || updates % 5 === 0 || steps >= budget) {
            const at = performance.now(),
              e = evaluate(policy(), map, [101, 202, 303], 900);
            evalMs += performance.now() - at;
            if (e.successRate > 0 && firstSuccess === null)
              firstSuccess = steps;
            if (
              !bestEval ||
              e.successRate > bestEval.successRate ||
              (e.successRate === bestEval.successRate &&
                e.meanProgress > bestEval.meanProgress)
            ) {
              best = structuredClone(policy());
              bestEval = e;
            }
          }
        }
      }
      const final = evaluate(policy(), map, [101, 202, 303], 900);
      const heldOut = evaluate(
        best ?? policy(),
        maps.find((m) => m.mode === map.mode && m.id !== map.id)!,
        [404, 505, 606],
        900,
      );
      runs.push({
        id: map.id,
        algorithm,
        seed,
        config,
        budget,
        steps,
        updates,
        trainMs,
        evalMs,
        elapsedMs: performance.now() - start,
        transitionsPerSecond: steps / (trainMs / 1000),
        firstSuccess,
        collisions,
        initial,
        final,
        best: bestEval,
        heldOut,
        memory: tensorMemory(),
      });
      t.dispose();
      console.log(
        JSON.stringify({
          id: map.id,
          algorithm,
          seed,
          steps,
          success: final.successRate,
          progress: final.meanProgress,
          transitionsPerSecond: runs.at(-1).transitionsPerSecond,
        }),
      );
    }
}
for (const population of [32, 64]) {
  const config = { ...DEFAULT_CONFIG, population, horizon: 600 };
  const ga = new GeneticTrainer(maps[0], config);
  let steps = 0;
  const start = performance.now();
  for (let i = 0; i < 6; i++) steps += ga.run().steps;
  profiles.push({
    algorithm: "GA",
    population,
    steps,
    elapsedMs: performance.now() - start,
    checksum: ga.best?.weights.reduce((a, b, i) => a + b * (i + 1), 0),
    score: ga.bestScore,
  });
  ga.dispose();
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      hardware: {
        cpu: cpus()[0].model,
        logicalCores: cpus().length,
        os: platform() + " " + release(),
      },
      backend: "tfjs-cpu / Node",
      budget,
      seeds,
      note: "Preliminary 3-seed experiment; step timing includes observations; evaluation has separate wall time. Scripted reachability is not AI success. Node timings do not represent browser rendering.",
      profiles,
      runs,
    },
    null,
    2,
  ),
);
