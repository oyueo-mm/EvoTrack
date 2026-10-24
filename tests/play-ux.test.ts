import { describe, it, expect } from "vitest";
import { EXAMPLE_MAPS, validateMap } from "../src/core/maps";
import { Simulator } from "../src/core/environment";
import { schemasFor } from "../src/core/types";
import { assertCompatible } from "../src/learning/evaluate";
import { transformSelection } from "../src/core/editor";
import { GeneticTrainer } from "../src/learning/ga";
import { DEFAULT_CONFIG } from "../src/core/types";
describe("manual test controls and extended physics", () => {
  it("steers at rest without accelerating; forward, reverse and boost are independent", () => {
    const map = EXAMPLE_MAPS[0],
      turn = new Simulator(map);
    for (let i = 0; i < 30; i++) turn.stepManual({ steer: 1, throttle: 0 });
    expect(turn.getState().angle).not.toBe(0);
    expect(turn.getState().speed).toBe(0);
    expect(turn.getState().x).toBe(map.start.x);
    const normal = new Simulator(map),
      boost = new Simulator(map),
      reverse = new Simulator(map);
    for (let i = 0; i < 30; i++) {
      normal.stepManual({ steer: 0, throttle: 1 });
      boost.stepManual({ steer: 0, throttle: 1, boost: true });
      reverse.stepManual({ steer: 0, throttle: -1 });
    }
    expect(boost.getState().speed).toBeGreaterThan(normal.getState().speed);
    expect(reverse.getState().speed).toBeLessThan(0);
    expect(reverse.getState().x).toBeLessThan(map.start.x);
  });
  it("spring applies configured launch while elastic reflects incoming normal speed", () => {
    const base = {
      ...structuredClone(EXAMPLE_MAPS[4]),
      environmentVersion: 3 as const,
      start: { x: 150, y: 240, angle: 0 },
      objects: [],
    };
    const launch = (strength: number, kind: "spring" | "elastic") => {
      const env = new Simulator({
        ...base,
        objects: [
          {
            id: "pad",
            kind,
            x: 90,
            y: 400,
            w: 160,
            h: 20,
            launchStrength: kind === "spring" ? strength : undefined,
            restitution: kind === "elastic" ? strength : undefined,
          },
        ],
      });
      for (let i = 0; i < 120; i++) {
        env.stepManual({ steer: 0, throttle: 0 });
        if (env.getState().vy < -1) return env.getState().vy;
      }
      return 0;
    };
    expect(launch(600, "spring")).toBeLessThan(launch(300, "spring") - 200);
    expect(launch(1.2, "elastic")).toBeLessThan(launch(0.5, "elastic") - 100);
    expect(launch(0, "elastic")).toBe(0);
  });
  it("bomb terminates the episode, markers only restore manual retries", () => {
    const map = {
      ...structuredClone(EXAMPLE_MAPS[0]),
      environmentVersion: 3 as const,
      objects: [
        {
          id: "marker",
          kind: "respawn" as const,
          x: 145,
          y: 300,
          w: 40,
          h: 40,
        },
        { id: "bomb", kind: "bomb" as const, x: 240, y: 305, w: 30, h: 30 },
      ],
    };
    const e = new Simulator(map);
    while (!e.done) e.stepManual({ steer: 0, throttle: 1 });
    expect(e.getState().failureReason).toBe("bomb");
    e.respawn();
    expect(e.done).toBe(false);
    expect(e.getState().x).toBe(165);
    expect(e.getState().respawns).toBe(1);
    expect(e.getState().checkpoint).toBe(0);
  });
  it("preserves older maps and rejects silently applying v2 models to v3", () => {
    const old = EXAMPLE_MAPS[4],
      extended = { ...structuredClone(old), environmentVersion: 3 as const };
    expect(validateMap(old)).toEqual(old);
    expect(schemasFor(extended).environment).toBe(3);
    expect(() =>
      assertCompatible(
        { mode: "bounce", schemas: schemasFor(old) } as any,
        extended,
      ),
    ).toThrow("환경");
    const invalid = {
      ...old,
      objects: [
        ...old.objects,
        { id: "bomb", kind: "bomb", x: 700, y: 300, w: 30, h: 30 },
      ],
    };
    expect(() => validateMap(invalid)).toThrow();
    expect(() => validateMap({ ...extended, checkpoints: [] })).not.toThrow();
    expect(() =>
      validateMap({ ...EXAMPLE_MAPS[0], checkpoints: [] }),
    ).not.toThrow();
  });
  it("uses 90 degree snapping for rotated objects", () => {
    const map = {
      ...EXAMPLE_MAPS[0],
      objects: [
        { id: "box", kind: "wall" as const, x: 300, y: 200, w: 40, h: 100 },
      ],
    };
    const transformed = transformSelection(
      map,
      { kind: "object", id: "box" },
      "rotate",
      { x: 400, y: 220 },
      true,
    );
    expect((transformed.objects[0].angle! / (Math.PI / 2)) % 1).toBeCloseTo(0);
  });
  it("Bounce jump, fast fall and air brake use independent manual inputs", () => {
    const e = new Simulator(EXAMPLE_MAPS[4]);
    for (let i = 0; i < 90 && !e.getState().grounded; i++)
      e.stepManual({ steer: 0, throttle: 0 });
    expect(e.getState().grounded).toBe(true);
    e.stepManual({ steer: 1, throttle: 0, jump: true });
    expect(e.getState().vy).toBeLessThan(-300);
    const before = e.getState();
    e.stepManual({ steer: 0, throttle: 0, brake: true, drop: true });
    expect(e.getState().vy).toBeGreaterThan(before.vy + 30);
    expect(Math.abs(e.getState().vx)).toBeLessThan(Math.abs(before.vx));
  });
  it("zero-gate v3 Racing can train and checkpoint without changing the source map", () => {
    const map = validateMap({
      ...structuredClone(EXAMPLE_MAPS[0]),
      environmentVersion: 3,
      checkpoints: [],
    });
    const original = JSON.stringify(map);
    const ga = new GeneticTrainer(map, {
      ...DEFAULT_CONFIG,
      population: 4,
      horizon: 30,
    });
    const stats = ga.run();
    expect(stats.scores).toHaveLength(4);
    expect(stats.scores.every(Number.isFinite)).toBe(true);
    expect(JSON.stringify(map)).toBe(original);
    expect(ga.checkpoint()).toBeDefined();
  });
});
