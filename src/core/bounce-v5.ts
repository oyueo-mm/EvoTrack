import type { AgentState, MapObject, TrackMap } from "./types";
import { circleContact } from "./geometry";
import { clamp } from "./random";
export const motionAngle = (o: MapObject) =>
  o.moveAxis === "vertical"
    ? Math.PI / 2
    : o.moveAxis === "custom"
      ? (o.moveAngle ?? 0)
      : 0;
export function movingPose(o: MapObject, time: number, seed = 42) {
  const omega = (2 * Math.PI) / (o.period ?? 3),
    phase = omega * time + (o.phase ?? (seed % 17) / 17),
    a = motionAngle(o),
    distance = Math.sin(phase) * (o.amplitude ?? 50),
    speed = Math.cos(phase) * omega * (o.amplitude ?? 50);
  return {
    x: o.x + Math.cos(a) * distance,
    y: o.y + Math.sin(a) * distance,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
  };
}
export function collapsed(s: AgentState, id: string) {
  return s.platforms?.[id]?.collapsedAt !== undefined;
}
/** v5 only. Legacy collision rules stay in Simulator. State belongs to one environment. */
export function advanceBounce(
  map: TrackMap,
  s: AgentState,
  action: number,
  seed: number,
  supportId?: string,
) {
  const dt = 1 / 60,
    time = s.steps * dt,
    objects = map.objects.filter(
      (o) => !["respawn", "belt", "reward"].includes(o.kind),
    );
  s.platforms ??= {};
  for (const o of objects)
    if (o.kind === "crumble") {
      const entry = s.platforms[o.id];
      if (!entry) continue;
      if (entry.collapsedAt !== undefined) {
        if (o.regenerate && time - entry.collapsedAt >= (o.restoreDelay ?? 2))
          delete s.platforms[o.id];
      } else if (time - entry.triggeredAt >= (o.collapseDelay ?? 0.4) - 1e-9)
        entry.collapsedAt = time;
    }
  let riding = objects.find((o) => o.id === supportId && !collapsed(s, o.id));
  const move =
    action === 1 || action === 4 ? -1 : action === 2 || action === 5 ? 1 : 0;
  if (action >= 3 && s.grounded) {
    s.vy =
      -350 +
      (riding?.kind === "moving" ? movingPose(riding, time, seed).vy : 0);
    s.grounded = false;
    riding = undefined;
  }
  s.vx =
    Math.abs(s.vx) > map.physics.maxSpeed
      ? s.vx * 0.99
      : clamp(
          s.vx + move * (s.grounded ? 950 : 650) * dt,
          -map.physics.maxSpeed,
          map.physics.maxSpeed,
        );
  if (!move) s.vx *= 0.84;
  const maxPlatformSpeed = objects.reduce(
    (v, o) =>
      o.kind === "moving"
        ? Math.max(
            v,
            (Math.abs(o.amplitude ?? 50) * 2 * Math.PI) / (o.period ?? 3),
          )
        : v,
    0,
  );
  const count = Math.max(
    4,
    Math.ceil(
      ((Math.max(Math.abs(s.vx), Math.abs(s.vy)) + maxPlatformSpeed) * dt) / 3,
    ),
  );
  let nextSupport: string | undefined;
  for (let j = 0; j < count && !s.done; j++) {
    const sub = dt / count,
      t = time + (j + 1) * sub;
    if (riding?.kind === "moving") {
      const before = movingPose(riding, t - sub, seed),
        after = movingPose(riding, t, seed);
      s.x += after.x - before.x;
      s.y += after.y - before.y;
    }
    s.vy = clamp(s.vy + map.physics.gravity * sub, -1400, 650);
    s.x = clamp(s.x + s.vx * sub, 11, map.width - 11);
    s.y += s.vy * sub;
    s.grounded = false;
    nextSupport = undefined;
    for (let pass = 0; pass < 2; pass++)
      for (const original of objects) {
        if (collapsed(s, original.id)) continue;
        const pose =
            original.kind === "moving"
              ? movingPose(original, t, seed)
              : { x: original.x, y: original.y, vx: 0, vy: 0 },
          o = { ...original, x: pose.x, y: pose.y };
        const contact = circleContact(o, s, 11);
        if (!contact) continue;
        if (o.kind === "spike" || o.kind === "bomb") {
          s.failureReason = o.kind;
          s.collision = s.done = true;
          break;
        }
        const n = contact.normal,
          relative = (s.vx - pose.vx) * n.x + (s.vy - pose.vy) * n.y,
          own = s.vx * n.x + s.vy * n.y;
        s.x += n.x * contact.depth;
        s.y += n.y * contact.depth;
        if (own < 0) {
          s.vx -= own * n.x;
          s.vy -= own * n.y;
        }
        if (o.kind === "spring") {
          const a = (o.angle ?? 0) + (o.launchAngle ?? -Math.PI / 2),
            strength = o.launchStrength ?? 520;
          s.vx = Math.cos(a) * strength;
          s.vy = Math.sin(a) * strength;
          s.grounded = false;
          nextSupport = undefined;
          continue;
        }
        if (o.kind === "elastic" && n.y < -0.3 && relative < 0) {
          const impulse = clamp(
            Math.max(
              o.minLaunchSpeed ?? 260,
              -relative * (o.bounceCoefficient ?? o.restitution ?? 0.8) +
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
        if (n.y < -0.45) {
          s.grounded = true;
          nextSupport = o.id;
          if (o.kind === "crumble" && !s.platforms[o.id])
            s.platforms[o.id] = { triggeredAt: t };
        }
      }
    riding = objects.find((o) => o.id === nextSupport);
    // A moving solid may crush a character against another solid. Never teleport through either.
    if (
      objects.some(
        (o) =>
          o.kind === "moving" &&
          !collapsed(s, o.id) &&
          (circleContact({ ...o, ...movingPose(o, t, seed) }, s, 10.5)?.depth ??
            0) > 1,
      )
    ) {
      s.collision = s.done = true;
      s.failureReason = "collision";
    }
    if (s.y > map.height + 20 || s.y < -40) {
      s.collision = s.done = true;
    }
  }
  return nextSupport;
}
