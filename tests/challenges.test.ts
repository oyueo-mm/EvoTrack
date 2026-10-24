import { describe, it, expect } from "vitest";
import { CHALLENGE_MAPS } from "../src/core/challenge-maps";
import { UX_MAPS } from "../src/core/ux-maps";
import { validateMap } from "../src/core/maps";
import { demonstrate } from "../src/core/demonstrations";
import { Simulator } from "../src/core/environment";
describe("challenge maps are physically reachable, independently of AI learning", () => {
  for (const map of [...CHALLENGE_MAPS, ...UX_MAPS])
    it(map.id, () => {
      expect(() => validateMap(map)).not.toThrow();
      const result = demonstrate(map);
      expect(result.success).toBe(true);
      const replay = new Simulator(map, 12000);
      replay.reset(42);
      for (const action of result.actions) replay.step(action);
      expect(replay.getState(false)).toEqual(result.final);
      expect(replay.getState().success).toBe(true);
    });
});
