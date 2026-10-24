import { describe, it, expect } from "vitest";
import { Simulator } from "../src/core/environment";
import { EXAMPLE_MAPS, validateMap, newMap } from "../src/core/maps";
import { DEFAULT_CONFIG, schemasFor, type MapObject } from "../src/core/types";
import { GeneticTrainer } from "../src/learning/ga";
import { PPOTrainer, initTensorflow } from "../src/learning/ppo";
const racing = (objects: MapObject[] = []) => ({
  ...structuredClone(EXAMPLE_MAPS[0]),
  environmentVersion: 4 as const,
  objects,
  checkpoints: [],
});
const zone = (extra: Partial<MapObject> = {}): MapObject => ({
  id: "reward",
  kind: "reward",
  x: 80,
  y: 260,
  w: 100,
  h: 120,
  rewardValue: 2,
  ...extra,
});
describe("environment v4 elements", () => {
  it("adds elastic lift with bounded launch speed and preserves v3 rebound", () => {
    const bounce = (version: 3 | 4, max = 900) => {
      const m = {
        ...structuredClone(EXAMPLE_MAPS[4]),
        environmentVersion: version,
        start: { x: 150, y: 386, angle: 0 },
        objects: [
          {
            id: "pad",
            kind: "elastic" as const,
            x: 90,
            y: 400,
            w: 160,
            h: 20,
            ...(version === 4
              ? { liftBoost: 1000, minLaunchSpeed: 260, maxLaunchSpeed: max }
              : {}),
          },
        ],
      };
      const e = new Simulator(m);
      for (let i = 0; i < 60; i++) {
        e.step(0);
        if (e.getState().vy < 0) return e.getState().vy;
      }
      return 0;
    };
    expect(bounce(4, 450)).toBeLessThan(-430);
    expect(bounce(4, 450)).toBeGreaterThanOrEqual(-450);
    expect(bounce(3)).toBeGreaterThan(-150);
  });
  it("zero elastic assistance remains a standable surface and permits manual jumping", () => {
    const map = {
      ...structuredClone(EXAMPLE_MAPS[4]),
      environmentVersion: 4 as const,
      start: { x: 150, y: 386, angle: 0 },
      objects: [
        {
          id: "zero",
          kind: "elastic" as const,
          x: 90,
          y: 400,
          w: 160,
          h: 20,
          bounceCoefficient: 0,
          liftBoost: 0,
          minLaunchSpeed: 0,
          maxLaunchSpeed: 0,
        },
      ],
    };
    const e = new Simulator(map);
    for (let i = 0; i < 30; i++) e.step(0);
    expect(e.getState().grounded).toBe(true);
    e.stepManual({ steer: 0, throttle: 0, jump: true });
    expect(e.getState().vy).toBeLessThan(-300);
  });
  it("boost/brake follow current velocity and remain non-solid", () => {
    const run = (type?: "boost" | "brake", reverse = false) => {
      const e = new Simulator(
        racing(
          type
            ? [
                {
                  id: "belt",
                  kind: "belt",
                  x: 30,
                  y: 260,
                  w: 850,
                  h: 120,
                  beltType: type,
                  beltStrength: 300,
                  maxInfluenceSpeed: 480,
                },
              ]
            : [],
        ),
      );
      expect(e.blocked(150, 320)).toBe(false);
      for (let i = 0; i < 30; i++)
        e.stepManual({ steer: 0, throttle: reverse ? -1 : 1 });
      return e.getState();
    };
    expect(run("boost").speed).toBeGreaterThan(run().speed + 100);
    expect(run("brake").speed).toBeLessThan(run().speed);
    expect(run("boost", true).speed).toBeLessThan(0);
    expect(run("boost", true).x).toBeLessThan(EXAMPLE_MAPS[0].start.x);
  });
  it("supports belt orientation fallback and force caps", () => {
    const base = {
      ...structuredClone(EXAMPLE_MAPS[4]),
      environmentVersion: 4 as const,
      start: { x: 150, y: 150, angle: 0 },
      physics: { maxSpeed: 180, gravity: 0 },
      objects: [
        {
          id: "belt",
          kind: "belt" as const,
          x: 50,
          y: 50,
          w: 600,
          h: 600,
          beltDirection: "beltOrientation" as const,
          angle: -Math.PI / 2,
          beltStrength: 600,
          maxInfluenceSpeed: 30,
        },
      ],
    };
    const e = new Simulator(base);
    e.step(0);
    expect(e.getState().vy).toBeLessThan(0);
    for (let i = 0; i < 20; i++) e.step(0);
    expect(e.getState().speed).toBeLessThanOrEqual(30.001);
  });
  it("once triggers cannot farm by waiting and reset at episode boundaries", () => {
    const e = new Simulator(racing([zone()]));
    for (let i = 0; i < 30; i++) e.step(4);
    expect(e.getState().shapingTotal).toBe(2);
    e.reset(42);
    e.step(4);
    expect(e.getState().shapingTotal).toBe(2);
  });
  it("repeat entry requires leaving; cooldown uses simulated time; stay is per second", () => {
    const repeated = new Simulator(racing([zone({ activation: "repeat" })]));
    for (let i = 0; i < 70; i++) repeated.stepManual({ steer: 0, throttle: 1 });
    for (let i = 0; i < 200 && (repeated.getState().shapingTotal ?? 0) < 4; i++)
      repeated.stepManual({ steer: 0, throttle: -1 });
    expect(repeated.getState().shapingTotal).toBe(4);
    const timed = new Simulator(
      racing([zone({ activation: "cooldown", trigger: "stay", cooldown: 1 })]),
    );
    for (let i = 0; i < 60; i++) timed.step(4);
    expect(timed.getState().shapingTotal).toBe(2);
    timed.step(4);
    expect(timed.getState().shapingTotal).toBe(4);
    const stay = new Simulator(
      racing([zone({ activation: "repeat", trigger: "stay", rewardValue: 3 })]),
    );
    for (let i = 0; i < 60; i++) stay.step(4);
    expect(stay.getState().shapingTotal).toBeCloseTo(3);
  });
  it("gate crosses, negative penalties, mode filters and training-only flags are real rewards", () => {
    const gate = new Simulator(
      racing([
        zone({
          x: 175,
          w: 10,
          rewardShape: "gate",
          trigger: "cross",
          rewardValue: 3,
        }),
      ]),
    );
    for (let i = 0; i < 80; i++) gate.step(0);
    expect(gate.getState().shapingTotal).toBe(3);
    const negative = new Simulator(racing([zone({ rewardValue: -2 })]));
    negative.step(4);
    expect(negative.getState().shapingTotal).toBe(-2);
    const trainOnly = new Simulator(racing([zone({ trainingOnly: true })]));
    trainOnly.stepManual({ steer: 0, throttle: 0 });
    expect(trainOnly.getState().shapingTotal).toBe(0);
    trainOnly.step(4);
    expect(trainOnly.getState().shapingTotal).toBe(2);
    const filtered = new Simulator(racing([zone({ rewardMode: "bounce" })]));
    filtered.step(4);
    expect(filtered.getState().shapingTotal).toBe(0);
  });
  it("GA fitness and PPO rollout include shaping from the same environment", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      population: 4,
      horizon: 30,
      rollout: 16,
      epochs: 1,
      minibatch: 8,
    };
    const baseline = new GeneticTrainer(racing(), config),
      shaped = new GeneticTrainer(
        racing([zone({ w: 850, rewardValue: 5 })]),
        config,
      );
    const a = baseline.run(),
      b = shaped.run();
    b.scores.forEach((score, i) => expect(score - a.scores[i]).toBeCloseTo(5));
    await initTensorflow();
    const ppo = new PPOTrainer(racing([zone({ rewardValue: 5 })]), config);
    ppo.advance();
    expect(ppo.lastTransition!.reward).toBeGreaterThan(4.9);
    expect(ppo.lastTransition!.state.shapingTotal).toBe(5);
    ppo.dispose();
  });
  it("round-trips new properties, rejects incompatible versions and malformed ranges", () => {
    const map = racing([
      zone({
        activation: "cooldown",
        cooldown: 2,
        visible: false,
        description: "penalty",
      }),
      {
        id: "belt",
        kind: "belt",
        x: 300,
        y: 300,
        w: 160,
        h: 50,
        beltType: "brake",
        beltStrength: 300,
      },
    ]);
    expect(validateMap(JSON.parse(JSON.stringify(map)))).toEqual(map);
    expect(schemasFor(newMap("bounce")).environment).toBe(4);
    expect(() => validateMap({ ...map, environmentVersion: 3 })).toThrow();
    expect(() =>
      validateMap(racing([zone({ rewardValue: Infinity })])),
    ).toThrow();
    expect(() => validateMap(racing([zone({ cooldown: 0 })]))).toThrow();
  });
});
