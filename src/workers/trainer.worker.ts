import type {
  Command,
  Config,
  SavedModel,
  Snapshot,
  TrackMap,
  TrainingStats,
  WorkerReply,
} from "../core/types";
import { schemasFor } from "../core/types";
import { Simulator } from "../core/environment";
import { GeneticTrainer, type GACheckpoint } from "../learning/ga";
import {
  PPOTrainer,
  type PPOCheckpoint,
  initTensorflow,
  tensorMemory,
} from "../learning/ppo";
import { actionOf } from "../learning/network";
import { assertCompatible, evaluate } from "../learning/evaluate";
import { validateConfig, validateModel } from "../storage";
import { validateMap } from "../core/maps";
let session = "",
  running = false,
  timer: ReturnType<typeof setTimeout> | undefined,
  trainer: GeneticTrainer | PPOTrainer | null = null,
  map: TrackMap,
  config: Config,
  stats: TrainingStats,
  snapshot: Snapshot | undefined,
  started = 0,
  activeElapsed = 0,
  lastSent = 0;
let lastTick = 0,
  accumulator = 0,
  totalTicks = 0,
  gaWall = 0,
  gaSteps = 0;
let pendingCheckpoints: number[] = [];
function reply(message: Omit<WorkerReply, "session">) {
  self.postMessage({ ...message, session });
}
function dispose() {
  running = false;
  clearTimeout(timer);
  trainer?.dispose();
  trainer = null;
  pendingCheckpoints = [];
}
function policy() {
  return trainer instanceof GeneticTrainer
    ? (trainer.best ?? trainer.population[0])
    : (trainer as PPOTrainer).getPolicy();
}
function next() {
  if (!running || !trainer) return;
  try {
    if (trainer instanceof GeneticTrainer) {
      nextGA(trainer);
      return;
    }
    const before = performance.now();
    const result = trainer.run();
    const duration = performance.now() - before;
    activeElapsed += duration;
    stats.steps += result.steps;
    stats.episodes += result.episodes;
    stats.iteration++;
    stats.elapsed = (performance.now() - started) / 1000;
    stats.collisions += result.collisions;
    stats.successRate = result.episodes
      ? result.successes / result.episodes
      : 0;
    stats.completionTime = result.successes
      ? result.completion / result.successes
      : null;
    stats.stepsPerSecond = stats.steps / (activeElapsed / 1000 || 1);
    stats.mean = result.mean;
    stats.policyLoss = result.policyLoss;
    stats.valueLoss = result.valueLoss;
    stats.entropy = result.entropy;
    stats.kl = result.kl;
    const p = policy(),
      env = new Simulator(map, config.horizon);
    env.reset(config.seed);
    for (let i = 0; i < config.horizon; i++) {
      const r = env.step(actionOf(p, env.observe()));
      if (r.terminated || r.truncated) break;
    }
    const evaluated = evaluate(p, map, [config.seed], config.horizon);
    if (!(trainer instanceof GeneticTrainer))
      stats.best = Math.max(stats.best, evaluated.meanReward);
    stats.progress = evaluated.meanProgress;
    const memory = tensorMemory();
    stats.tensors = memory.numTensors;
    stats.bytes = memory.numBytes;
    snapshot = {
      stats: { ...stats },
      state: env.getState(),
      population: [],
      policy: p,
    };
    if (performance.now() - lastSent >= 150) {
      reply({ type: "SNAPSHOT", requestId: 0, snapshot });
      lastSent = performance.now();
    }
    timer = setTimeout(next, Math.max(8, 180 / config.speed - duration));
  } catch (e) {
    running = false;
    reply({ type: "ERROR", requestId: 0, error: String(e) });
  }
}
function nextGA(ga: GeneticTrainer) {
  const now = performance.now(),
    elapsed = Math.min(100, Math.max(0, now - lastTick));
  lastTick = now;
  gaWall += elapsed;
  accumulator = Math.min(
    120,
    accumulator + (elapsed * 60 * config.speed) / 1000,
  );
  const workStarted = performance.now();
  while (accumulator >= 1 && performance.now() - workStarted < 12) {
    if (ga.boundary) ga.beginGeneration();
    const before = ga.environments.filter((e) => !e.done).length;
    const result = ga.advance();
    accumulator--;
    totalTicks++;
    stats.steps += before;
    gaSteps += before;
    if (result) {
      stats.iteration = ga.generation;
      stats.episodes += result.episodes;
      stats.mean =
        result.scores.reduce((a, b) => a + b, 0) / result.scores.length;
      stats.fitness = result.scores;
      stats.best = ga.bestScore;
      stats.successRate = result.successes / result.episodes;
      stats.collisions += result.collisions;
      stats.completionTime = result.successes
        ? result.completion / result.successes
        : null;
      publishGA(ga, true);
      for (const id of pendingCheckpoints.splice(0)) void checkpoint(id);
      // Keep the finished generation visible until the next scheduled turn.
      break;
    }
  }
  if (performance.now() - lastSent >= 50) publishGA(ga, false);
  timer = setTimeout(next, Math.max(1, 16 - (performance.now() - workStarted)));
}
function publishGA(ga: GeneticTrainer, boundary: boolean) {
  const states = ga.states(false);
  if (!states.length) return;
  const scores = states.map((s) => s.reward),
    leader = scores.indexOf(Math.max(...scores));
  // Only the followed/leading trace is transferred; avoid N growing trail arrays.
  states.forEach((s, i) => {
    s.trail = ga.environments[i].recentTrail();
  });
  stats.elapsed = (performance.now() - started) / 1000;
  stats.stepsPerSecond = gaSteps / (gaWall / 1000 || 1);
  stats.progress = states[leader].progress;
  if (!boundary) {
    stats.mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    stats.best = Number.isFinite(ga.bestScore)
      ? ga.bestScore
      : Math.max(...scores);
    stats.fitness = scores;
  }
  snapshot = {
    stats: { ...stats },
    state: states[leader],
    population: states,
    policy: policy(),
    live: {
      generation: ga.generation + (boundary ? 0 : 1),
      tick: ga.tick,
      total: states.length,
      alive: states.filter((s) => !s.done).length,
      crashed: states.filter((s) => s.collision).length,
      finished: states.filter((s) => s.success).length,
      leader,
      effectiveSpeed: totalTicks / (gaWall / 1000 || 1) / 60,
      environmentStepsPerSecond: stats.stepsPerSecond,
      boundary,
    },
  };
  reply({ type: "SNAPSHOT", requestId: 0, snapshot });
  lastSent = performance.now();
}
async function checkpoint(requestId: number) {
  if (!trainer || !snapshot) throw Error("저장할 학습 결과가 없습니다.");
  const cp = await trainer.checkpoint();
  const model: SavedModel = {
    id: crypto.randomUUID(),
    name: map.name + " · " + stats.algorithm + " · " + stats.iteration,
    kind: "checkpoint",
    algorithm: stats.algorithm,
    mode: map.mode,
    schemas: schemasFor(map),
    policy: policy(),
    config: { ...config },
    stats: { ...stats },
    mapId: map.id,
    trainingMap: structuredClone(map),
    createdAt: new Date().toISOString(),
    checkpoint: cp,
  };
  reply({ type: "CHECKPOINT", requestId, model });
}
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<Command>) => {
  const cmd = event.data;
  queue = queue
    .then(async () => {
      if (cmd.type === "START" || cmd.type === "LOAD_CHECKPOINT") {
        dispose();
        session = cmd.session;
        map = validateMap(cmd.map);
        config = validateConfig(cmd.config!);
        if (cmd.model) {
          validateModel(cmd.model);
          assertCompatible(cmd.model, map);
        }
        if (cmd.algorithm === "PPO") await initTensorflow();
        trainer =
          cmd.algorithm === "GA"
            ? new GeneticTrainer(map, config)
            : new PPOTrainer(map, config);
        stats = {
          algorithm: cmd.algorithm,
          iteration: 0,
          steps: 0,
          episodes: 0,
          elapsed: 0,
          best: -1e9,
          mean: 0,
          successRate: 0,
          completionTime: null,
          collisions: 0,
          progress: 0,
          fitness: [],
          policyLoss: 0,
          valueLoss: 0,
          entropy: 0,
          kl: 0,
          tensors: 0,
          bytes: 0,
          stepsPerSecond: 0,
        };
        snapshot = undefined;
        activeElapsed = 0;
        lastSent = 0;
        accumulator = 0;
        totalTicks = 0;
        gaWall = 0;
        gaSteps = 0;
        lastTick = performance.now();
        if (cmd.model) {
          const m = cmd.model;
          if (m.kind === "checkpoint") {
            if (m.mapId !== map.id)
              throw Error(
                "체크포인트는 원래 학습 맵에서 재개하세요. 다른 맵에서는 평가를 사용하세요.",
              );
            if (trainer instanceof GeneticTrainer)
              trainer.restore(m.checkpoint as GACheckpoint);
            else await trainer.restore(m.checkpoint as PPOCheckpoint);
            stats = { ...m.stats };
            // Keep the throughput denominator consistent with restored counters.
            activeElapsed =
              stats.stepsPerSecond > 0
                ? (stats.steps / stats.stepsPerSecond) * 1000
                : 0;
          } else {
            if (trainer instanceof GeneticTrainer) {
              trainer.population[0] = structuredClone(m.policy);
              trainer.best = structuredClone(m.policy);
            } else {
              const cp = await trainer.checkpoint();
              cp.actor = m.policy;
              await trainer.restore(cp);
            }
          }
        }
        started = performance.now() - stats.elapsed * 1000;
        running = true;
        reply({ type: "ACK", requestId: cmd.requestId, status: "running" });
        timer = setTimeout(next, 0);
        return;
      }
      if (cmd.session !== session) return;
      if (cmd.type === "PAUSE") {
        running = false;
        clearTimeout(timer);
        if (trainer instanceof GeneticTrainer)
          publishGA(trainer, trainer.boundary);
        reply({ type: "ACK", requestId: cmd.requestId, status: "paused" });
      } else if (cmd.type === "RESUME") {
        if (!trainer) throw Error("학습 세션이 없습니다.");
        if (!running) {
          running = true;
          lastTick = performance.now();
          timer = setTimeout(next, 0);
        }
        reply({ type: "ACK", requestId: cmd.requestId, status: "running" });
      } else if (cmd.type === "STOP" || cmd.type === "RESET") {
        dispose();
        if (cmd.type === "RESET") snapshot = undefined;
        reply({ type: "ACK", requestId: cmd.requestId, status: "stopped" });
      } else if (cmd.type === "UPDATE_CONFIG") {
        const updated = validateConfig(cmd.config!);
        if (
          Object.keys(updated).some(
            (k) =>
              k !== "speed" &&
              updated[k as keyof Config] !== config[k as keyof Config],
          )
        )
          throw Error("배속 외 학습 설정은 새 세션에서 적용하세요.");
        config = { ...updated };
        if (trainer) trainer.config = config;
        reply({
          type: "ACK",
          requestId: cmd.requestId,
          status: running ? "running" : "paused",
        });
      } else if (cmd.type === "REQUEST_SNAPSHOT") {
        if (!snapshot) throw Error("아직 학습 스냅샷이 없습니다.");
        reply({ type: "SNAPSHOT", requestId: cmd.requestId, snapshot });
      } else if (cmd.type === "SAVE_CHECKPOINT") {
        if (trainer instanceof GeneticTrainer && !trainer.boundary) {
          if (!running) throw Error("GA ?? ????? ?????. ?? ?? ? ?? ?????.");
          pendingCheckpoints.push(cmd.requestId);
        } else await checkpoint(cmd.requestId);
      }
    })
    .catch((e) => {
      if (cmd.type === "START" || cmd.type === "LOAD_CHECKPOINT") dispose();
      reply({ type: "ERROR", requestId: cmd.requestId, error: String(e) });
    });
};
