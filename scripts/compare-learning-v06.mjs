import { readFileSync } from "node:fs";
const previous = JSON.parse(readFileSync(process.argv[2], "utf8"));
const candidate = JSON.parse(readFileSync(process.argv[3], "utf8"));
const key = (r) => r.id + "|" + r.algorithm + "|" + r.seed;
const baseline = new Map(previous.runs.map((r) => [key(r), r]));
const groups = new Map();
for (const r of candidate.runs) {
  const old = baseline.get(key(r));
  if (!old) throw Error("Missing baseline for " + key(r));
  const k = r.id + " / " + r.algorithm;
  const x = groups.get(k) ?? { n: 0, oldSuccess: 0, newSuccess: 0, oldProgress: 0, newProgress: 0, oldFinal: 0, newFinal: 0 };
  x.n++;
  x.oldSuccess += old.best.successRate;
  x.newSuccess += r.best.successRate;
  x.oldProgress += old.best.meanProgress;
  x.newProgress += r.best.meanProgress;
  x.oldFinal += old.final.successRate;
  x.newFinal += r.final.successRate;
  groups.set(k, x);
}
console.log("=== EvoTrack matched-seed learning comparison ===");
console.log("Map / algorithm | best success before -> after | best progress before -> after | final success before -> after");
let sums = { n: 0, oldSuccess: 0, newSuccess: 0, oldProgress: 0, newProgress: 0, oldFinal: 0, newFinal: 0 };
for (const [id, x] of groups) {
  console.log(id + " | " + (x.oldSuccess / x.n * 100).toFixed(1) + "% -> " + (x.newSuccess / x.n * 100).toFixed(1) + "% | " + (x.oldProgress / x.n * 100).toFixed(1) + "% -> " + (x.newProgress / x.n * 100).toFixed(1) + "% | " + (x.oldFinal / x.n * 100).toFixed(1) + "% -> " + (x.newFinal / x.n * 100).toFixed(1) + "%");
  for (const k of Object.keys(sums)) if (k !== "n") sums[k] += x[k];
  sums.n += x.n;
}
console.log("AVERAGE | " + (sums.oldSuccess / sums.n * 100).toFixed(1) + "% -> " + (sums.newSuccess / sums.n * 100).toFixed(1) + "% | " + (sums.oldProgress / sums.n * 100).toFixed(1) + "% -> " + (sums.newProgress / sums.n * 100).toFixed(1) + "% | " + (sums.oldFinal / sums.n * 100).toFixed(1) + "% -> " + (sums.newFinal / sums.n * 100).toFixed(1) + "%");
