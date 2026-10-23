import { describe, it, expect } from "vitest";
import { EXAMPLE_MAPS, validateMap } from "../src/core/maps";
import {
  anchorViewport,
  eraseAt,
  FIT_VIEW,
  hitSelection,
  moveSelection,
  removeSelection,
  worldPoint,
  zoomAt,
} from "../src/core/editor";
import { DEFAULT_CONFIG } from "../src/core/types";
import { validateConfig } from "../src/storage";
describe("editor geometry and camera", () => {
  it("rejects malformed imported draft metadata before rendering", () => {
    for (const draft of [
      { roadBreaks: 5 },
      { roadBreaks: { length: 0 } },
      { missingStart: "false" },
      { roadBreaks: [99] },
    ])
      expect(() => validateMap({ ...EXAMPLE_MAPS[0], draft })).toThrow();
  });
  it("keeps the world position under the cursor fixed while zooming", () => {
    const map = EXAMPLE_MAPS[0],
      frame = { width: 834, height: 460 },
      screen = { x: 610, y: 140 },
      view = { zoom: 1.4, pan: { x: 38, y: -21 } },
      before = worldPoint(screen, map, frame, view),
      next = zoomAt(view, screen, map, frame, 2.8);
    expect(worldPoint(screen, map, frame, next).x).toBeCloseTo(before.x, 9);
    expect(worldPoint(screen, map, frame, next).y).toBeCloseTo(before.y, 9);
  });
  it("anchors a pinch centroid and clamps wheel zoom", () => {
    const map = EXAMPLE_MAPS[0],
      frame = { width: 360, height: 350 },
      anchor = { x: 800, y: 200 },
      screen = { x: 210, y: 120 };
    const next = anchorViewport(anchor, screen, map, frame, 2);
    expect(worldPoint(screen, map, frame, next)).toEqual(anchor);
    expect(zoomAt(FIT_VIEW, screen, map, frame, 99).zoom).toBe(4);
    expect(zoomAt(FIT_VIEW, screen, map, frame, 0.01).zoom).toBe(0.4);
  });
  it("selects and moves checkpoints without mutating the source", () => {
    const map = EXAMPLE_MAPS[0],
      p = map.checkpoints[0],
      selection = hitSelection(map, p)!;
    expect(selection).toEqual({ kind: "checkpoint", index: 0 });
    const next = moveSelection(map, selection, { x: 10, y: 20 });
    expect(next.checkpoints[0]).toEqual({ x: p.x + 10, y: p.y + 20 });
    expect(map.checkpoints[0]).toEqual(p);
  });
  it("removes only a selected checkpoint and leaves the road intact", () => {
    const map = EXAMPLE_MAPS[0],
      next = removeSelection(map, { kind: "checkpoint", index: 0 });
    expect(next.checkpoints).toHaveLength(2);
    expect(next.road).toEqual(map.road);
    expect(map.checkpoints).toHaveLength(3);
  });
  it("erases an interior road point and preserves a visible break", () => {
    const map = EXAMPLE_MAPS[0],
      next = eraseAt(map, map.road[1], 20);
    expect(next.road).toHaveLength(3);
    expect(next.draft?.roadBreaks).toContain(1);
    expect(() => validateMap(next)).toThrow("도로가 끊어져");
  });
  it("erases a road segment even when no control point is in the brush", () => {
    const map = EXAMPLE_MAPS[0],
      next = eraseAt(map, { x: 470, y: 320 }, 18);
    expect(next.road).toHaveLength(4);
    expect(next.draft?.roadBreaks).toContain(2);
    expect(() => validateMap(next)).toThrow();
    expect(validateMap({ ...next, draft: { roadBreaks: [] } }).road).toEqual(
      map.road,
    );
  });
  it("erases starts and goals as incomplete drafts with actionable validation", () => {
    const map = EXAMPLE_MAPS[0],
      start = removeSelection(map, { kind: "start" }),
      goal = removeSelection(map, { kind: "goal" });
    expect(() => validateMap(start)).toThrow("시작점이 없습니다");
    expect(() => validateMap(goal)).toThrow("결승점이 없습니다");
    expect(
      validateMap({ ...start, draft: { missingStart: false } }),
    ).toBeTruthy();
    expect(map.draft).toBeUndefined();
  });
  it("erases obstacles by circular brush intersection and preserves distant objects", () => {
    const map = structuredClone(EXAMPLE_MAPS[4]);
    const next = eraseAt(map, { x: 355, y: 480 }, 15);
    expect(next.objects.map((o) => o.id)).toEqual(["floor"]);
    expect(map.objects).toHaveLength(2);
  });
  it("accepts fractional training speeds while rejecting out-of-range values", () => {
    for (const speed of [0.5, 1, 2.3, 10])
      expect(validateConfig({ ...DEFAULT_CONFIG, speed }).speed).toBe(speed);
    expect(() => validateConfig({ ...DEFAULT_CONFIG, speed: 0.4 })).toThrow();
  });
});
