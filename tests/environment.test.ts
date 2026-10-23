import { describe, it, expect } from "vitest";
import { Simulator } from "../src/core/environment";
import { EXAMPLE_MAPS, validateMap } from "../src/core/maps";
import { Random } from "../src/core/random";
describe("phase 1: shared contract", () => {
  it("seeded random is reproducible", () => {
    const a = new Random(11),
      b = new Random(11);
    expect(Array.from({ length: 100 }, () => a.next())).toEqual(
      Array.from({ length: 100 }, () => b.next()),
    );
  });
  it("validates all built-in maps and rejects corrupted schemas", () => {
    EXAMPLE_MAPS.forEach((m) => expect(validateMap(m)).toEqual(m));
    expect(() => validateMap({ version: 2 })).toThrow();
    expect(() =>
      validateMap({ ...EXAMPLE_MAPS[0], start: { x: NaN, y: 0 } }),
    ).toThrow();
  });
});
describe("phase 2: racing", () => {
  it("completes checkpoints in order and never rewards a finished episode again", () => {
    const env = new Simulator(EXAMPLE_MAPS[0]);
    let result;
    for (let i = 0; i < 600; i++) {
      result = env.step(0);
      if (result.terminated) break;
    }
    expect(env.getState().success).toBe(true);
    expect(env.getState().checkpoint).toBe(3);
    expect(env.step(0).reward).toBe(0);
    expect(env.getState().speed).toBeLessThanOrEqual(210);
  });
  it("collides with road boundaries without tunneling", () => {
    const m = structuredClone(EXAMPLE_MAPS[0]);
    m.start.angle = Math.PI / 2;
    const e = new Simulator(m);
    for (let i = 0; i < 100 && !e.getState().done; i++) e.step(0);
    expect(e.getState().collision).toBe(true);
    expect(e.getState().y).toBeLessThanOrEqual(371);
  });
  it("cannot skip checkpoints", () => {
    const m = structuredClone(EXAMPLE_MAPS[0]);
    m.checkpoints = [
      { x: 500, y: 320 },
      { x: 350, y: 320 },
      { x: 880, y: 320 },
    ];
    const e = new Simulator(m);
    for (let i = 0; i < 600 && !e.getState().done; i++) e.step(0);
    expect(e.getState().success).toBe(false);
    expect(e.getState().checkpoint).toBe(1);
  });
});
describe("phase 3: bounce", () => {
  it("gravity, ground contact, jump and airborne jump restriction", () => {
    const e = new Simulator(EXAMPLE_MAPS[4]);
    for (let i = 0; i < 30; i++) e.step(0);
    expect(e.getState().grounded).toBe(true);
    expect(e.getState().y).toBeCloseTo(539);
    e.step(3);
    const vy = e.getState().vy;
    expect(vy).toBeLessThan(0);
    e.step(3);
    expect(e.getState().vy).toBeGreaterThan(vy);
  });
  it("walls stop horizontal motion and enforce speed bounds", () => {
    const e = new Simulator(EXAMPLE_MAPS[4]);
    for (let i = 0; i < 200; i++) e.step(2);
    expect(e.getState().x).toBeLessThanOrEqual(339);
    expect(e.getState().vx).toBeLessThanOrEqual(180);
  });
  it("seed and actions reproduce moving platforms", () => {
    const a = new Simulator(EXAMPLE_MAPS[7]),
      b = new Simulator(EXAMPLE_MAPS[7]);
    a.reset(7);
    b.reset(7);
    for (let i = 0; i < 300; i++) {
      a.step(i % 6);
      b.step(i % 6);
    }
    expect(a.getState()).toEqual(b.getState());
  });
});
