import { describe, it, expect } from "vitest";
import { Simulator, objectPosition } from "../src/core/environment";
import { movingPose } from "../src/core/bounce-v5";
import { V05_MAPS } from "../src/core/v05-maps";
import { newMap, validateMap } from "../src/core/maps";
import { schemasFor, DEFAULT_CONFIG } from "../src/core/types";
import { PPOTrainer, initTensorflow } from "../src/learning/ppo";
import { GeneticTrainer } from "../src/learning/ga";
function fixture(kind: "moving" | "crumble" = "moving") {
  const m = structuredClone(V05_MAPS.find((m) => m.id === "b-v5-flat")!);
  m.objects = [
    {
      id: "test",
      kind,
      x: 100,
      y: 400,
      w: 300,
      h: 24,
      amplitude: 60,
      period: 2,
      moveAxis: "vertical",
      phase: Math.PI / 2,
      collapseDelay: 0.4,
    },
  ];
  m.start = { x: 200, y: 449, angle: 0 };
  return m;
}
describe("v5 platforms", () => {
  it("prevents fast-platform tunneling and treats ceiling crush as a collision", () => {
    const fast = fixture();
    fast.objects[0].amplitude = 120;
    fast.objects[0].period = 0.5;
    fast.start.y = 509;
    const e = new Simulator(fast, 600);
    for (let i = 0; i < 90; i++) {
      e.step(0);
      expect(e.getState().collision).toBe(false);
      if (e.getState().grounded)
        expect(e.getState().y + 11).toBeCloseTo(
          objectPosition(fast.objects[0], e.getState().steps / 60).y,
          3,
        );
    }
    const crush = fixture();
    crush.objects.push({
      id: "ceiling",
      kind: "wall",
      x: 100,
      y: 300,
      w: 300,
      h: 50,
    });
    const c = new Simulator(crush, 600);
    for (let i = 0; i < 150 && !c.done; i++) c.step(0);
    expect(c.getState().collision).toBe(true);
    expect(c.getState().failureReason).toBe("collision");
  });
  it("keeps default horizontal motion identical and computes analytic velocity deterministically", () => {
    const m = fixture(),
      o = { ...m.objects[0], moveAxis: undefined, phase: undefined };
    for (const time of [0, 0.5, 1, 2]) {
      expect(objectPosition(o, time, 42).x).toBe(
        o.x +
          Math.sin((time * 2 * Math.PI) / (o.period ?? 3) + (42 % 17) / 17) *
            (o.amplitude ?? 50),
      );
      expect(objectPosition(o, time).y).toBe(o.y);
    }
    const p = movingPose(m.objects[0], 0.7);
    expect(p).toEqual(movingPose(m.objects[0], 0.7));
    expect((movingPose(m.objects[0], 0.700001).y - p.y) / 0.000001).toBeCloseTo(
      p.vy,
      2,
    );
  });
  it("carries a rider up and down, permits jumping, then applies gravity", () => {
    const m = fixture(),
      e = new Simulator(m, 600);
    e.reset(42);
    let grounded = 0;
    for (let i = 0; i < 150; i++) {
      e.step(0);
      const s = e.getState(false),
        o = objectPosition(m.objects[0], s.steps / 60, 42);
      if (s.grounded) {
        grounded++;
        expect(s.y + 11).toBeCloseTo(o.y, 4);
      }
      expect(s.collision).toBe(false);
    }
    expect(grounded).toBeGreaterThan(130);
    e.step(3);
    expect(e.getState().grounded).toBe(false);
    const vy = e.getState().vy;
    for (let i = 0; i < 8; i++) e.step(0);
    expect(e.getState().vy).toBeGreaterThan(vy);
  });
  it("collapses only after landing plus its delay, removes collisions, resets and optionally restores", () => {
    const m = fixture("crumble");
    m.start.y = 389;
    const a = new Simulator(m, 600),
      b = new Simulator(m, 600);
    const json = JSON.stringify(m);
    a.step(0);
    expect(a.getState().platforms?.test.triggeredAt).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 22; i++) a.step(0);
    expect(a.getState().platforms?.test.collapsedAt).toBeUndefined();
    for (let i = 0; i < 15; i++) a.step(0);
    expect(a.getState().platforms?.test.collapsedAt).toBeDefined();
    expect(a.getState().y).toBeGreaterThan(389);
    expect(b.getState().platforms).toEqual({});
    expect(JSON.stringify(m)).toBe(json);
    a.reset(42);
    expect(a.getState().platforms).toEqual({});
    m.objects[0].regenerate = true;
    m.objects[0].restoreDelay = 0.2;
    const c = new Simulator(m, 1000);
    c.step(0);
    for (let i = 0; i < 45; i++) c.step(0);
    expect(c.getState().platforms?.test?.collapsedAt).toBeUndefined();
  });
  it("rejects v5 elements on legacy schemas, validates properties and keeps new maps v5", () => {
    const m = fixture("crumble");
    m.start.y = 380;
    expect(validateMap(m)).toEqual(m);
    expect(() => validateMap({ ...m, environmentVersion: 4 })).toThrow();
    m.objects[0].collapseDelay = -1;
    expect(() => validateMap(m)).toThrow();
    expect(schemasFor(newMap("bounce"))).toEqual({
      environment: 5,
      observation: 2,
      action: 1,
    });
    expect(new Simulator(newMap("bounce")).observe()).toHaveLength(18);
  });
  it("keeps GA dynamic state independent and restores v5 PPO state and Adam exactly", async () => {
    await initTensorflow();
    const m = fixture("crumble");
    m.start.y = 389;
    const config = {
      ...DEFAULT_CONFIG,
      rollout: 32,
      minibatch: 16,
      epochs: 1,
      horizon: 600,
      population: 4,
    };
    const ga = new GeneticTrainer(m, config);
    ga.beginGeneration();
    ga.environments[0].step(0);
    expect(ga.environments[0].getState().platforms?.test).toBeDefined();
    expect(ga.environments[1].getState().platforms).toEqual({});
    const a = new PPOTrainer(m, config);
    a.run();
    const cp = await a.checkpoint(),
      b = new PPOTrainer(m, config);
    await b.restore(cp);
    expect(b.environment.getState()).toEqual(a.environment.getState());
    a.run();
    b.run();
    a.getPolicy().weights.forEach((v, i) =>
      expect(v).toBeCloseTo(b.getPolicy().weights[i], 6),
    );
    a.dispose();
    b.dispose();
  });
});
