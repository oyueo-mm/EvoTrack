import { backendCapabilities, benchmarkBackends } from "../learning/backends";
import { curriculumStages, curriculumPass } from "../learning/curriculum";
import {
  evaluatedPolicy,
  betterPolicy,
  policySummary,
  POLICY_EVALUATION_INTERVAL,
} from "../learning/best-policy";
import type { PolicyCatalog, PolicyRecord } from "../core/types";
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
import { GeneticTrainer, type GACheckpoint } from "../learning/ga";
import {
  PPOTrainer,
  type PPOCheckpoint,
  initTensorflow,
  tensorMemory,
} from "../learning/ppo";
import { assertCompatible } from "../learning/evaluate";
import { validateConfig, validateModel } from "../storage";
import { validateMap } from "../core/maps";
let session = "",
  running = false,
  timer: ReturnType<typeof setTimeout> | undefined,
  trainer: GeneticTrainer | PPOTrainer | null = null,
  map: TrackMap,
  config: Config,
  stats: TrainingStats,
  snapshot: Snapshot | undefined;
let lastTick = 0,
  accumulator = 0,
  totalTicks = 0,
  gaWall = 0,
  gaSteps = 0;
let wallOffset = 0;
let pendingCheckpoints: number[] = [];
let catalog: PolicyCatalog = {};
let backendReport = { backend: "cpu", support: {} as Record<string, string> };
let curriculum:
  | { stage: number; passes: number; stages: TrackMap[]; target: TrackMap }
  | undefined;
function capturePolicies(evaluateCurrent = false) {
  if (trainer instanceof GeneticTrainer) {
    const ga = trainer,
      states = ga.states(false),
      leader = states.length
        ? states.reduce(
            (best, s, i) => (s.reward > states[best].reward ? i : best),
            0,
          )
        : 0;
    const final = ga.boundary ? ga.lastGenerationBest : undefined;
    const state = final?.state ?? states[leader];
    if (state)
      catalog.current = {
        algorithm: "GA",
        iteration: final?.generation ?? ga.generation + 1,
        source: "generation",
        fitness: state.reward,
        successRate: +state.success,
        progress: state.progress,
        horizon: config.horizon,
        phase: ga.boundary ? "완료" : "진행 중",
        policy: structuredClone(final?.policy ?? ga.population[leader]),
      };
    if (ga.best && !ga.bestState && !catalog.best) {
      catalog.best = evaluatedPolicy(ga.best, map, "GA", 0, config.horizon);
      catalog.best.phase = "기존 체크포인트 · 재평가";
    }
    if (ga.best && ga.bestState)
      catalog.best = {
        algorithm: "GA",
        iteration: ga.bestGeneration,
        source: "generation",
        fitness: ga.bestScore,
        successRate: +ga.bestState.success,
        progress: ga.bestState.progress,
        horizon: config.horizon,
        policy: structuredClone(ga.best),
      };
  } else if (trainer instanceof PPOTrainer && evaluateCurrent) {
    const current = evaluatedPolicy(
      trainer.getPolicy(),
      map,
      "PPO",
      trainer.updates,
      config.horizon,
    );
    current.phase = trainer.phase;
    catalog.current = current;
    if (trainer.phase !== "OPTIMIZING" && betterPolicy(current, catalog.best))
      catalog.best = structuredClone(current);
  }
}

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
let awaitingFrame = 0,
  sequence = 0,
  debug = false,
  bestProgress = 0;
