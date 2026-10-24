import { advanceBounce, collapsed, movingPose } from "./bounce-v5";
import { observationSizeFor } from "./types";
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
  return o.kind === "moving" ? { ...o, ...movingPose(o, time, seed) } : o;
}
export class Simulator implements Environment {
  get observationSize() {
    return observationSizeFor(this.map);
  }
  private supportId?: string;
  private sensorCache?: { key: string; values: number[] };
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
  private solidObjects: MapObject[];
  private manual: ManualInput | null = null;
  private respawnPoint: { x: number; y: number; angle: number } | null = null;
  private respawnCount = 0;
  private rewardInside = new Set<string>();
  private rewardFired = new Set<string>();
  private rewardLast = new Map<string, number>();
  private applyBelts() {
    if ((this.map.environmentVersion ?? 1) < 4) return;
    const s = this.state;
    for (const o of this.map.objects.filter(
      (o) => o.kind === "belt" && circleObject(o, s, 11),
    )) {
      const mag = Math.hypot(s.vx, s.vy),
        strength = (o.beltStrength ?? 300) * DT,
        limit = o.maxInfluenceSpeed ?? 480;
      if (o.beltType === "brake") {
        if (o.beltDirection === "beltOrientation") {
          const x = Math.cos(o.angle ?? 0),
            y = Math.sin(o.angle ?? 0),
            projection = s.vx * x + s.vy * y,
            delta = clamp(projection, -strength, strength);
          s.vx -= x * delta;
          s.vy -= y * delta;
        } else {
          const factor = Math.max(0, mag - strength) / (mag || 1);
          s.vx *= factor;
          s.vy *= factor;
        }
      } else {
        const direction =
          o.beltDirection === "beltOrientation" || mag < 0.1
            ? (o.angle ?? s.angle)
            : Math.atan2(s.vy, s.vx);
        s.vx += Math.cos(direction) * strength;
        s.vy += Math.sin(direction) * strength;
        const next = Math.hypot(s.vx, s.vy);
        if (next > limit && next > mag) {
          const cap = Math.max(limit, mag) / next;
          s.vx *= cap;
          s.vy *= cap;
        }
      }
    }
    if (this.map.mode === "racing") {
      const sign = s.speed < 0 ? -1 : 1;
      s.speed = Math.hypot(s.vx, s.vy) * sign;
      if (Math.abs(s.speed) > 0.01)
        s.angle = wrapAngle(Math.atan2(s.vy, s.vx) + (sign < 0 ? Math.PI : 0));
    }
  }
  private shaping(old: { x: number; y: number }) {
    if ((this.map.environmentVersion ?? 1) < 4) return 0;
    let reward = 0;
    const s = this.state;
    const events: string[] = [];
    for (const o of this.map.objects.filter((o) => o.kind === "reward")) {
      if (
        (o.rewardMode &&
          o.rewardMode !== "both" &&
          o.rewardMode !== this.map.mode) ||
        (o.trainingOnly && this.manual)
      )
        continue;
      const inside = circleObject(o, s, 11),
        was = this.rewardInside.has(o.id),
        trigger = o.trigger ?? (o.rewardShape === "gate" ? "cross" : "enter");
      const crossing =
        gateCrossing(old, s, {
          x: o.x + o.w / 2,
          y: o.y + o.h / 2,
          id: o.id,
          width: o.h,
          angle: o.angle ?? 0,
          order: 0,
          directional: false,
        }) !== null;
      const active =
        trigger === "cross"
          ? crossing
          : trigger === "stay"
            ? inside
            : inside && !was;
      if (inside) this.rewardInside.add(o.id);
      else this.rewardInside.delete(o.id);
      const activation = o.activation ?? "once";
      if (
        !active ||
        (activation === "once" && this.rewardFired.has(o.id)) ||
        (activation === "cooldown" &&
          (s.steps - (this.rewardLast.get(o.id) ?? -Infinity)) * DT <
            (o.cooldown ?? 1))
      )
        continue;
      const value =
        (o.rewardValue ?? 1) *
        (trigger === "stay" && activation === "repeat" ? DT : 1);
      reward += value;
      events.push(o.name ?? o.id);
      this.rewardFired.add(o.id);
      this.rewardLast.set(o.id, s.steps);
    }
    s.shapingTotal = (s.shapingTotal ?? 0) + reward;
    s.shapingReward = reward;
    s.rewardEvents = events;
    return reward;
  }
  private get modern() {
    return (this.map.environmentVersion ?? 1) >= 2;
  }
  constructor(
    private map: TrackMap,
    horizon = 600,
  ) {
    this.limit = horizon;
    this.solidObjects = map.objects.filter(
      (o) => !["respawn", "belt", "reward"].includes(o.kind),
    );
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
    this.rewardInside.clear();
    this.rewardFired.clear();
    this.rewardLast.clear();
    this.seed = seed;
    this.sensorCache = undefined;
    this.supportId = undefined;
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
      ...(this.map.environmentVersion === 5
        ? { platforms: {}, environmentSeed: seed }
        : {}),
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
  checkpoint() {
    return {
      state: this.getState(),
      seed: this.seed,
      bestX: this.bestX,
      arc: this.arc,
      bestArc: this.bestArc,
      segment: this.segment,
      supportId: this.supportId,
      rewardInside: [...this.rewardInside],
      rewardFired: [...this.rewardFired],
      rewardLast: [...this.rewardLast],
    };
  }
  restore(c: ReturnType<Simulator["checkpoint"]>) {
    this.reset(c.seed);
    this.state = structuredClone(c.state);
    this.bestX = c.bestX;
    this.arc = c.arc;
    this.bestArc = c.bestArc;
    this.segment = c.segment;
    this.supportId = c.supportId;
    this.rewardInside = new Set(c.rewardInside);
    this.rewardFired = new Set(c.rewardFired);
    this.rewardLast = new Map(c.rewardLast);
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
      : {
          ...this.state,
          trail: [],
          ...(this.state.platforms
            ? { platforms: structuredClone(this.state.platforms) }
            : {}),
        };
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
        this.solidObjects.some(
          (o) =>
            !collapsed(this.state, o.id) &&
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
    const key = `${s.x}:${s.y}:${s.angle}:${s.steps}`;
    if (this.sensorCache?.key === key) return this.sensorCache.values;
    const values = [-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35].map((a) => {
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
    this.sensorCache = { key, values };
    return values;
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
    if (m.environmentVersion === 5) {
      const candidates = m.objects
        .filter((o) => !["respawn", "belt", "reward"].includes(o.kind))
        .map((o) => objectPosition(o, s.steps * DT, this.seed));
      const supports = candidates.filter(
        (o) => !["spike", "bomb"].includes(o.kind) && !collapsed(s, o.id),
      );
      const support = supports.find(
        (o) =>
          s.x >= o.x - 10 &&
          s.x <= o.x + o.w + 10 &&
          Math.abs(s.y + 11 - o.y) < 18,
      );
      const next =
        supports
          .filter((o) => o.x > s.x + 15 && o.x < s.x + 240)
          .sort((a, b) => a.x - b.x)[0] ?? support;
      const motion = support?.kind === "moving" ? support : next;
      const hazard = candidates.find(
        (o) =>
          ["spike", "bomb"].includes(o.kind) && o.x > s.x && o.x - s.x < 180,
      );
      const pose =
        motion?.kind === "moving"
          ? movingPose(motion, s.steps * DT, this.seed)
          : { vx: 0, vy: 0 };
      const fragile = support?.kind === "crumble" ? support : next;
      const entry = fragile ? s.platforms?.[fragile.id] : undefined;
      return Float32Array.from([
        clamp(s.vx / m.physics.maxSpeed, -2, 2),
        clamp(s.vy / 650, -2, 2),
        (m.goal.x - s.x) / m.width,
        (m.goal.y - s.y) / m.height,
        +s.grounded,
        hazard ? clamp((hazard.x - s.x) / 180, -1, 1) : 1,
        hazard ? clamp((s.y - hazard.y) / 200, -1, 1) : 0,
        hazard ? 1 : 0,
        s.x / m.width,
        s.y / m.height,
        s.progress,
        1,
        support ? clamp((support.x + support.w - s.x) / 220, 0, 1) : 0,
        next ? clamp((next.y - s.y) / 230, -1, 1) : 1,
        clamp(pose.vx / 650, -2, 2),
        clamp(pose.vy / 650, -2, 2),
        fragile?.kind === "crumble"
          ? collapsed(s, fragile.id)
            ? -1
            : entry
              ? Math.max(
                  0,
                  1 -
                    (s.steps * DT - entry.triggeredAt) /
                      (fragile.collapseDelay ?? 0.4),
                )
              : 1
          : 0,
        next?.kind === "moving" ? 1 : next?.kind === "crumble" ? -1 : 0,
      ]);
    }
    const objs = m.objects
      .filter((o) => !["belt", "reward"].includes(o.kind))
      .map((original) => {
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
        Math.max(
          m.physics.maxSpeed * (this.manual?.boost ? 1.6 : 1),
          ...m.objects
            .filter(
              (o) =>
                o.kind === "belt" &&
                o.beltType !== "brake" &&
                circleObject(o, s, 11),
            )
            .map((o) => o.maxInfluenceSpeed ?? 480),
        ),
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
      this.applyBelts();
      const n = Math.max(1, Math.ceil((Math.abs(s.speed) * DT) / 3));
      for (let i = 0; i < n; i++) {
        const x = s.x + (s.vx * DT) / n,
          y = s.y + (s.vy * DT) / n;
        if (this.blocked(x, y)) {
          s.collision = true;
          const hazard = m.objects.find(
            (o) =>
              !["respawn", "belt", "reward"].includes(o.kind) &&
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
      if (m.environmentVersion === 5) {
        this.applyBelts();
        this.supportId = advanceBounce(m, s, action, this.seed, this.supportId);
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
          (m.environmentVersion ?? 1) >= 3 &&
          Math.abs(s.vx) > m.physics.maxSpeed
            ? s.vx * 0.99
            : clamp(
                s.vx + move * (s.grounded ? 950 : 650) * DT,
                -m.physics.maxSpeed,
                m.physics.maxSpeed,
              );
        if (!move) s.vx *= 0.84;
        this.applyBelts();
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
            (m.environmentVersion ?? 1) >= 3 ? -1400 : -800,
            650,
          );
          if (this.modern) {
            s.x = clamp(s.x + s.vx * dt, 11, m.width - 11);
            s.y += s.vy * dt;
            for (const o of objects) {
              if (["respawn", "belt", "reward"].includes(o.kind)) continue;
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
              if ((m.environmentVersion ?? 1) >= 3 && o.kind === "spring") {
                const direction =
                    (o.angle ?? 0) + (o.launchAngle ?? -Math.PI / 2),
                  strength = o.launchStrength ?? 520;
                s.vx = Math.cos(direction) * strength;
                s.vy = Math.sin(direction) * strength;
                s.grounded = false;
                continue;
              }
              if (
                (m.environmentVersion ?? 1) >= 4 &&
                o.kind === "elastic" &&
                n.y < -0.3 &&
                into < 0
              ) {
                const impulse = clamp(
                  Math.max(
                    o.minLaunchSpeed ?? 260,
                    -into * (o.bounceCoefficient ?? o.restitution ?? 0.8) +
                      (o.liftBoost ?? 120),
                  ),
                  0,
                  o.maxLaunchSpeed ?? 900,
                );
                s.vx += n.x * impulse - n.y * (o.tangentBoost ?? 0);
                s.vy += n.y * impulse + n.x * (o.tangentBoost ?? 0);
                s.grounded = impulse <= 1;
                continue;
              }
              if (
                (m.environmentVersion ?? 1) >= 3 &&
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
                  (m.environmentVersion ?? 1) < 3 &&
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
      }
      reward += Math.max(0, s.x - this.bestX) * 0.025;
      this.bestX = Math.max(this.bestX, s.x);
      s.speed = Math.hypot(s.vx, s.vy);
      s.progress = clamp(
        (this.bestX - m.start.x) / (m.goal.x - m.start.x || 1),
        0,
        1,
      );
      if (
        distance(s, m.goal) < 35 &&
        (m.environmentVersion !== 5 || !s.collision)
      ) {
        s.success = true;
        s.done = true;
        reward += 30 + ((this.limit - s.steps) / this.limit) * 5;
      }
      if (s.collision) reward -= 3;
    }
    if ((m.environmentVersion ?? 1) >= 3) {
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
    reward += this.shaping(old);
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
