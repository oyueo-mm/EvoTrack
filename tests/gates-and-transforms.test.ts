import { describe, it, expect } from "vitest";
import { Simulator } from "../src/core/environment";
import { EXAMPLE_MAPS, validateMap, segmentDistance } from "../src/core/maps";
import {
  circleObject,
  crossesGate,
  gateAt,
  gateEnds,
  objectWorld,
} from "../src/core/geometry";
import {
  copySelection,
  pasteSelection,
  smoothRoad,
  transformHandles,
  transformSelection,
  hitSelections,
} from "../src/core/editor";
import { DEFAULT_CONFIG, schemasFor } from "../src/core/types";
import { GeneticTrainer } from "../src/learning/ga";
import { createPolicy } from "../src/learning/network";
import { Random } from "../src/core/random";

describe("directed finite gates and continuous progress", () => {
  it("spatial road indexing preserves exact road boundary decisions", () => {
    const map = EXAMPLE_MAPS.find((m) => m.id === "r-s-curves")!,
      env = new Simulator(map);
    for (let x = 0; x < map.width; x += 31)
      for (let y = 0; y < map.height; y += 29) {
        const d = Math.min(
          ...map.road
            .slice(1)
            .map((b, i) => segmentDistance({ x, y }, map.road[i], b)),
        );
        expect(env.blocked(x, y, 0)).toBe(d > map.roadWidth / 2);
      }
  });
  it("uses finite swept intersections, not proximity, and rejects reverse crossing", () => {
    const gate = {
      ...gateAt(EXAMPLE_MAPS[0], 0),
      x: 50,
      y: 50,
      width: 20,
      angle: 0,
    };
    expect(crossesGate({ x: 0, y: 50 }, { x: 100, y: 50 }, gate)).toBe(true);
    expect(crossesGate({ x: 100, y: 50 }, { x: 0, y: 50 }, gate)).toBe(false);
    expect(crossesGate({ x: 49, y: 55 }, { x: 49, y: 45 }, gate)).toBe(false);
    expect(crossesGate({ x: 0, y: 61 }, { x: 100, y: 61 }, gate)).toBe(false);
    expect(
      crossesGate(
        { x: 100, y: 50 },
        { x: 0, y: 50 },
        { ...gate, directional: false },
      ),
    ).toBe(true);
    expect(gateEnds({ ...gate, angle: Math.PI / 2 })[0].y).toBeCloseTo(50);
  });
  it("ignores later gates until the earlier one and awards each only once", () => {
    const map = structuredClone(EXAMPLE_MAPS[0]);
    map.checkpoints = [
      { id: "first", x: 600, y: 320, width: 100, angle: 0 },
      { id: "earlier-position", x: 350, y: 320, width: 100, angle: 0 },
    ];
    const env = new Simulator(map, 600);
    while (!env.done) env.step(0);
    expect(env.getState().checkpoint).toBe(1);
    expect(env.getState().success).toBe(false);
    const reward = env.getState().reward;
    expect(env.step(0).reward).toBe(0);
    expect(env.getState().reward).toBe(reward);
    const fast = {
      ...map,
      checkpoints: [
        { id: "a", x: 110.04, y: 320, width: 100, angle: 0 },
        { id: "b", x: 110.02, y: 320, width: 100, angle: 0 },
      ],
    };
    const oneStep = new Simulator(fast);
    oneStep.step(0);
    expect(oneStep.getState().checkpoint).toBe(1);
  });
  it("keeps gates byte-for-byte independent when road points increase or smooth", () => {
    const invalid = structuredClone(EXAMPLE_MAPS[2]);
    invalid.checkpoints[1].order = 0;
    expect(() => validateMap(invalid)).toThrow("게이트");
    const map = EXAMPLE_MAPS[2],
      next = smoothRoad(map);
    expect(next.road.length).toBeGreaterThan(map.road.length);
    expect(next.checkpoints).toEqual(map.checkpoints);
    expect(
      { ...map, road: [...map.road, { x: 950, y: 270 }] }.checkpoints,
    ).toEqual(map.checkpoints);
  });
  it("learns progress without any gates and cannot jump to nearby distant road segments", () => {
    const map = structuredClone(EXAMPLE_MAPS[0]);
    map.checkpoints = [];
    expect(() => validateMap(map)).not.toThrow();
    const env = new Simulator(map, 600);
    while (!env.done) env.step(0);
    expect(env.getState().success).toBe(true);
    expect(env.getState().progress).toBeGreaterThan(0.95);
    const crossing = {
      ...map,
      road: [
        { x: 110, y: 320 },
        { x: 880, y: 320 },
        { x: 880, y: 340 },
        { x: 110, y: 340 },
      ],
      goal: { x: 110, y: 340 },
      start: { x: 110, y: 320, angle: 0 },
    };
    const e = new Simulator(crossing);
    let previous = 0;
    for (let i = 0; i < 100 && !e.done; i++) {
      e.step(0);
      const p = e.getState().progress;
      expect(p - previous).toBeLessThan(0.01);
      previous = p;
    }
    expect(previous).toBeLessThan(0.4);
  });
});
describe("shared OBB transform geometry", () => {
  const object = {
    id: "obb",
    kind: "wall" as const,
    x: 300,
    y: 250,
    w: 140,
    h: 20,
    angle: Math.PI / 4,
  };
  it("uses rotated geometry for collision, sensors, hit testing and resizing", () => {
    const map = { ...EXAMPLE_MAPS[0], objects: [object] };
    const inside = objectWorld(object, { x: 60, y: 0 }),
      outside = { x: 302, y: 252 };
    expect(circleObject(object, inside, 1)).toBe(true);
    expect(circleObject(object, outside, 1)).toBe(false);
    expect(new Simulator(map).blocked(inside.x, inside.y, 0)).toBe(true);
    expect(hitSelections(map, inside, 1)).toContainEqual({
      kind: "object",
      id: "obb",
    });
    expect(hitSelections(map, outside, 1)).not.toContainEqual({
      kind: "object",
      id: "obb",
    });
    const selection = { kind: "object" as const, id: "obb" };
    const resized = transformSelection(
      map,
      selection,
      "se",
      objectWorld(object, { x: 100, y: 35 }),
    );
    expect(resized.objects[0].w).toBeGreaterThan(object.w);
    expect(resized.objects[0].h).toBeGreaterThan(object.h);
    const rotated = transformSelection(
      map,
      selection,
      "rotate",
      { x: 450, y: 260 },
      true,
    );
    expect((rotated.objects[0].angle! / (Math.PI / 12)) % 1).toBeCloseTo(0);
    expect(transformHandles(map, selection)).toHaveLength(5);
  });
  it("changes actual gate collision geometry through width and rotation handles", () => {
    const map = EXAMPLE_MAPS[0],
      s = { kind: "checkpoint" as const, index: 0 };
    const next = transformSelection(map, s, "rotate", { x: 350, y: 400 });
    expect(next.checkpoints[0].angle).toBeCloseTo(Math.PI / 2);
    const resized = transformSelection(next, s, "gate-a", { x: 420, y: 320 });
    expect(resized.checkpoints[0].width).toBeCloseTo(140);
    const g = gateAt(resized, 0);
    expect(crossesGate({ x: 350, y: 300 }, { x: 350, y: 340 }, g)).toBe(true);
    expect(crossesGate({ x: 330, y: 320 }, { x: 370, y: 320 }, g)).toBe(false);
  });
  it("copies properties with new IDs, correct order, independent values and bounds", () => {
    const map = { ...EXAMPLE_MAPS[0], objects: [object] };
    const copied = copySelection(map, { kind: "object", id: "obb" })!;
    const pasted = pasteSelection(map, copied, 10000);
    expect(pasted.map.objects[1].id).not.toBe("obb");
    expect(pasted.map.objects[1].angle).toBe(object.angle);
    expect(pasted.map.objects[1].x + pasted.map.objects[1].w / 2).toBeLessThan(
      map.width,
    );
    expect(map.objects).toHaveLength(1);
    const cp = pasteSelection(
      map,
      copySelection(map, { kind: "checkpoint", index: 0 })!,
    );
    expect(cp.map.checkpoints.at(-1)?.id).not.toBe(map.checkpoints[0].id);
    expect(cp.map.checkpoints.at(-1)?.order).toBe(map.checkpoints.length);
  });
});
describe("synchronous GA population", () => {
  it.each([32, 64])(
    "advances %i independent live environments on one fixed clock",
    (population) => {
      const config = { ...DEFAULT_CONFIG, population, horizon: 30 };
      const ga = new GeneticTrainer(EXAMPLE_MAPS[0], config);
      const accelerate = createPolicy(12, 5, new Random(42));
      accelerate.weights.fill(0);
      accelerate.weights[accelerate.weights.length - 5] = 10;
      ga.population = Array.from({ length: population }, () =>
        structuredClone(accelerate),
      );
      ga.population[1].weights[accelerate.weights.length - 5] = 0;
      ga.population[1].weights[accelerate.weights.length - 4] = 10;
      ga.advance(10);
      expect(ga.environments).toHaveLength(population);
      const states = ga.states();
      expect(
        states.every(
          (s) =>
            s.sensors?.length === 7 && s.sensors.every((v) => v >= 0 && v <= 1),
        ),
      ).toBe(true);
      expect(states.every((s) => s.steps === 10)).toBe(true);
      expect(states[0].x).toBeGreaterThan(EXAMPLE_MAPS[0].start.x);
      expect(states[0].y).not.toBe(states[1].y);
      expect(() => ga.checkpoint()).toThrow("boundary");
      const completed = ga.advance(20);
      expect(completed?.episodes).toBe(population);
      expect(ga.generation).toBe(1);
      const restored = new GeneticTrainer(EXAMPLE_MAPS[0], config);
      const legacy = JSON.parse(JSON.stringify(ga.checkpoint()));
      delete legacy.boundary;
      restored.restore(legacy);
      expect(restored.run()).toEqual(ga.run());
      ga.advance();
      expect(ga.tick).toBe(1);
      expect(ga.generation).toBe(2);
    },
  );
  it("keeps old maps on environment v1 unless an explicit copy upgrades them", () => {
    const map = structuredClone(EXAMPLE_MAPS[0]);
    delete map.environmentVersion;
    map.checkpoints = map.checkpoints.map(({ x, y }) => ({ x, y }));
    const serialized = JSON.stringify(map);
    expect(schemasFor(map).environment).toBe(1);
    validateMap(map);
    const env = new Simulator(map);
    while (!env.done) env.step(0);
    expect(env.getState().success).toBe(true);
    expect(JSON.stringify(map)).toBe(serialized);
  });
});
