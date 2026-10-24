import { describe, it, expect } from "vitest";
import { magneticAngle } from "../src/core/angle-snap";
import { PPOTrainer, initTensorflow, tensorMemory } from "../src/learning/ppo";
import { EXAMPLE_MAPS } from "../src/core/maps";
import { DEFAULT_CONFIG } from "../src/core/types";
import { validateConfig } from "../src/storage";
const rad = (n: number) => (n * Math.PI) / 180;
describe("magnetic rotation", () => {
  it.each([
    [83, 90],
    [87, 90],
    [95, 90],
    [100, 100],
    [110, 110],
    [174, 180],
    [268, 270],
    [356, 0],
  ])("%s degrees -> %s", (a, b) =>
    expect((magneticAngle(rad(a)).angle * 180) / Math.PI).toBeCloseTo(b),
  );
  it("releases after ten degrees; Alt and direct values can bypass snapping", () => {
    expect(magneticAngle(rad(99), true, rad(90)).angle).toBeCloseTo(rad(90));
    expect(magneticAngle(rad(101), true, rad(90)).snapped).toBe(false);
    expect(magneticAngle(rad(87), false).angle).toBeCloseTo(rad(87));
  });
});
describe("observable PPO", () => {
  it("loads old numeric configs and validates optional observation/fast modes", () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
    expect(
      validateConfig({ ...DEFAULT_CONFIG, trainingMode: "fast" }).trainingMode,
    ).toBe("fast");
    expect(() =>
      validateConfig({ ...DEFAULT_CONFIG, trainingMode: "invalid" as any }),
    ).toThrow();
  });
  it("records the same Simulator transition, stops collecting while optimizing, and changes weights", async () => {
    await initTensorflow();
    const base = tensorMemory().numTensors;
    const p = new PPOTrainer(EXAMPLE_MAPS[0], {
      ...DEFAULT_CONFIG,
      rollout: 32,
      epochs: 2,
      minibatch: 16,
      horizon: 12,
    });
    const before = p.getPolicy().weights;
    for (let i = 0; i < 32; i++) {
      expect(p.advance()).toBeNull();
      expect(p.collected).toBe(i + 1);
      expect(p.displayState).toEqual(p.lastTransition!.state);
      expect(p.lastTransition!.environmentId).toBe(p.environmentId);
      expect(p.displayState).toEqual(p.environment.getState(true, true));
    }
    p.advance();
    expect(p.phase).toBe("OPTIMIZING");
    const frozen = p.displayState;
    await expect(p.checkpoint()).rejects.toThrow("rollout");
    let result;
    while (!(result = p.advance())) {
      expect(p.totalSamples).toBe(32);
      expect(p.displayState).toEqual(frozen);
    }
    expect(p.updates).toBe(1);
    expect(p.phase).toBe("READY");
    expect(p.getPolicy().weights).not.toEqual(before);
    const cp = await p.checkpoint();
    expect(cp.updates).toBe(1);
    p.dispose();
    expect(tensorMemory().numTensors).toBeLessThanOrEqual(base + 1);
  });
});
