import { describe, it, expect } from "vitest";
import * as tf from "@tensorflow/tfjs";
import {
  combinedPPOLoss,
  PPOTrainer,
  initTensorflow,
  gae,
} from "../src/learning/ppo";
import { EXAMPLE_MAPS } from "../src/core/maps";
import { DEFAULT_CONFIG } from "../src/core/types";
describe("PPO v0.5 regressions", () => {
  it("applies value MSE coefficient exactly once and gives the expected analytical gradient", () => {
    tf.tidy(() => {
      const grad = tf.grad((x) =>
        combinedPPOLoss(
          tf.scalar(1),
          x.sub(2).square() as tf.Scalar,
          tf.scalar(0.5),
          0.01,
        ),
      );
      expect(grad(tf.scalar(5)).dataSync()[0]).toBeCloseTo(3);
      expect(
        combinedPPOLoss(
          tf.scalar(1),
          tf.scalar(9),
          tf.scalar(0.5),
          0.01,
        ).dataSync()[0],
      ).toBeCloseTo(5.495);
    });
  });

  it("continues one episode beyond a rollout boundary instead of resetting its progress", async () => {
    await initTensorflow();
    const map = structuredClone(EXAMPLE_MAPS[4]);
    map.objects = [
      { id: "floor", kind: "platform", x: 0, y: 550, w: 5000, h: 40 },
    ];
    map.width = 5000;
    map.goal.x = 4900;
    const p = new PPOTrainer(map, {
      ...DEFAULT_CONFIG,
      rollout: 16,
      minibatch: 8,
      epochs: 1,
      horizon: 600,
    });
    p.run();
    expect(p.environment.getState(false).steps).toBe(16);
    p.run();
    expect(p.environment.getState(false).steps).toBe(32);
    expect(p.totalSamples).toBe(32);
    p.dispose();
  });
  it("cuts GAE at a time limit while bootstrapping its terminal observation, never next episode value", () => {
    expect(
      gae(
        [1, 2, 3],
        [0.5, 0.5, 0.5],
        [0.5, 7, 9],
        [false, false, true],
        [false, true, true],
        1,
        1,
      ).advantages,
    ).toEqual([9.5, 8.5, 2.5]);
  });
});
