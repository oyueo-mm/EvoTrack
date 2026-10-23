import { Simulator } from "../core/environment";
import { Random } from "../core/random";
import type { AgentState, Config, PolicyData, TrackMap } from "../core/types";
import { actionOf, createPolicy } from "./network";
export interface GACheckpoint {
  population: PolicyData[];
  generation: number;
  rng: number;
  best: PolicyData | null;
  bestScore: number;
}
export class GeneticTrainer {
  rng: Random;
  population: PolicyData[];
  generation = 0;
  best: PolicyData | null = null;
  bestScore = -Infinity;
  constructor(
    public map: TrackMap,
    public config: Config,
  ) {
    this.rng = new Random(config.seed);
    this.population = Array.from({ length: config.population }, () =>
      createPolicy(12, map.mode === "racing" ? 5 : 6, this.rng),
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
    while (next.length < this.population.length) {
      const a = this.population[this.tournament(scores)],
        b = this.population[this.tournament(scores)];
      const cross = this.rng.next() < this.config.crossover;
      next.push({
        ...a,
        weights: a.weights.map(
          (v, i) =>
            (cross && this.rng.next() < 0.5 ? b.weights[i] : v) +
            (this.rng.next() < this.config.mutation
              ? this.rng.normal() * this.config.sigma
              : 0),
        ),
      });
    }
    this.population = next;
    this.generation++;
  }
  run() {
    const scores: number[] = [],
      states: AgentState[] = [];
    let steps = 0,
      successes = 0,
      collisions = 0,
      completion = 0;
    for (const policy of this.population) {
      const env = new Simulator(this.map, this.config.horizon);
      env.reset(this.config.seed);
      while (!env.getMetrics().success) {
        const r = env.step(actionOf(policy, env.observe()));
        steps++;
        if (r.terminated || r.truncated) break;
      }
      const state = env.getState();
      scores.push(state.reward);
      states.push(state);
      successes += +state.success;
      collisions += +state.collision;
      if (state.success) completion += state.steps / 60;
    }
    const max = Math.max(...scores),
      index = scores.indexOf(max);
    if (max > this.bestScore) {
      this.bestScore = max;
      this.best = structuredClone(this.population[index]);
    }
    this.reproduce(scores);
    return {
      scores,
      steps,
      successes,
      collisions,
      completion,
      state: states[index],
      states,
      episodes: scores.length,
    };
  }
  checkpoint(): GACheckpoint {
    return structuredClone({
      population: this.population,
      generation: this.generation,
      rng: this.rng.state,
      best: this.best,
      bestScore: this.bestScore,
    });
  }
  restore(c: GACheckpoint) {
    this.population = structuredClone(c.population);
    this.generation = c.generation;
    this.rng.state = c.rng;
    this.best = structuredClone(c.best);
    this.bestScore = c.bestScore;
  }
  dispose() {}
}
