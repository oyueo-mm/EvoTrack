import { Simulator } from "../core/environment";
import { Random } from "../core/random";
import { observationSizeFor } from "../core/types";
import type { AgentState, Config, PolicyData, TrackMap } from "../core/types";
import { actionOf, createPolicy } from "./network";
export interface GACheckpoint {
  boundary?: "generation";
  population: PolicyData[];
  generation: number;
  rng: number;
  best: PolicyData | null;
  bestScore: number;
  bestGeneration?: number;
  bestState?: AgentState;
  stagnantGenerations?: number;
}
export class GeneticTrainer {
  rng: Random;
  population: PolicyData[];
  generation = 0;
  best: PolicyData | null = null;
  bestScore = -Infinity;
  bestGeneration = 0;
  bestState?: AgentState;
  stagnantGenerations = 0;
  lastGenerationBest?: {
    policy: PolicyData;
    state: AgentState;
    generation: number;
  };
  environments: Simulator[] = [];
  tick = 0;
  boundary = true;
  private generationSteps = 0;
  private observations: Float32Array[] = [];
  beginGeneration() {
    this.observations = [];
    this.environments = this.population.map(() => {
      const env = new Simulator(this.map, this.config.horizon);
      this.observations.push(env.reset(this.config.seed));
      return env;
    });
    this.tick = 0;
    this.generationSteps = 0;
    this.boundary = false;
  }
  states(includeTrail = true): AgentState[] {
    return this.environments.map((env, index) => ({
      ...env.getState(includeTrail),
      ...(this.map.mode === "racing"
        ? { sensors: Array.from(this.observations[index].slice(0, 7)) }
        : {}),
    }));
  }
  advance(ticks = 1) {
    if (this.boundary) this.beginGeneration();
    for (let t = 0; t < ticks; t++) {
      for (let i = 0; i < this.environments.length; i++) {
        const env = this.environments[i];
        if (env.getMetrics().success || env.done) continue;
        this.observations[i] = env.step(
          actionOf(this.population[i], this.observations[i]),
        ).observation;
        this.generationSteps++;
      }
      this.tick++;
      if (this.environments.every((env) => env.done))
        return this.finishGeneration();
    }
    return null;
  }
  private finishGeneration() {
    const states = this.states(),
      scores = states.map((s) => s.reward);
    const max = Math.max(...scores),
      index = scores.indexOf(max);
    this.lastGenerationBest = {
      policy: structuredClone(this.population[index]),
      state: structuredClone(states[index]),
      generation: this.generation + 1,
    };
    if (max > this.bestScore + 1e-6) {
      this.stagnantGenerations = 0;
      this.bestScore = max;
      this.best = structuredClone(this.population[index]);
      this.bestGeneration = this.generation + 1;
      this.bestState = structuredClone(states[index]);
    } else this.stagnantGenerations++;
    this.reproduce(scores);
    this.boundary = true;
    const successes = states.filter((s) => s.success);
    return {
      scores,
      states,
      steps: this.generationSteps,
      successes: successes.length,
      collisions: states.filter((s) => s.collision).length,
      completion: successes.reduce((a, s) => a + s.steps / 60, 0),
      state: states[index],
      episodes: states.length,
    };
  }
  constructor(
    public map: TrackMap,
    public config: Config,
  ) {
    this.rng = new Random(config.seed);
    this.population = Array.from({ length: config.population }, () =>
      createPolicy(
        observationSizeFor(map),
        map.mode === "racing" ? 5 : 6,
        this.rng,
      ),
    );
  }
  tournament(scores: number[]) {
    let best = this.rng.int(scores.length);
    for (let i = 0; i < 2; i++) {
      const k = this.rng.int(scores.length);
      if (scores[k] > scores[best]) best = k;
    }
    return best;
  }
  reproduce(scores: number[]) {
    const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
    const n = Math.max(
      1,
      Math.floor(this.population.length * this.config.elite),
    );
    const next = order
      .slice(0, n)
      .map(({ i }) => structuredClone(this.population[i]));
    const sigmaScale =
      this.stagnantGenerations < 4
        ? 1
        : Math.min(2.5, 1 + (this.stagnantGenerations - 3) * 0.25);
    while (next.length < this.population.length) {
      const a = this.population[this.tournament(scores)],
        b = this.population[this.tournament(scores)];
      const cross = this.rng.next() < this.config.crossover;
      // Mix entire hidden neurons, including their incoming weights,
      // bias, and outgoing connections. Per-weight mixing breaks a
      // neuron's co-adapted features.
      const useB = Array.from({ length: a.hidden }, () => this.rng.next() < 0.5);
      const incoming = a.input * a.hidden,
        hiddenBiasEnd = incoming + a.hidden,
        outgoingEnd = hiddenBiasEnd + a.hidden * a.output;
      next.push({
        ...a,
        weights: a.weights.map((value, i) => {
          const neuron =
            i < incoming
              ? i % a.hidden
              : i < hiddenBiasEnd
                ? i - incoming
                : i < outgoingEnd
                  ? Math.floor((i - hiddenBiasEnd) / a.output)
                  : -1;
          const donor =
            cross &&
            (neuron < 0 ? this.rng.next() < 0.5 : useB[neuron]);
          const inherited = donor ? b.weights[i] : value;
          return (
            inherited +
            (this.rng.next() < this.config.mutation
              ? this.rng.normal() * this.config.sigma * sigmaScale
              : 0)
          );
        }),
      });
    }
    if (this.stagnantGenerations >= 8) {
      const immigrants = Math.max(1, Math.floor(this.population.length * 0.08));
      for (let i = 0; i < immigrants; i++)
        next[next.length - 1 - i] = createPolicy(
          observationSizeFor(this.map),
          this.map.mode === "racing" ? 5 : 6,
          this.rng,
        );
    }
    this.population = next;
    this.generation++;
  }
  run() {
    let result: ReturnType<GeneticTrainer["advance"]> = null;
    while (!result) result = this.advance();
    return result;
  }
  checkpoint(): GACheckpoint {
    if (!this.boundary)
      throw Error("GA checkpoints require a generation boundary.");
    return structuredClone({
      boundary: "generation" as const,
      population: this.population,
      generation: this.generation,
      rng: this.rng.state,
      best: this.best,
      bestScore: this.bestScore,
      bestGeneration: this.bestGeneration,
      bestState: this.bestState,
      stagnantGenerations: this.stagnantGenerations,
    });
  }
  restore(c: GACheckpoint) {
    this.population = structuredClone(c.population);
    this.generation = c.generation;
    this.rng.state = c.rng;
    this.best = structuredClone(c.best);
    this.bestScore = c.bestScore;
    this.bestGeneration = c.bestGeneration ?? 0;
    this.bestState = c.bestState;
    this.stagnantGenerations = c.stagnantGenerations ?? 0;
    this.lastGenerationBest = undefined;
    this.environments = [];
    this.tick = 0;
    this.boundary = true;
  }
  dispose() {}
}
