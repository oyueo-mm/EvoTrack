import type { AgentState, Environment, MapObject, TrackMap } from "./types";
import { clamp, distance, wrapAngle } from "./random";
import { segmentDistance } from "./maps";
export const DT = 1 / 60;
export function objectPosition(o: MapObject, time: number, seed = 42) {
  return {
    ...o,
    x:
      o.x +
      (o.kind === "moving"
        ? Math.sin((time * 2 * Math.PI) / (o.period ?? 3) + (seed % 17) / 17) *
          (o.amplitude ?? 50)
        : 0),
  };
}
export class Simulator implements Environment {
  readonly observationSize = 12;
  get actionSize() {
    return this.map.mode === "racing" ? 5 : 6;
  }
  private state!: AgentState;
  private seed = 42;
  private limit: number;
  private bestX = 0;
  constructor(
    private map: TrackMap,
    horizon = 600,
  ) {
    this.limit = horizon;
    this.reset(42);
  }
  reset(seed: number) {
    this.seed = seed;
    this.bestX = this.map.start.x;
    this.state = {
      ...this.map.start,
      vx: 0,
      vy: 0,
      speed: 0,
      grounded: false,
      checkpoint: 0,
      steps: 0,
      reward: 0,
      done: false,
      success: false,
      collision: false,
      progress: 0,
      trail: [],
    };
    return this.observe();
  }
  serialize() {
    return structuredClone(this.map);
  }
  getState() {
    return structuredClone(this.state);
  }
  getMetrics() {
    const s = this.state;
    return {
      steps: s.steps,
      reward: s.reward,
      progress: s.progress,
      success: s.success,
      collisions: s.collision ? 1 : 0,
      time: s.steps * DT,
    };
  }
  roadDistance(x: number, y: number) {
    return Math.min(
      ...this.map.road
        .slice(1)
        .map((p, i) => segmentDistance({ x, y }, this.map.road[i], p)),
    );
  }
  blocked(x: number, y: number, radius = 9) {
    return (
      x < radius ||
      y < radius ||
      x > this.map.width - radius ||
      y > this.map.height - radius ||
      (this.map.mode === "racing" &&
        this.roadDistance(x, y) > this.map.roadWidth / 2 - radius) ||
      this.map.objects.some(
        (o) =>
          x + radius > o.x &&
          x - radius < o.x + o.w &&
          y + radius > o.y &&
          y - radius < o.y + o.h,
      )
    );
  }
  sensors() {
    const s = this.state;
    return [-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35].map((a) => {
      let d = 0;
      for (d = 0; d < 180; d += 6)
        if (
          this.blocked(
            s.x + Math.cos(s.angle + a) * d,
            s.y + Math.sin(s.angle + a) * d,
            0,
          )
        )
          break;
      return d / 180;
    });
  }
  observe() {
    const s = this.state,
      m = this.map,
      target = m.checkpoints[s.checkpoint] ?? m.goal;
    if (m.mode === "racing") {
      const angle = wrapAngle(
        Math.atan2(target.y - s.y, target.x - s.x) - s.angle,
      );
      return Float32Array.from([
        ...this.sensors(),
        s.speed / m.physics.maxSpeed,
        angle / Math.PI,
        clamp(distance(s, target) / 1000, 0, 1),
        s.progress,
        1,
      ]);
    }
    const objs = m.objects.map((o) =>
      objectPosition(o, s.steps * DT, this.seed),
    );
    const ahead = objs
      .filter(
        (o) =>
          o.x + o.w > s.x + 10 &&
          o.x - s.x < 160 &&
          o.y < s.y + 18 &&
          o.y + o.h > s.y - 90,
      )
      .sort((a, b) => a.x - b.x)[0];
    return Float32Array.from([
      s.vx / m.physics.maxSpeed,
      clamp(s.vy / 500, -1, 1),
      (m.goal.x - s.x) / m.width,
      (m.goal.y - s.y) / m.height,
      s.grounded ? 1 : 0,
      ahead ? clamp((ahead.x - s.x) / 160, -1, 1) : 1,
      ahead ? (s.y - ahead.y) / 200 : 0,
      ahead?.kind === "spike" ? 1 : 0,
      s.x / m.width,
      s.y / m.height,
      s.progress,
      1,
    ]);
  }
  step(action: number) {
    if (!Number.isInteger(action) || action < 0 || action >= this.actionSize)
      throw Error("Invalid action");
    const s = this.state,
      m = this.map;
    if (s.done)
      return {
        observation: this.observe(),
        reward: 0,
        terminated: s.success || s.collision,
        truncated: !s.success && !s.collision,
        info: this.getMetrics(),
      };
    let reward = -0.006;
    const old = { x: s.x, y: s.y };
    if (m.mode === "racing") {
      const target = m.checkpoints[s.checkpoint] ?? m.goal,
        before = distance(s, target);
      const accel = action <= 2 ? 180 : action === 3 ? -300 : -40;
      s.speed = clamp(s.speed + accel * DT, 0, m.physics.maxSpeed);
      s.speed *= 0.998;
      const steering = action === 1 ? -1 : action === 2 ? 1 : 0;
      s.angle = wrapAngle(s.angle + ((steering * s.speed) / 65) * DT);
      s.vx = Math.cos(s.angle) * s.speed;
      s.vy = Math.sin(s.angle) * s.speed;
      const n = Math.max(1, Math.ceil((s.speed * DT) / 3));
      for (let i = 0; i < n; i++) {
        const x = s.x + (s.vx * DT) / n,
          y = s.y + (s.vy * DT) / n;
        if (this.blocked(x, y)) {
          s.collision = true;
          s.done = true;
          reward -= 3;
          break;
        }
        s.x = x;
        s.y = y;
      }
      reward += (before - distance(s, target)) * 0.025;
      if (
        !s.collision &&
        distance(s, target) < Math.max(24, Math.min(45, m.roadWidth * 0.35))
      ) {
        s.checkpoint++;
        reward += 5;
        if (s.checkpoint >= m.checkpoints.length && distance(s, m.goal) < 55) {
          s.success = true;
          s.done = true;
          reward += 25 + ((this.limit - s.steps) / this.limit) * 5;
        }
      }
      s.progress = clamp(
        (s.checkpoint +
          Math.max(
            0,
            1 - distance(s, m.checkpoints[s.checkpoint] ?? m.goal) / 300,
          )) /
          Math.max(1, m.checkpoints.length),
        0,
        1,
      );
    } else {
      const move =
        action === 1 || action === 4
          ? -1
          : action === 2 || action === 5
            ? 1
            : 0;
      const jump = action >= 3;
      if (jump && s.grounded) {
        s.vy = -350;
        s.grounded = false;
      }
      s.vx = clamp(
        s.vx + move * (s.grounded ? 950 : 650) * DT,
        -m.physics.maxSpeed,
        m.physics.maxSpeed,
      );
      if (!move) s.vx *= 0.84;
      const previousGrounded = s.grounded;
      s.grounded = false;
      const objects = m.objects.map((o) =>
        objectPosition(o, s.steps * DT, this.seed),
      );
      const substeps = Math.max(
        4,
        Math.ceil((Math.max(Math.abs(s.vx), Math.abs(s.vy)) * DT) / 4),
      );
      for (let j = 0; j < substeps && !s.done; j++) {
        const dt = DT / substeps;
        s.vy = clamp(s.vy + m.physics.gravity * dt, -800, 650);
        s.x = clamp(s.x + s.vx * dt, 11, m.width - 11);
        for (const o of objects)
          if (
            s.x + 11 > o.x &&
            s.x - 11 < o.x + o.w &&
            s.y + 10 > o.y + 0.1 &&
            s.y - 10 < o.y + o.h
          ) {
            if (o.kind === "spike") {
              s.collision = true;
              s.done = true;
              break;
            }
            s.x = s.vx > 0 ? o.x - 11 : o.x + o.w + 11;
            s.vx = 0;
          }
        const py = s.y;
        s.y += s.vy * dt;
        for (const o of objects)
          if (
            s.x + 10 > o.x &&
            s.x - 10 < o.x + o.w &&
            s.y + 11 > o.y &&
            s.y - 11 < o.y + o.h
          ) {
            if (o.kind === "spike") {
              s.collision = true;
              s.done = true;
              break;
            }
            if (s.vy >= 0 && py + 11 <= o.y + 4) {
              s.y = o.y - 11;
              s.grounded = true;
              s.vy =
                o.kind === "spring" ? -520 : o.kind === "elastic" ? -410 : 0;
              if (s.vy < 0) s.grounded = false;
              if (o.kind === "moving" && previousGrounded) {
                const next = objectPosition(
                  m.objects.find((a) => a.id === o.id)!,
                  s.steps * DT + DT,
                  this.seed,
                );
                s.x += (next.x - o.x) / substeps;
              }
            } else if (s.vy < 0 && py - 11 >= o.y + o.h - 4) {
              s.y = o.y + o.h + 11;
              s.vy = 0;
            }
          }
        if (s.y > m.height + 20) {
          s.collision = true;
          s.done = true;
        }
      }
      reward += Math.max(0, s.x - this.bestX) * 0.025;
      this.bestX = Math.max(this.bestX, s.x);
      s.speed = Math.hypot(s.vx, s.vy);
      s.progress = clamp(
        (this.bestX - m.start.x) / (m.goal.x - m.start.x || 1),
        0,
        1,
      );
      if (distance(s, m.goal) < 35) {
        s.success = true;
        s.done = true;
        reward += 30 + ((this.limit - s.steps) / this.limit) * 5;
      }
      if (s.collision) reward -= 3;
    }
    s.steps++;
    if (s.steps >= this.limit) s.done = true;
    s.reward += reward;
    if (s.steps % 4 === 0 && distance(s, old) > 0) {
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 200) s.trail.shift();
    }
    return {
      observation: this.observe(),
      reward,
      terminated: s.success || s.collision,
      truncated: s.steps >= this.limit && !s.success && !s.collision,
      info: this.getMetrics(),
    };
  }
}
