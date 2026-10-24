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
const scratch = new WeakMap<
  PolicyData,
  { hidden: Float32Array; output: Float64Array }
>();
export function logitsInto(policy: PolicyData, obs: ArrayLike<number>) {
  let buffers = scratch.get(policy);
  if (!buffers) {
    buffers = {
      hidden: new Float32Array(policy.hidden),
      output: new Float64Array(policy.output),
    };
    scratch.set(policy, buffers);
  }
  const { input, hidden, output, weights: w } = policy,
    h = buffers.hidden,
    out = buffers.output;
  for (let j = 0; j < hidden; j++) {
    let sum = w[input * hidden + j];
    for (let i = 0; i < input; i++) sum += obs[i] * w[i * hidden + j];
    h[j] = Math.tanh(sum);
  }
  const offset = input * hidden + hidden;
  for (let k = 0; k < output; k++) {
    let sum = w[offset + hidden * output + k];
    for (let j = 0; j < hidden; j++) sum += h[j] * w[offset + j * output + k];
    out[k] = sum;
  }
  return out;
}
export function logits(policy: PolicyData, obs: ArrayLike<number>) {
  return Array.from(logitsInto(policy, obs));
}
export function softmax(values: number[]) {
  const mx = Math.max(...values),
    e = values.map((v) => Math.exp(v - mx)),
    sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}
export function actionOf(policy: PolicyData, obs: ArrayLike<number>) {
  const v = logitsInto(policy, obs);
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i;
  return best;
}
export function sample(prob: number[], rng: Random) {
  let p = rng.next();
  for (let i = 0; i < prob.length; i++) {
    p -= prob[i];
    if (p <= 0) return i;
  }
  return prob.length - 1;
}
