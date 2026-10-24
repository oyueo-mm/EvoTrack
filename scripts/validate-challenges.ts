import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { UX_MAPS } from "../src/core/ux-maps";
import { CHALLENGE_MAPS } from "../src/core/challenge-maps";
import { validateMap } from "../src/core/maps";
import { demonstrate } from "../src/core/demonstrations";
const report = [];
for (const map of [...CHALLENGE_MAPS, ...UX_MAPS]) {
  validateMap(map);
  const before = performance.now(),
    r = demonstrate(map);
  report.push({
    id: map.id,
    difficulty: map.difficulty,
    success: r.success,
    steps: r.steps,
    reward: r.reward,
    checkpoint: r.checkpoint,
    final: { x: r.final.x, y: r.final.y, collision: r.final.collision },
    computeMs: performance.now() - before,
  });
  console.log(JSON.stringify(report.at(-1)));
}
mkdirSync(".cache", { recursive: true });
writeFileSync(
  ".cache/challenge-validation.json",
  JSON.stringify(report, null, 2),
);
if (report.some((r) => !r.success)) process.exitCode = 1;
