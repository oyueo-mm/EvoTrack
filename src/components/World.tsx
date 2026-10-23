import { useEffect, useRef, useState } from "react";
import type {
  AgentState,
  MapObject,
  Point,
  PolicyData,
  Snapshot,
  TrackMap,
} from "../core/types";
import { objectPosition, Simulator } from "../core/environment";
import { actionOf } from "../learning/network";
export type Tool =
  | "select"
  | "road"
  | "wall"
  | "platform"
  | "moving"
  | "spike"
  | "spring"
  | "elastic"
  | "start"
  | "goal"
  | "checkpoint"
  | "erase"
  | "pan";
export interface ViewOptions {
  sensors: boolean;
  trail: boolean;
  collision: boolean;
  all: boolean;
  ghost: boolean;
}
export function drawWorld(
  ctx: CanvasRenderingContext2D,
  map: TrackMap,
  options: ViewOptions,
  snapshot?: Snapshot,
  color = "#a7e879",
  selected?: string,
  ghost?: AgentState,
) {
  const w = map.width,
    h = map.height;
  ctx.fillStyle = "#151b20";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#242c32";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let x = 0; x < w; x += 40) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y < h; y += 40) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  if (map.mode === "racing" && map.road.length) {
    const path = () => {
      ctx.beginPath();
      map.road.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    path();
    ctx.strokeStyle = "#53615f";
    ctx.lineWidth = map.roadWidth + 7;
    ctx.stroke();
    path();
    ctx.strokeStyle = "#2a3438";
    ctx.lineWidth = map.roadWidth;
    ctx.stroke();
    path();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#5b6867";
    ctx.setLineDash([9, 11]);
    ctx.stroke();
    ctx.setLineDash([]);
    map.checkpoints.forEach((p, i) => {
      const prev = map.checkpoints[i - 1] ?? map.start;
      const a = Math.atan2(p.y - prev.y, p.x - prev.x) + Math.PI / 2;
      ctx.strokeStyle =
        i < (snapshot?.state.checkpoint ?? 0) ? "#a7e879" : "#b6c6c04d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(
        p.x + Math.cos(a) * map.roadWidth * 0.4,
        p.y + Math.sin(a) * map.roadWidth * 0.4,
      );
      ctx.lineTo(
        p.x - Math.cos(a) * map.roadWidth * 0.4,
        p.y - Math.sin(a) * map.roadWidth * 0.4,
      );
      ctx.stroke();
      ctx.font = "10px monospace";
      ctx.fillStyle = "#96a8a5";
      ctx.fillText(String(i + 1).padStart(2, "0"), p.x + 8, p.y - 10);
    });
  }
  map.objects.forEach((original) => {
    const o = objectPosition(original, (snapshot?.state.steps ?? 0) / 60, 42);
    ctx.fillStyle =
      o.kind === "spike"
        ? "#ed877c"
        : o.kind === "spring"
          ? "#bd9cf3"
          : o.kind === "elastic"
            ? "#e6bf74"
            : o.kind === "moving"
              ? "#85bddd"
              : "#657b7c";
    ctx.strokeStyle = selected === o.id ? "#fff" : "#a3c0bb";
    ctx.lineWidth = selected === o.id ? 3 : 1;
    if (o.kind === "spike") {
      ctx.beginPath();
      for (let x = o.x; x < o.x + o.w; x += 16) {
        ctx.moveTo(x, o.y + o.h);
        ctx.lineTo(x + 8, o.y);
        ctx.lineTo(x + 16, o.y + o.h);
      }
      ctx.fill();
    } else {
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      if (o.kind === "moving") {
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(
          original.x - (o.amplitude ?? 50),
          o.y,
          o.w + (o.amplitude ?? 50) * 2,
          o.h,
        );
        ctx.setLineDash([]);
      }
    }
  });
  ctx.strokeStyle = "#a7e879";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(map.start.x, map.start.y, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#a7e879";
  ctx.font = "10px monospace";
  ctx.fillText("START", map.start.x - 16, map.start.y + 31);
  ctx.fillStyle = "#a7e87920";
  ctx.fillRect(map.goal.x - 18, map.goal.y - 24, 36, 48);
  ctx.strokeStyle = "#a7e879";
  ctx.strokeRect(map.goal.x - 18, map.goal.y - 24, 36, 48);
  ctx.fillStyle = "#a7e879";
  ctx.fillText("FINISH", map.goal.x - 17, map.goal.y + 40);
  const agent = (s: AgentState, c: string, alpha = 1) => {
    ctx.globalAlpha = alpha;
    if (options.trail && s.trail.length) {
      ctx.beginPath();
      s.trail.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (options.sensors && map.mode === "racing") {
      ctx.strokeStyle = c + "38";
      ctx.lineWidth = 1;
      for (const a of [-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35]) {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(
          s.x + Math.cos(s.angle + a) * 145,
          s.y + Math.sin(s.angle + a) * 145,
        );
        ctx.stroke();
      }
    }
    ctx.save();
    ctx.translate(s.x, s.y);
    if (map.mode === "racing") {
      ctx.rotate(s.angle);
      ctx.fillStyle = "#0b1012";
      ctx.fillRect(-13, -10, 24, 20);
      ctx.fillStyle = c;
      ctx.fillRect(-13, -7, 27, 14);
      ctx.fillStyle = "#1e3430";
      ctx.fillRect(1, -5, 7, 10);
      ctx.fillStyle = "#e9f5d6";
      ctx.fillRect(12, -5, 2, 3);
      ctx.fillRect(12, 2, 2, 3);
    } else {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#27342f";
      ctx.beginPath();
      ctx.arc(4, -3, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (options.collision) {
      ctx.strokeStyle = s.collision ? "#ef8c80" : "#e9f5d6";
      ctx.strokeRect(-14, -11, 28, 22);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };
  if (options.ghost && ghost) agent(ghost, "#bac6c9", 0.25);
  if (options.all) snapshot?.population.forEach((s) => agent(s, color, 0.16));
  if (snapshot) agent(snapshot.state, color);
  else
    agent(
      {
        ...map.start,
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
      },
      color,
    );
}
export function World({
  map,
  snapshot,
  options,
  editing = false,
  tool = "select",
  onChange,
  selected,
  onSelect,
  zoom = 1,
  color = "#a7e879",
  ghost,
  animate = false,
}: {
  map: TrackMap;
  snapshot?: Snapshot;
  options: ViewOptions;
  editing?: boolean;
  tool?: Tool;
  onChange?: (map: TrackMap) => void;
  selected?: string;
  onSelect?: (id: string) => void;
  zoom?: number;
  color?: string;
  ghost?: AgentState;
  animate?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    drag = useRef<{ point: Point; map: TrackMap; id?: string } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const replay = useRef<{
    map: TrackMap;
    env: Simulator;
    policy: PolicyData;
    algorithm: string;
    endedAt: number;
  } | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let frame = 0,
      previous = performance.now(),
      accumulator = 0,
      lastDraw = 0;
    if (
      snapshot &&
      (!replay.current ||
        replay.current.map !== map ||
        replay.current.algorithm !== snapshot.stats.algorithm)
    ) {
      const env = new Simulator(map, 600);
      env.reset(42);
      replay.current = {
        map,
        env,
        policy: snapshot.policy,
        algorithm: snapshot.stats.algorithm,
        endedAt: 0,
      };
    }
    if (!snapshot) replay.current = null;
    const render = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2),
        r = canvas.getBoundingClientRect();
      if (
        canvas.width !== Math.round(r.width * dpr) ||
        canvas.height !== Math.round(r.height * dpr)
      ) {
        canvas.width = r.width * dpr;
        canvas.height = r.height * dpr;
      }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale =
        Math.min(r.width / map.width, r.height / map.height) * dpr * zoom;
      ctx.setTransform(
        scale,
        0,
        0,
        scale,
        (canvas.width - map.width * scale) / 2 + pan.x * scale,
        (canvas.height - map.height * scale) / 2 + pan.y * scale,
      );
      const visible =
        snapshot && replay.current
          ? { ...snapshot, state: replay.current.env.getState() }
          : snapshot;
      drawWorld(ctx, map, options, visible, color, selected, ghost);
    };
    const tick = (now: number) => {
      const r = replay.current;
      accumulator += Math.min(0.1, (now - previous) / 1000);
      previous = now;
      if (r && snapshot) {
        if (r.env.getState().done) {
          if (!r.endedAt) r.endedAt = now;
          if (now - r.endedAt > 650) {
            r.env.reset(42);
            r.policy = snapshot.policy;
            r.endedAt = 0;
            accumulator = 0;
          }
        } else
          while (accumulator >= 1 / 60) {
            r.env.step(actionOf(r.policy, r.env.observe()));
            accumulator -= 1 / 60;
          }
      }
      if (now - lastDraw >= 1000 / 30) {
        render();
        lastDraw = now;
      }
      frame = requestAnimationFrame(tick);
    };
    render();
    if (snapshot && animate) frame = requestAnimationFrame(tick);
    const ob = new ResizeObserver(render);
    ob.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      ob.disconnect();
    };
  }, [map, snapshot, options, selected, zoom, pan, color, ghost, animate]);
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect(),
      scale = Math.min(r.width / map.width, r.height / map.height) * zoom;
    return {
      x:
        (e.clientX - r.left - (r.width - map.width * scale) / 2) / scale -
        pan.x,
      y:
        (e.clientY - r.top - (r.height - map.height * scale) / 2) / scale -
        pan.y,
    };
  }
  const snap = (p: Point) => ({
    x: Math.round(p.x / 10) * 10,
    y: Math.round(p.y / 10) * 10,
  });
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!editing && tool !== "pan") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === "pan") {
      drag.current = { point: p, map: structuredClone(map) };
      return;
    }
    const m = structuredClone(map);
    const hit = [...m.objects]
      .reverse()
      .find(
        (o) => p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h,
      );
    if (tool === "select") {
      onSelect?.(hit?.id ?? "");
      if (hit) drag.current = { point: p, map: m, id: hit.id };
      return;
    }
    if (tool === "erase") {
      if (hit) {
        m.objects = m.objects.filter((o) => o.id !== hit.id);
        onChange?.(m);
      }
      return;
    }
    if (tool === "road") {
      m.road = [p];
      m.checkpoints = [];
      drag.current = { point: p, map: m };
      onChange?.(m);
      return;
    }
    if (tool === "start") m.start = { ...snap(p), angle: m.start.angle };
    else if (tool === "goal") m.goal = snap(p);
    else if (tool === "checkpoint") m.checkpoints.push(snap(p));
    else {
      const o: MapObject = {
        ...snap(p),
        id: crypto.randomUUID(),
        kind: tool as MapObject["kind"],
        w: tool === "wall" ? 35 : 100,
        h: tool === "wall" ? 100 : tool === "spike" ? 24 : 20,
        ...(tool === "moving" ? { amplitude: 60, period: 3 } : {}),
      };
      m.objects.push(o);
      onSelect?.(o.id);
    }
    onChange?.(m);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drag.current) return;
    const p = point(e),
      d = drag.current;
    if (tool === "pan") {
      setPan((prev) => ({
        x: prev.x + p.x - d.point.x,
        y: prev.y + p.y - d.point.y,
      }));
      return;
    }
    if (tool === "road") {
      if (Math.hypot(p.x - d.point.x, p.y - d.point.y) > 25) {
        d.map.road.push(p);
        d.point = p;
        onChange?.(structuredClone(d.map));
      }
    } else if (d.id) {
      const m = structuredClone(d.map),
        o = m.objects.find((o) => o.id === d.id)!;
      o.x += Math.round((p.x - d.point.x) / 10) * 10;
      o.y += Math.round((p.y - d.point.y) / 10) * 10;
      onChange?.(m);
    }
  }
  function up() {
    const d = drag.current;
    if (d && tool === "road" && d.map.road.length > 1) {
      const m = structuredClone(d.map);
      m.start = {
        ...m.road[0],
        angle: Math.atan2(m.road[1].y - m.road[0].y, m.road[1].x - m.road[0].x),
      };
      m.goal = m.road.at(-1)!;
      m.checkpoints = m.road.filter(
        (_, i) => i > 0 && (i % 3 === 0 || i === m.road.length - 1),
      );
      onChange?.(m);
    }
    drag.current = null;
  }
  return (
    <canvas
      ref={ref}
      className={"world " + (editing ? "editing" : "")}
      aria-label={editing ? "맵 편집 캔버스" : "AI 시뮬레이션 캔버스"}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  );
}
