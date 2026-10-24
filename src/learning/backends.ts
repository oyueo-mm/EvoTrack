import * as tf from "@tensorflow/tfjs";
import { PPOTrainer } from "./ppo";
import type { Config, TrackMap } from "../core/types";
/** Explicit QA task: sequential, isolated single-agent runs, never on an active training session. */
export async function benchmarkBackends(map: TrackMap, config: Config) {
  const results: Record<string, unknown> = {};
  for (const name of ["cpu", "webgl", "webgpu"]) {
    let trainer: PPOTrainer | undefined;
    try {
      if (!tf.findBackendFactory(name)) throw Error("backend not registered");
      if (!(await tf.setBackend(name)))
        throw Error("backend unavailable in Worker");
      await tf.ready();
      trainer = new PPOTrainer(map, {
        ...config,
        rollout: 128,
        epochs: 2,
        minibatch: 64,
      });
      trainer.run(); // warm kernels and Adam slots
      const start = performance.now();
      let collectMs = 0,
        updateMs = 0;
      for (let i = 0; i < 5; i++) {
        const r = trainer.run();
        collectMs += r.diagnostics.collectMs;
        updateMs += r.diagnostics.updateMs;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const elapsedMs = performance.now() - start;
      results[name] = {
        backend: tf.getBackend(),
        samples: 5 * 128,
        elapsedMs,
        transitionsPerSecond: (5 * 128) / (elapsedMs / 1000),
        collectMs,
        updateMs,
        updateMeanMs: updateMs / 5,
        memory: tf.memory(),
        policyFinite: trainer.getPolicy().weights.every(Number.isFinite),
      };
    } catch (e) {
      results[name] = { supported: false, reason: String(e) };
    } finally {
      trainer?.dispose();
    }
  }
  await tf.setBackend("cpu");
  await tf.ready();
  return results;
}
/** Runs inside the training Worker before training. CPU is the measured default for this small net. */
export async function backendCapabilities() {
  const support: Record<string, string> = {};
  for (const name of ["cpu", "webgl", "webgpu"]) {
    if (!tf.findBackendFactory(name)) {
      support[name] = "not registered in this build";
      continue;
    }
    try {
      if (!(await tf.setBackend(name)))
        throw Error("initialization unavailable");
      await tf.ready();
      const start = performance.now();
      const result = tf.tidy(() =>
        tf
          .ones([32, 24])
          .matMul(tf.ones([24, 6]))
          .sum(),
      );
      await result.data();
      result.dispose();
      support[name] =
        `available; kernel ${(performance.now() - start).toFixed(2)} ms`;
    } catch (e) {
      support[name] = `unsupported in Worker: ${String(e).slice(0, 160)}`;
    }
  }
  await tf.setBackend("cpu");
  await tf.ready();
  return { backend: tf.getBackend(), support };
}