let selectedAgent: number | undefined;
function mode() {
  return config.trainingMode ?? "observe";
}
function schedule() {
  clearTimeout(timer);
  if (running && (!awaitingFrame || mode() === "fast"))
    timer = setTimeout(next, mode() === "fast" ? 0 : 16);
}
function emit() {
  if (!snapshot) return;
  snapshot.policies = {
    current: policySummary(catalog.current),
    best: policySummary(catalog.best),
  };
  snapshot.sequence = ++sequence;
  snapshot.session = session;
  if (mode() === "observe") awaitingFrame = sequence;
  if (debug)
    snapshot.debug = {
      policyChecksum: snapshot.policy.weights.reduce(
        (a, b, i) => a + b * (i + 1),
        0,
      ),
      transition:
        trainer instanceof PPOTrainer ? trainer.lastTransition : undefined,
    };
  if (snapshot.runtime)
    snapshot.runtime.frameBytes = new TextEncoder().encode(
      JSON.stringify(snapshot),
    ).byteLength;
  reply({ type: "SNAPSHOT", requestId: 0, snapshot });
}
function runtime(
  phase: "COLLECTING" | "OPTIMIZING" | "READY",
  ppo?: PPOTrainer,
) {
  const ticksPerSecond = totalTicks / (gaWall / 1000 || 1);
  return {
    phase,
    mode: mode(),
    ticks: totalTicks,
    ticksPerSecond,
    effectiveSpeed: ticksPerSecond / 60,
    rollout: ppo?.collected ?? 0,
    target: config.rollout,
    updates: ppo?.updates ?? 0,
    environmentId: ppo?.environmentId ?? session + ":ga-population",
    sample: ppo?.totalSamples ?? stats.steps,
    frameBytes: 0,
    bestProgress,
    learningEnvironmentCount: ppo ? 1 : config.population,
    ...(ppo
      ? {
          backend: backendReport.backend,
          backendSupport: backendReport.support,
          activeMap: curriculum ? map : undefined,
          curriculum: curriculum
            ? {
                stage: curriculum.stage + 1,
                name: map.name,
                passes: curriculum.passes,
              }
            : undefined,
        }
      : {}),
  };
}
function publishPPO(ppo: PPOTrainer) {
  const state = { ...ppo.displayState, trail: ppo.environment.recentTrail() };
  bestProgress = Math.max(bestProgress, state.progress);
  stats.elapsed = (wallOffset + gaWall) / 1000;
  stats.progress = state.progress;
  stats.best = Math.max(stats.best, state.reward);
  stats.stepsPerSecond = ppo.totalSamples / (gaWall / 1000 || 1);
  const memory = tensorMemory();
  stats.tensors = memory.numTensors;
  stats.bytes = memory.numBytes;
  snapshot = {
    stats: { ...stats },
    state,
    population: [],
    policy: ppo.getPolicy(),
    runtime: runtime(ppo.phase, ppo),
  };
  emit();
}
function next() {
  if (!running || !trainer || (awaitingFrame && mode() === "observe")) return;
  try {
    const now = performance.now(),
      elapsed = Math.max(0, now - lastTick);
    lastTick = now;
    gaWall += elapsed;
    accumulator =
      mode() === "fast"
        ? 120
        : Math.min(
            mode() === "observe" ? Math.ceil(config.speed * 4) : 120,
            accumulator + (Math.min(100, elapsed) * 60 * config.speed) / 1000,
          );
    const begin = performance.now();
    let budget = mode() === "observe" ? Math.ceil(config.speed * 2) : 120;
    while (budget-- > 0 && performance.now() - begin < 10) {
      if (trainer instanceof GeneticTrainer) {
        if (accumulator < 1) break;
        const ga = trainer;
        if (ga.boundary) ga.beginGeneration();
        const count = ga.environments.filter((e) => !e.done).length,
          result = ga.advance();
        totalTicks++;
        bestProgress = Math.max(
          bestProgress,
          ...ga.environments.map((e) => e.getMetrics().progress),
        );
        stats.steps += count;
        gaSteps += count;
        accumulator--;
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
          for (const id of pendingCheckpoints.splice(0)) void checkpoint(id);
          break;
        }
      } else {
        const ppo = trainer;
        if (ppo.phase !== "OPTIMIZING" && accumulator < 1) break;
        const before = ppo.totalSamples,
          result = ppo.advance();
        bestProgress = Math.max(bestProgress, ppo.displayState.progress);
        const samples = ppo.totalSamples - before;
        totalTicks += samples;
        stats.steps += samples;
        accumulator -= samples;
        if (result) {
          if (
            ppo.updates === 1 ||
            ppo.updates % POLICY_EVALUATION_INTERVAL === 0
          ) {
            capturePolicies(true);
            if (curriculum && catalog.current) {
              curriculum.passes = curriculumPass(catalog.current)
                ? curriculum.passes + 1
                : 0;
              if (
                curriculum.passes >= 2 &&
                curriculum.stage < curriculum.stages.length - 1
              ) {
                curriculum.stage++;
                curriculum.passes = 0;
                map = curriculum.stages[curriculum.stage];
                ppo.changeEnvironment(map);
                catalog = {};
              }
            }
          }
          stats.iteration = ppo.updates;
          stats.mean = result.mean;
          stats.episodes += result.episodes;
          stats.collisions += result.collisions;
          stats.successRate = result.episodes
            ? result.successes / result.episodes
            : 0;
          stats.completionTime = result.successes
            ? result.completion / result.successes
            : null;
          stats.policyLoss = result.policyLoss;
          stats.valueLoss = result.valueLoss;
          stats.entropy = result.entropy;
          stats.kl = result.kl;
          stats.diagnostics = result.diagnostics;
          for (const id of pendingCheckpoints.splice(0)) void checkpoint(id);
          break;
        }
        // Optimization yields after each minibatch so PAUSE is handled between units.
        if (ppo.phase === "OPTIMIZING" && mode() === "observe") break;
      }
    }
    if (trainer instanceof GeneticTrainer) publishGA(trainer, trainer.boundary);
    else publishPPO(trainer);
    schedule();
  } catch (e) {
    running = false;
    reply({ type: "ERROR", requestId: 0, error: String(e) });
  }
}
function publishGA(ga: GeneticTrainer, boundary: boolean) {
  capturePolicies();
  const states = ga.states(false);
  bestProgress = Math.max(bestProgress, ...states.map((s) => s.progress));
  if (!states.length) return;
  const scores = states.map((s) => s.reward),
    leader = scores.indexOf(Math.max(...scores));
  // Only the followed/leading trace is transferred; avoid N growing trail arrays.
  states.forEach((s, i) => {
    s.trail =
      i === (selectedAgent ?? leader) ? ga.environments[i].recentTrail() : [];
  });
  stats.elapsed = (wallOffset + gaWall) / 1000;
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
  snapshot.runtime = runtime(boundary ? "READY" : "COLLECTING");
  emit();
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
    bestPolicy: catalog.best ? structuredClone(catalog.best) : undefined,
    curriculumState: curriculum
      ? {
          stage: curriculum.stage,
          passes: curriculum.passes,
          target: curriculum.target,
        }
      : undefined,
  };
  reply({ type: "CHECKPOINT", requestId, model });
}
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<Command>) => {
  const cmd = event.data;
  queue = queue
    .then(async () => {
      if (cmd.type === "BENCHMARK_BACKENDS") {
        if (trainer) throw Error("별도 Worker에서만 백엔드를 측정하세요.");
        session = cmd.session;
        reply({
          type: "BACKENDS",
          requestId: cmd.requestId,
          backends: await benchmarkBackends(
            validateMap(cmd.map),
            validateConfig(cmd.config!),
          ),
        });
        return;
      }
      if (cmd.type === "START" || cmd.type === "LOAD_CHECKPOINT") {
        dispose();
        session = cmd.session;
        map = validateMap(cmd.map);
        config = validateConfig(cmd.config!);
        curriculum = undefined;
        if (cmd.algorithm === "PPO" && config.curriculum) {
          const target = cmd.model?.curriculumState?.target ?? map;
          const stages = curriculumStages(target);
          const stage = cmd.model?.curriculumState?.stage ?? 0;
          curriculum = {
            target,
            stages,
            stage,
            passes: cmd.model?.curriculumState?.passes ?? 0,
          };
          map = stages[stage];
        }
        if (cmd.model) {
          validateModel(cmd.model);
          assertCompatible(cmd.model, map);
        }
        if (cmd.algorithm === "PPO") {
          await initTensorflow();
          backendReport = await backendCapabilities();
        }
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
        catalog = {};
        awaitingFrame = 0;
        sequence = 0;
        debug = !!cmd.debug;
        bestProgress = 0;
        selectedAgent = undefined;
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
            if (m.bestPolicy) catalog.best = structuredClone(m.bestPolicy);
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
        wallOffset = stats.elapsed * 1000;
        running = true;
        reply({ type: "ACK", requestId: cmd.requestId, status: "running" });
        if (trainer instanceof GeneticTrainer) {
          trainer.beginGeneration();
          publishGA(trainer, false);
        } else publishPPO(trainer);
        schedule();
        return;
      }
      if (cmd.session !== session) return;
      if (cmd.type === "INSPECT_POLICIES") {
        if (running) throw Error("모델 확인 전에 학습을 일시정지하세요.");
        capturePolicies(true);
        if (!catalog.current && !catalog.best)
          throw Error("확인할 정책이 없습니다.");
        reply({
          type: "POLICIES",
          requestId: cmd.requestId,
          catalog: structuredClone(catalog),
        });
        return;
      }
      if (cmd.type === "FRAME_ACK") {
        selectedAgent =
          Number.isInteger(cmd.selectedAgent) &&
          cmd.selectedAgent! >= 0 &&
          cmd.selectedAgent! < config.population
            ? cmd.selectedAgent
            : undefined;
        if (cmd.sequence === awaitingFrame) {
          awaitingFrame = 0;
          schedule();
        }
        return;
      }
      if (cmd.type === "PAUSE") {
        running = false;
        clearTimeout(timer);
        if (trainer instanceof GeneticTrainer)
          publishGA(trainer, trainer.boundary);
        else if (trainer instanceof PPOTrainer) publishPPO(trainer);
        reply({
          type: "ACK",
          requestId: cmd.requestId,
          status: trainer ? "paused" : "stopped",
        });
      } else if (cmd.type === "RESUME") {
        if (!trainer) throw Error("학습 세션이 없습니다.");
        if (!running) {
          running = true;
          lastTick = performance.now();
          awaitingFrame = 0;
          accumulator = 0;
          schedule();
        }
        reply({ type: "ACK", requestId: cmd.requestId, status: "running" });
      } else if (cmd.type === "STOP" || cmd.type === "RESET") {
        running = false;
        capturePolicies(true);
        if (trainer instanceof GeneticTrainer)
          publishGA(trainer, trainer.boundary);
        else if (trainer instanceof PPOTrainer) publishPPO(trainer);
        dispose();
        if (cmd.type === "RESET") {
          snapshot = undefined;
          catalog = {};
          curriculum = undefined;
        }
        reply({ type: "ACK", requestId: cmd.requestId, status: "stopped" });
      } else if (cmd.type === "UPDATE_CONFIG") {
        const updated = validateConfig(cmd.config!);
        if (
          Object.keys(updated).some(
            (k) =>
              k !== "speed" &&
              k !== "trainingMode" &&
              updated[k as keyof Config] !== config[k as keyof Config],
          )
        )
          throw Error("배속 외 학습 설정은 새 세션에서 적용하세요.");
        config = { ...updated };
        if (trainer) trainer.config = config;
        awaitingFrame = 0;
        schedule();
        reply({
          type: "ACK",
          requestId: cmd.requestId,
          status: running ? "running" : "paused",
        });
      } else if (cmd.type === "REQUEST_SNAPSHOT") {
        if (!snapshot) throw Error("아직 학습 스냅샷이 없습니다.");
        reply({ type: "SNAPSHOT", requestId: cmd.requestId, snapshot });
      } else if (cmd.type === "SAVE_CHECKPOINT") {
        if (
          (trainer instanceof GeneticTrainer && !trainer.boundary) ||
          (trainer instanceof PPOTrainer && trainer.phase !== "READY")
        ) {
          if (!running)
            throw Error(
              "세대/rollout 도중 일시정지 상태입니다. 학습 재개 후 경계에서 체크포인트를 저장하세요.",
            );
          pendingCheckpoints.push(cmd.requestId);
        } else await checkpoint(cmd.requestId);
      }
    })
    .catch((e) => {
      if (cmd.type === "START" || cmd.type === "LOAD_CHECKPOINT") dispose();
      reply({ type: "ERROR", requestId: cmd.requestId, error: String(e) });
    });
};
