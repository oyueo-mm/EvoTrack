import * as tf from "@tensorflow/tfjs";
import { Simulator } from "../core/environment";
import { Random } from "../core/random";
import { observationSizeFor } from "../core/types";
import type {
  TrainingStats,
  AgentState,
  Config,
  PolicyData,
  TrackMap,
} from "../core/types";
import { createPolicy, logits, sample, softmax } from "./network";
export function gae(
  rewards: number[],
  values: number[],
  nextValues: number[],
  terminated: boolean[],
  boundaries: boolean[],
  gamma = 0.99,
  lambda = 0.95,
) {
  const adv = new Array(rewards.length).fill(0);
  let last = 0;
  for (let i = rewards.length - 1; i >= 0; i--) {
    const delta =
      rewards[i] + gamma * (terminated[i] ? 0 : nextValues[i]) - values[i];
    last = delta + gamma * lambda * (boundaries[i] ? 0 : last);
    adv[i] = last;
  }
  return { advantages: adv, returns: adv.map((a, i) => a + values[i]) };
}
export const clippedObjective = (ratio: number, adv: number, clip = 0.2) =>
  Math.min(ratio * adv, Math.max(1 - clip, Math.min(1 + clip, ratio)) * adv);
export const combinedPPOLoss = (
  policy: tf.Scalar,
  valueMSE: tf.Scalar,
  entropy: tf.Scalar,
  entropyCoefficient: number,
) => policy.add(valueMSE.mul(0.5)).sub(entropy.mul(entropyCoefficient));

