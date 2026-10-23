export type Mode = "racing" | "bounce";
export type Algorithm = "GA" | "PPO";
export interface Point {
  x: number;
  y: number;
}
export interface MapObject extends Point {
  id: string;
  kind: "wall" | "platform" | "moving" | "spike" | "spring" | "elastic";
  w: number;
  h: number;
  amplitude?: number;
  period?: number;
}
export interface TrackMap {
  id: string;
  name: string;
  description: string;
  mode: Mode;
  version: 1;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
  road: Point[];
  roadWidth: number;
  start: Point & { angle: number };
  goal: Point;
  checkpoints: Point[];
  objects: MapObject[];
  physics: { maxSpeed: number; gravity: number };
  /** Transient editor state. Incomplete drafts cannot run or be saved as maps. */
  draft?: {
    missingStart?: boolean;
    missingGoal?: boolean;
    roadBreaks?: number[];
  };
}
export interface AgentState extends Point {
  angle: number;
  vx: number;
  vy: number;
  speed: number;
  grounded: boolean;
  checkpoint: number;
  steps: number;
  reward: number;
  done: boolean;
  success: boolean;
  collision: boolean;
  progress: number;
  trail: Point[];
}
export interface Metrics {
  steps: number;
  reward: number;
  progress: number;
  success: boolean;
  collisions: number;
  time: number;
}
export interface StepResult {
  observation: Float32Array;
  reward: number;
  terminated: boolean;
  truncated: boolean;
  info: Metrics;
}
export interface Environment {
  readonly observationSize: number;
  readonly actionSize: number;
  reset(seed: number): Float32Array;
  step(action: number): StepResult;
  observe(): Float32Array;
  getState(): AgentState;
  getMetrics(): Metrics;
  serialize(): TrackMap;
}
export const SCHEMAS = { environment: 1, observation: 1, action: 1 } as const;
export const ACTIONS = {
  racing: [
    "accelerate",
    "accelerate left",
    "accelerate right",
    "brake",
    "coast",
  ],
  bounce: ["wait", "left", "right", "jump", "left + jump", "right + jump"],
} as const;
export interface Config {
  seed: number;
  population: number;
  elite: number;
  crossover: number;
  mutation: number;
  sigma: number;
  horizon: number;
  rollout: number;
  epochs: number;
  minibatch: number;
  learningRate: number;
  gamma: number;
  lambda: number;
  clip: number;
  entropy: number;
  speed: number;
}
export const DEFAULT_CONFIG: Config = {
  seed: 42,
  population: 32,
  elite: 0.125,
  crossover: 0.8,
  mutation: 0.12,
  sigma: 0.2,
  horizon: 600,
  rollout: 256,
  epochs: 4,
  minibatch: 64,
  learningRate: 0.001,
  gamma: 0.99,
  lambda: 0.95,
  clip: 0.2,
  entropy: 0.01,
  speed: 2,
};
export interface TrainingStats {
  algorithm: Algorithm;
  iteration: number;
  steps: number;
  episodes: number;
  elapsed: number;
  best: number;
  mean: number;
  successRate: number;
  completionTime: number | null;
  collisions: number;
  progress: number;
  fitness: number[];
  policyLoss: number;
  valueLoss: number;
  entropy: number;
  kl: number;
  tensors: number;
  bytes: number;
  stepsPerSecond: number;
}
export interface PolicyData {
  input: number;
  hidden: number;
  output: number;
  weights: number[];
}
export interface SavedModel {
  id: string;
  name: string;
  kind: "inference" | "checkpoint";
  algorithm: Algorithm;
  mode: Mode;
  schemas: typeof SCHEMAS;
  policy: PolicyData;
  config: Config;
  stats: TrainingStats;
  mapId: string;
  trainingMap: TrackMap;
  createdAt: string;
  checkpoint?: unknown;
}
export interface Snapshot {
  stats: TrainingStats;
  state: AgentState;
  population: AgentState[];
  policy: PolicyData;
}
export type CommandName =
  | "START"
  | "PAUSE"
  | "RESUME"
  | "STOP"
  | "RESET"
  | "UPDATE_CONFIG"
  | "REQUEST_SNAPSHOT"
  | "SAVE_CHECKPOINT"
  | "LOAD_CHECKPOINT";
export interface Command {
  type: CommandName;
  session: string;
  requestId: number;
  algorithm: Algorithm;
  map?: TrackMap;
  config?: Config;
  model?: SavedModel;
}
export interface WorkerReply {
  type: "ACK" | "SNAPSHOT" | "CHECKPOINT" | "ERROR";
  session: string;
  requestId: number;
  status?: "running" | "paused" | "stopped";
  snapshot?: Snapshot;
  model?: SavedModel;
  error?: string;
}
