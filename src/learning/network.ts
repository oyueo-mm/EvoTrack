import { Random } from "../core/random";
import type { PolicyData } from "../core/types";
export const weightCount = (input: number, hidden: number, output: number) =>
  input * hidden + hidden + hidden * output + output;
export function createPolicy(
  input: number,
  output: number,
  rng: Random,
  hidden = 24,
): PolicyData {
  return {
    input,
    hidden,
    output,
    weights: Array.from(
      { length: weightCount(input, hidden, output) },
      () => rng.normal() * 0.3,
    ),
  };
}
export function logits(policy: PolicyData, obs: ArrayLike<number>) {
  const { input, hidden, output, weights: w } = policy;
  const h = new Float32Array(hidden);
  for (let j = 0; j < hidden; j++) {
    let s = w[input * hidden + j];
    for (let i = 0; i < input; i++) s += obs[i] * w[i * hidden + j];
    h[j] = Math.tanh(s);
  }
  const offset = input * hidden + hidden;
  return Array.from({ length: output }, (_, k) => {
    let v = w[offset + hidden * output + k];
    for (let j = 0; j < hidden; j++) v += h[j] * w[offset + j * output + k];
    return v;
  });
}
export function softmax(values: number[]) {
  const mx = Math.max(...values),
    e = values.map((v) => Math.exp(v - mx)),
    sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}
export function actionOf(policy: PolicyData, obs: ArrayLike<number>) {
  const v = logits(policy, obs);
  return v.indexOf(Math.max(...v));
}
export function sample(prob: number[], rng: Random) {
  let p = rng.next();
  for (let i = 0; i < prob.length; i++) {
    p -= prob[i];
    if (p <= 0) return i;
  }
  return prob.length - 1;
}