type SerializedTensor = { name: string; shape: number[]; values: number[] };
export interface PPOCheckpoint {
  actor: PolicyData;
  critic: PolicyData;
  optimizer: SerializedTensor[];
  rng: number;
  updates: number;
  environment?: ReturnType<Simulator["checkpoint"]>;
  episodeSerial?: number;
  totalSamples?: number;
}
export interface PPORunResult {
  steps: number;
  episodes: number;
  successes: number;
  collisions: number;
  completion: number;
  state: AgentState;
  mean: number;
  policyLoss: number;
  valueLoss: number;
  entropy: number;
  kl: number;
  diagnostics: NonNullable<TrainingStats["diagnostics"]>;
}
export class PPOTrainer {
  rng: Random;
  actor: tf.Variable[];
  critic: tf.Variable[];
  optimizer: tf.AdamOptimizer;
  updates = 0;
  private episodeSerial = 0;
  private valueCache?: number;
  private currentObservation?: Float32Array;
  private names: string[];
  environmentId = crypto.randomUUID();
  environment: Simulator;
  phase: "READY" | "COLLECTING" | "OPTIMIZING" = "READY";
  collected = 0;
  totalSamples = 0;
  displayState: ReturnType<Simulator["getState"]>;
  lastTransition?: {
    environmentId: string;
    sample: number;
    action: number;
    reward: number;
    logProbability: number;
    value: number;
    state: ReturnType<Simulator["getState"]>;
  };
  private iterator?: Generator<null, PPORunResult, void>;
  advance() {
    this.iterator ??= this.iterate();
    const result = this.iterator.next();
    if (result.done) {
      this.iterator = undefined;
      return result.value;
    }
    return null;
  }
  run() {
    let result: PPORunResult | null;
    while (!(result = this.advance())) {}
    return result;
  }
  constructor(
    public map: TrackMap,
    public config: Config,
  ) {
    this.environment = new Simulator(map, config.horizon);
    this.environment.reset(config.seed);
    this.displayState = this.environment.getState(true, true);
    this.rng = new Random(config.seed);
    const initial = createPolicy(
      observationSizeFor(map),
      map.mode === "racing" ? 5 : 6,
      this.rng,
    );
    // Near-uniform initial action distribution avoids a randomly dominant wait/turn action.
    const outputOffset = initial.input * initial.hidden + initial.hidden;
    for (let i = outputOffset; i < initial.weights.length; i++)
      initial.weights[i] =
        i < initial.weights.length - initial.output
          ? initial.weights[i] * 0.033333333333
          : 0;
    this.actor = this.variables(initial);
    this.critic = this.variables(
      createPolicy(observationSizeFor(map), 1, this.rng),
    );
    this.names = [...this.actor, ...this.critic].map((v) => v.name);
    this.optimizer = tf.train.adam(config.learningRate);
  }
  changeEnvironment(map: TrackMap) {
    if (this.phase !== "READY")
      throw Error("커리큘럼은 업데이트 경계에서만 전환합니다.");
    if (
      observationSizeFor(map) !== observationSizeFor(this.map) ||
      map.mode !== this.map.mode ||
      map.environmentVersion !== this.map.environmentVersion
    )
      throw Error("커리큘럼 환경 스키마가 다릅니다.");
    this.map = map;
    this.environment = new Simulator(map, this.config.horizon);
    this.environment.reset(this.config.seed + ++this.episodeSerial);
    this.environmentId = crypto.randomUUID();
    this.currentObservation = undefined;
    this.valueCache = undefined;
    this.displayState = this.environment.getState();
  }
  private variables(p: PolicyData) {
    let at = 0;
    return [
      [p.input, p.hidden],
      [p.hidden],
      [p.hidden, p.output],
      [p.output],
    ].map((shape) => {
      const count = shape.reduce((a, b) => a * b, 1);
      const t = tf.tensor(p.weights.slice(at, (at += count)), shape);
      const v = tf.variable(t);
      t.dispose();
      return v;
    });
  }
  private forward(x: tf.Tensor2D, vars: tf.Variable[]) {
    return x
      .matMul(vars[0] as tf.Tensor2D)
      .add(vars[1])
      .tanh()
      .matMul(vars[2] as tf.Tensor2D)
      .add(vars[3]) as tf.Tensor2D;
  }
  private policy(vars: tf.Variable[]): PolicyData {
    return {
      input: observationSizeFor(this.map),
      hidden: 24,
      output: vars[3].shape[0],
      weights: vars.flatMap((v) => Array.from(v.dataSync())),
    };
  }
  getPolicy() {
    return this.policy(this.actor);
  }
  private *iterate(): Generator<null, PPORunResult, void> {
    this.phase = "COLLECTING";
    this.collected = 0;
    const env = this.environment;
    const collectStarted = performance.now();
    let collectMs = 0,
      updateMs = 0;
    const obs: number[][] = [],
      acts: number[] = [],
      logs: number[] = [],
      values: number[] = [],
      nextValues: number[] = [],
      rewards: number[] = [],
      terms: boolean[] = [],
      bounds: boolean[] = [];
    let episodes = 0,
      successes = 0,
      collisions = 0,
      completion = 0,
      totalReward = 0,
      episodeLengths = 0;
    let state = env.getState();
    const policy = this.getPolicy(),
      critic = this.policy(this.critic);
    this.valueCache = undefined;
    const actionProbabilities = new Array(env.actionSize).fill(0);
    for (let i = 0; i < this.config.rollout; i++) {
      const sampleStarted = performance.now();
      const o = Array.from(this.currentObservation ?? env.observe()),
        prob = softmax(logits(policy, o)),
        a = sample(prob, this.rng),
        value = this.valueCache ?? logits(critic, o)[0],
        r = env.step(a);
      this.currentObservation = r.observation;
      obs.push(o);
      acts.push(a);
      logs.push(Math.log(Math.max(1e-8, prob[a])));
      values.push(value);
      rewards.push(r.reward);
      this.valueCache = r.terminated ? 0 : logits(critic, r.observation)[0];
      nextValues.push(this.valueCache);
      prob.forEach(
        (v, i) => (actionProbabilities[i] += v / this.config.rollout),
      );
      terms.push(r.terminated);
      bounds.push(r.terminated || r.truncated);
      state = env.getState(true, true);
      this.displayState = state;
      this.collected++;
      this.totalSamples++;
      this.lastTransition = {
        environmentId: this.environmentId,
        sample: this.totalSamples,
        action: a,
        reward: r.reward,
        logProbability: logs.at(-1)!,
        value,
        state,
      };
      collectMs += performance.now() - sampleStarted;
      yield null;
      if (r.terminated || r.truncated) {
        episodes++;
        successes += +state.success;
        collisions += +state.collision;
        totalReward += state.reward;
        episodeLengths += state.steps;
        if (state.success) completion += state.steps / 60;
        env.reset(this.config.seed + ++this.episodeSerial);
        this.valueCache = undefined;
        this.currentObservation = undefined;
      }
    }
    this.phase = "OPTIMIZING";
    yield null;
    const result = gae(
      rewards,
      values,
      nextValues,
      terms,
      bounds,
      this.config.gamma,
      this.config.lambda,
    );
    const mean = result.advantages.reduce((a, b) => a + b, 0) / obs.length,
      std = Math.sqrt(
        result.advantages.reduce((a, b) => a + (b - mean) ** 2, 0) /
          obs.length +
          1e-8,
      );
    const advantages = result.advantages.map((a) => (a - mean) / std);
    let policyLoss = 0,
      valueLoss = 0,
      entropy = 0,
      kl = 0,
      batches = 0,
      gradientNorm = 0,
      clipFraction = 0,
      earlyStopped = false;
    optimization: for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      const order = Array.from({ length: obs.length }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = this.rng.int(i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      for (let start = 0; start < obs.length; start += this.config.minibatch) {
        const ids = order.slice(start, start + this.config.minibatch);
        const updateStarted = performance.now();
        const losses = tf.tidy(() => {
          let measurements: number[] = [];
          const x = tf.tensor2d(ids.map((i) => obs[i])),
            a = tf.tensor1d(
              ids.map((i) => acts[i]),
              "int32",
            ),
            old = tf.tensor1d(ids.map((i) => logs[i])),
            adv = tf.tensor1d(ids.map((i) => advantages[i])),
            ret = tf.tensor1d(ids.map((i) => result.returns[i]));
          const calc = () => {
            const logAll = tf.logSoftmax(this.forward(x, this.actor)),
              p = logAll.exp(),
              logp = logAll
                .mul(tf.oneHot(a, this.map.mode === "racing" ? 5 : 6))
                .sum(1),
              ratio = logp.sub(old).exp();
            const pl = tf
              .minimum(
                ratio.mul(adv),
                ratio
                  .clipByValue(1 - this.config.clip, 1 + this.config.clip)
                  .mul(adv),
              )
              .mean()
              .neg();
            const vl = this.forward(x, this.critic)
              .reshape([-1])
              .sub(ret)
              .square()
              .mean();
            const ent = p.mul(logAll).sum(1).mean().neg();
            const kl = ratio.sub(1).sub(logp.sub(old)).mean();
            const clippedFraction = ratio
              .sub(1)
              .abs()
              .greater(this.config.clip)
              .cast("float32")
              .mean();
            return {
              pl,
              vl,
              ent,
              kl,
              clippedFraction,
              total: combinedPPOLoss(
                pl as tf.Scalar,
                vl as tf.Scalar,
                ent as tf.Scalar,
                this.config.entropy,
              ),
            };
          };
          const grads = tf.variableGrads(() => {
            const l = calc();
            measurements = Array.from(
              tf.stack([l.pl, l.vl, l.ent, l.kl, l.clippedFraction]).dataSync(),
            );
            return l.total as tf.Scalar;
          }, [...this.actor, ...this.critic]);
          const norm = tf.sqrt(
            tf.addN(Object.values(grads.grads).map((g) => g.square().sum())),
          );
          const scale = tf.minimum(1, tf.scalar(0.5).div(norm.add(1e-8)));
          const clipped: tf.NamedTensorMap = {};
          for (const [name, g] of Object.entries(grads.grads))
            clipped[name] = g.mul(scale);
          const gradNorm = norm.dataSync()[0];
          if (
            !Number.isFinite(gradNorm) ||
            !Number.isFinite(grads.value.dataSync()[0])
          )
            throw Error("PPO loss is not finite");
          this.optimizer.applyGradients(
            Object.entries(clipped).map(([name, tensor]) => ({ name, tensor })),
          );
          return [...measurements, gradNorm];
        });
        policyLoss += losses[0];
        valueLoss += losses[1];
        entropy += losses[2];
        kl += losses[3];
        clipFraction += losses[4];
        gradientNorm += losses[5];
        updateMs += performance.now() - updateStarted;
        batches++;
        yield null;
        if (losses[3] > 1.5 * (this.config.targetKL ?? 0.03)) {
          earlyStopped = true;
          break optimization;
        }
      }
    }
    this.updates++;
    this.phase = "READY";
    return {
      steps: obs.length,
      episodes,
      successes,
      collisions,
      completion,
      state,
      mean: episodes ? totalReward / episodes : state.reward,
      policyLoss: policyLoss / batches,
      valueLoss: valueLoss / batches,
      entropy: entropy / batches,
      kl: kl / batches,
      diagnostics: {
        advantageMean: mean,
        advantageStd: std,
        gradientNorm: gradientNorm / batches,
        clipFraction: clipFraction / batches,
        actionProbabilities,
        episodeLength: episodes ? episodeLengths / episodes : state.steps,
        policyChange: Math.sqrt(
          this.getPolicy().weights.reduce(
            (a, w, i) => a + (w - policy.weights[i]) ** 2,
            0,
          ),
        ),
        collectMs,
        updateMs,
        earlyStopped,
      },
    };
  }
  async checkpoint(): Promise<PPOCheckpoint> {
    if (this.phase !== "READY" || this.iterator)
      throw Error("PPO 체크포인트는 완료된 rollout 경계에서 저장하세요.");
    const weights = await this.optimizer.getWeights();
    const serialized = weights.map((w) => ({
      name: w.name,
      shape: w.tensor.shape,
      values: Array.from(w.tensor.dataSync()),
    }));
    for (const w of weights) if (w.name === "iter") w.tensor.dispose();
    return {
      actor: this.getPolicy(),
      critic: this.policy(this.critic),
      optimizer: serialized,
      rng: this.rng.state,
      updates: this.updates,
      environment: this.environment.checkpoint(),
      episodeSerial: this.episodeSerial,
      totalSamples: this.totalSamples,
    };
  }
  async restore(c: PPOCheckpoint) {
    for (const [vars, p] of [
      [this.actor, c.actor],
      [this.critic, c.critic],
    ] as const) {
      let at = 0;
      for (const v of vars) {
        const t = tf.tensor(p.weights.slice(at, (at += v.size)), v.shape);
        v.assign(t);
        t.dispose();
      }
    }
    // Adam slots are ordered by variable creation; remap names to this trainer's variables.
    const weights = c.optimizer.map((w, i) => ({
      name:
        i === 0
          ? w.name
          : this.names[(i - 1) % this.names.length] +
            (i <= this.names.length ? "/m" : "/v"),
      tensor: tf.tensor(
        w.values,
        w.shape,
        w.name === "iter" ? "int32" : "float32",
      ),
    }));
    await this.optimizer.setWeights(weights);
    weights.forEach((w) => w.tensor.dispose());
    this.rng.state = c.rng;
    this.updates = c.updates;
    this.episodeSerial = c.episodeSerial ?? c.updates;
    this.totalSamples = c.totalSamples ?? 0;
    if (c.environment) this.environment.restore(c.environment);
    else this.environment.reset(this.config.seed + c.updates);
    this.currentObservation = undefined;
    this.valueCache = undefined;
    this.displayState = this.environment.getState(true, true);
  }
  dispose() {
    this.actor.forEach((v) => v.dispose());
    this.critic.forEach((v) => v.dispose());
    this.optimizer.dispose();
  }
}
export async function initTensorflow() {
  await tf.setBackend("cpu");
  await tf.ready();
}
export const tensorMemory = () => tf.memory();
