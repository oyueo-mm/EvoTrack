import type { AgentState, Environment, MapObject, TrackMap } from "./types";
import { clamp, distance, wrapAngle } from "./random";
import { segmentDistance } from "./maps";
import {
  circleObject,
  circleContact,
  objectBounds,
  gateCrossing,
  gateAt,
  projectRoad,
  roadLengths,
} from "./geometry";
export const DT = 1 / 60;
export interface ManualInput {
  steer: number;
  throttle: number;
  boost?: boolean;
  jump?: boolean;
  drop?: boolean;
  brake?: boolean;
}
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
  private lengths: number[] = [];
  private arc = 0;
  private bestArc = 0;
  private segment = 0;
  private gateArcs: number[] = [];
  private roadGrid = new Map<string, number[]>();
  private manual: ManualInput | null = null;
  private respawnPoint: { x: number; y: number; angle: number } | null = null;
  private respawnCount = 0;
  private get modern() {
    return (this.map.environmentVersion ?? 1) >= 2;
  }
  constructor(
    private map: TrackMap,
    horizon = 600,
  ) {
    this.limit = horizon;
    this.lengths = roadLengths(map.road);
    this.gateArcs = map.checkpoints.map(
      (p) => projectRoad(p, map.road, this.lengths).arc,
    );
    if (this.modern) {
      const margin = map.roadWidth / 2 + 1;
      for (let i = 1; i < map.road.length; i++) {
        const a = map.road[i - 1],
          b = map.road[i];
        for (
          let x = Math.floor((Math.min(a.x, b.x) - margin) / 80);
          x <= Math.floor((Math.max(a.x, b.x) + margin) / 80);
          x++
        )
          for (
            let y = Math.floor((Math.min(a.y, b.y) - margin) / 80);
            y <= Math.floor((Math.max(a.y, b.y) + margin) / 80);
            y++
          ) {
            const key = x + ":" + y,
              entries = this.roadGrid.get(key) ?? [];
            entries.push(i);
            this.roadGrid.set(key, entries);
          }
      }
    }
    this.reset(42);
  }
  reset(seed: number) {
    this.respawnPoint = null;
    this.respawnCount = 0;
    this.seed = seed;
    this.bestX = this.map.start.x;
    const projected = projectRoad(this.map.start, this.map.road, this.lengths);
    this.arc = this.bestArc = projected.arc;
    this.segment = projected.segment;
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
  respawn() {
    const point = this.respawnPoint,
      count = this.respawnCount + 1;
    this.reset(this.seed);
    this.respawnPoint = point;
    this.respawnCount = count;
    if (point) {
      Object.assign(this.state, point);
      this.bestX = point.x;
    }
    this.state.respawns = count;
  }
  stepManual(input: ManualInput) {
    this.manual = input;
    try {
      if (this.map.mode === "bounce") {
        if (input.brake) this.state.vx *= 0.8;
        if (input.drop && !this.state.grounded)
          this.state.vy = Math.min(650, this.state.vy + 40);
        return this.step(
          input.jump
            ? input.steer < 0
              ? 4
              : input.steer > 0
                ? 5
                : 3
            : input.steer < 0
              ? 1
              : input.steer > 0
                ? 2
                : 0,
        );
      }
      return this.step(4);
    } finally {
      this.manual = null;
    }
  }
  serialize() {
    return structuredClone(this.map);
  }
  recentTrail(limit = 48) {
    return this.state.trail.slice(-limit);
  }
  get done() {
    return this.state.done;
  }
  getState(includeTrail = true, includeSensors = false) {
    const state = includeTrail
      ? structuredClone(this.state)
      : { ...this.state, trail: [] };
    if (includeSensors && this.map.mode === "racing")
      state.sensors = this.sensors();
    return state;
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
    if (!this.modern)
      return Math.min(
        ...this.map.road
          .slice(1)
          .map((p, i) => segmentDistance({ x, y }, this.map.road[i], p)),
      );
    let best = Infinity;
    for (const i of this.roadGrid.get(
      Math.floor(x / 80) + ":" + Math.floor(y / 80),
    ) ?? []) {
      const a = this.map.road[i - 1],
        b = this.map.road[i],
        dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
      const d = (x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  blocked(x: number, y: number, radius = 9) {
    if (this.modern)
      return (
        x < radius ||
        y < radius ||
        x > this.map.width - radius ||
        y > this.map.height - radius ||
        (this.map.mode === "racing" &&
          this.roadDistance(x, y) > this.map.roadWidth / 2 - radius) ||
        this.map.objects
          .filter((o) => o.kind !== "respawn")
          .some((o) =>
            circleObject(
              objectPosition(o, this.state.steps * DT, this.seed),
              { x, y },
              radius,
            ),
          )
      );
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
    const objs = m.objects.map((original) => {
      const o = objectPosition(original, s.steps * DT, this.seed);
      if (!this.modern || !o.angle) return o;
      const b = objectBounds(o);
      return {
        ...o,
        x: o.x + o.w / 2 - b.x,
        y: o.y + o.h / 2 - b.y,
        w: b.x * 2,
        h: b.y * 2,
      };
    });
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
      const accel = this.manual
        ? this.manual.throttle * 180 +
          (this.manual.boost ? 250 : 0) -
          (!this.manual.throttle && !this.manual.boost
            ? Math.sign(s.speed) * 50
            : 0)
        : action <= 2
          ? 180
          : action === 3
            ? -300
            : -40;
      s.speed = clamp(
        s.speed + accel * DT,
        this.manual ? -m.physics.maxSpeed * 0.6 : 0,
        m.physics.maxSpeed * (this.manual?.boost ? 1.6 : 1),
      );
      s.speed *= 0.998;
      const steering =
        this.manual?.steer ?? (action === 1 ? -1 : action === 2 ? 1 : 0);
      s.angle = wrapAngle(
        s.angle +
          (this.manual ? steering * 2.4 : (steering * s.speed) / 65) * DT,
      );
      s.vx = Math.cos(s.angle) * s.speed;
      s.vy = Math.sin(s.angle) * s.speed;
      const n = Math.max(1, Math.ceil((Math.abs(s.speed) * DT) / 3));
      for (let i = 0; i < n; i++) {
        const x = s.x + (s.vx * DT) / n,
          y = s.y + (s.vy * DT) / n;
        if (this.blocked(x, y)) {
          s.collision = true;
          const hazard = m.objects.find(
            (o) =>
              o.kind !== "respawn" &&
              circleObject(
                objectPosition(o, s.steps * DT, this.seed),
                { x, y },
                9,
              ),
          );
          s.failureReason =
            hazard?.kind === "bomb"
              ? "bomb"
              : hazard?.kind === "spike"
                ? "spike"
                : "collision";
          s.done = true;
          reward -= 3;
          break;
        }
        s.x = x;
        s.y = y;
      }
      if (this.modern) {
        // Only the next gate may advance. A finite segment crossing is required.
        let crossingStart = old;
        while (!s.collision && s.checkpoint < m.checkpoints.length) {
          const t = gateCrossing(crossingStart, s, gateAt(m, s.checkpoint));
          if (t === null) break;
          crossingStart = {
            x:
              crossingStart.x + (s.x - crossingStart.x) * Math.min(1, t + 1e-7),
            y:
              crossingStart.y + (s.y - crossingStart.y) * Math.min(1, t + 1e-7),
          };
          s.checkpoint++;
          reward += 5;
        }
        const travel = Math.hypot(s.x - old.x, s.y - old.y),
          reach = travel * 2 + 1e-6;
        const indices = m.road
          .slice(1)
          .map((_, i) => i)
          .filter(
            (i) =>
              this.lengths[i] <= this.arc + reach &&
              this.lengths[i + 1] >= this.arc - reach,
          );
        const projected = projectRoad(s, m.road, this.lengths, indices);
        if (Number.isFinite(projected.distance) && travel > 0) {
          this.arc = Math.max(
            this.arc - reach,
            Math.min(this.arc + reach, projected.arc),
          );
          this.segment = projected.segment;
        }
        const gatedArc = Math.min(
          this.arc,
          this.gateArcs[s.checkpoint] ?? this.lengths.at(-1) ?? 0,
        );
        reward += Math.max(0, gatedArc - this.bestArc) * 0.025;
        this.bestArc = Math.max(this.bestArc, gatedArc);
        s.progress = clamp(this.bestArc / (this.lengths.at(-1) || 1), 0, 1);
        if (
          !s.collision &&
          s.checkpoint === m.checkpoints.length &&
          this.arc >= (this.lengths.at(-1) ?? 0) - 35 &&
          distance(s, m.goal) < 30
        ) {
          s.success = true;
          s.done = true;
          s.progress = 1;
          reward += 30 + ((this.limit - s.steps) / this.limit) * 5;
        }
      } else {
        reward += (before - distance(s, target)) * 0.025;
        if (
          !s.collision &&
          distance(s, target) < Math.max(24, Math.min(45, m.roadWidth * 0.35))
        ) {
          s.checkpoint++;
          reward += 5;
          if (
            s.checkpoint >= m.checkpoints.length &&
            distance(s, m.goal) < 55
          ) {
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
      }
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
      s.vx =
        m.environmentVersion === 3 && Math.abs(s.vx) > m.physics.maxSpeed
          ? s.vx * 0.99
          : clamp(
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
        s.vy = clamp(
          s.vy + m.physics.gravity * dt,
          m.environmentVersion === 3 ? -1400 : -800,
          650,
        );
        if (this.modern) {
          s.x = clamp(s.x + s.vx * dt, 11, m.width - 11);
          s.y += s.vy * dt;
          for (const o of objects) {
            if (o.kind === "respawn") continue;
            const contact = circleContact(o, s, 11);
            if (!contact) continue;
            if (o.kind === "spike" || o.kind === "bomb") {
              s.failureReason = o.kind;
              s.collision = true;
              s.done = true;
              break;
            }
            const n = contact.normal;
            s.x += n.x * contact.depth;
            s.y += n.y * contact.depth;
            const into = s.vx * n.x + s.vy * n.y;
            if (into < 0) {
              s.vx -= into * n.x;
              s.vy -= into * n.y;
            }
            if (m.environmentVersion === 3 && o.kind === "spring") {
              const direction =
                  (o.angle ?? 0) + (o.launchAngle ?? -Math.PI / 2),
                strength = o.launchStrength ?? 520;
              s.vx = Math.cos(direction) * strength;
              s.vy = Math.sin(direction) * strength;
              s.grounded = false;
              continue;
            }
            if (
              m.environmentVersion === 3 &&
              o.kind === "elastic" &&
              into < -30
            ) {
              const bounce = -into * (o.restitution ?? 0.8);
              s.vx += n.x * bounce;
              s.vy += n.y * bounce;
              s.grounded = false;
              continue;
            }
            if (n.y < -0.45) {
              s.grounded = true;
              if (
                m.environmentVersion !== 3 &&
                (o.kind === "spring" || o.kind === "elastic")
              ) {
                const impulse = o.kind === "spring" ? 520 : 410;
                s.vx += n.x * impulse;
                s.vy += n.y * impulse;
                s.grounded = false;
              }
              if (o.kind === "moving" && previousGrounded) {
                const next = objectPosition(
                  m.objects.find((a) => a.id === o.id)!,
                  s.steps * DT + DT,
                  this.seed,
                );
                s.x += (next.x - o.x) / substeps;
              }
            }
          }
          if (s.y > m.height + 20) {
            s.collision = true;
            s.done = true;
          }
          continue;
        }
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
    if (m.environmentVersion === 3) {
      const marker = m.objects.find(
        (o) => o.kind === "respawn" && circleObject(o, s, 11),
      );
      if (marker)
        this.respawnPoint = {
          x: marker.x + marker.w / 2,
          y: marker.y + marker.h / 2,
          angle: marker.angle ?? 0,
        };
    }
    if (this.manual) s.respawns = this.respawnCount;
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
