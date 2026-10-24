import { useEffect, useRef, useState } from "react";
import {
  anchorViewport,
  baseScale,
  eraseAt,
  FIT_VIEW,
  hitSelections,
  transformHandles,
  transformSelection,
  type TransformHandle,
  selectionKey,
  moveSelection,
  removeSelection,
  worldPoint,
  zoomAt,
  type Selection,
  type Viewport,
} from "../core/editor";
import type {
  AgentState,
  MapObject,
  Point,
  PolicyData,
  Snapshot,
  TrackMap,
} from "../core/types";
import { objectPosition, Simulator } from "../core/environment";
import { gateAt, gateEnds } from "../core/geometry";
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
  populationMode?: "all" | "alive" | "best";
  selectedAgent?: number;
}
export function drawWorld(
  ctx: CanvasRenderingContext2D,
  map: TrackMap,
  options: ViewOptions,
  snapshot?: Snapshot,
  color = "#83a78c",
  selected?: Selection | null,
  ghost?: AgentState,
  stateOverride?: AgentState,
  editing = false,
  hidden: ReadonlySet<string> = new Set(),
  light = false,
  unit = 1,
  seed = 42,
) {
  const w = map.width,
    h = map.height;
  const state =
    stateOverride ??
    (snapshot?.live && options.selectedAgent !== undefined
      ? snapshot.population[options.selectedAgent]
      : snapshot?.state);
  ctx.fillStyle = light ? "#f7f8f6" : "#171c21";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = light ? "#e6e9e4" : "#242c32";
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
  if (map.mode === "racing" && map.road.length && !hidden.has("road")) {
    const path = () => {
      ctx.beginPath();
      map.road.forEach((p, i) =>
        i && !map.draft?.roadBreaks?.includes(i)
          ? ctx.lineTo(p.x, p.y)
          : ctx.moveTo(p.x, p.y),
      );
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    path();
    ctx.strokeStyle = light ? "#adb8ad" : "#53615f";
    ctx.lineWidth = map.roadWidth + 7;
    ctx.stroke();
    path();
    ctx.strokeStyle = light ? "#d9e0d6" : "#2a3438";
    ctx.lineWidth = map.roadWidth;
    ctx.stroke();
    path();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#5b6867";
    ctx.setLineDash([9, 11]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (map.mode === "racing") {
    map.checkpoints.forEach((p, i) => {
      if (hidden.has("checkpoint:" + i)) return;
      if (map.environmentVersion !== 2) {
        ctx.strokeStyle = light ? "#849b8d" : "#b6c6c066";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(
          p.x,
          p.y,
          Math.max(24, Math.min(45, map.roadWidth * 0.35)),
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = light ? "#50685a" : "#96a8a5";
        ctx.font = "10px monospace";
        ctx.fillText(String(i + 1), p.x + 8, p.y - 10);
        return;
      }
      const g = gateAt(map, i),
        [a, b] = gateEnds(g);
      ctx.strokeStyle =
        i < (state?.checkpoint ?? 0)
          ? "#83a78c"
          : light
            ? "#849b8d"
            : "#b6c6c066";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.angle);
      ctx.beginPath();
      ctx.moveTo(7, -4);
      ctx.lineTo(13, 0);
      ctx.lineTo(7, 4);
      ctx.stroke();
      ctx.restore();
      ctx.font = "10px monospace";
      ctx.fillStyle = light ? "#50685a" : "#96a8a5";
      ctx.fillText(String(i + 1).padStart(2, "0"), p.x + 8, p.y - 10);
    });
  }
  map.objects.forEach((original) => {
    if (hidden.has("object:" + original.id)) return;
    const o = editing
      ? original
      : objectPosition(
          original,
          (snapshot?.live?.tick ?? state?.steps ?? 0) / 60,
          seed,
        );
    ctx.save();
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    ctx.rotate(o.angle ?? 0);
    ctx.translate(-o.x - o.w / 2, -o.y - o.h / 2);
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
    ctx.strokeStyle =
      selected?.kind === "object" && selected.id === o.id
        ? light
          ? "#275e46"
          : "#e9ecef"
        : "#a3b0b6";
    ctx.lineWidth = selected?.kind === "object" && selected.id === o.id ? 3 : 1;
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
    ctx.restore();
  });
  if (!map.draft?.missingStart && !hidden.has("start")) {
    ctx.strokeStyle = light ? "#557d62" : "#91b59a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(map.start.x, map.start.y, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = light ? "#386349" : "#b2cbb8";
    ctx.font = "10px monospace";
    ctx.fillText("START", map.start.x - 16, map.start.y + 31);
  }
  if (!map.draft?.missingGoal && !hidden.has("goal")) {
    ctx.fillStyle = "#83a78c20";
    ctx.fillRect(map.goal.x - 18, map.goal.y - 24, 36, 48);
    ctx.strokeStyle = light ? "#557d62" : "#91b59a";
    ctx.strokeRect(map.goal.x - 18, map.goal.y - 24, 36, 48);
    ctx.fillStyle = light ? "#386349" : "#b2cbb8";
    ctx.fillText("FINISH", map.goal.x - 17, map.goal.y + 40);
  }
  if (editing) {
    map.road.forEach((p, i) => {
      if (hidden.has("road")) return;
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        selected?.kind === "road" && selected.index === i ? 7 : 3,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle =
        selected?.kind === "road" && selected.index === i
          ? light
            ? "#275e46"
            : "#e5ece7"
          : "#8d9ba1";
      ctx.fill();
    });
    if (selected && !hidden.has(selectionKey(selected))) {
      const p =
        selected.kind === "checkpoint"
          ? undefined
          : selected.kind === "start"
            ? map.start
            : selected.kind === "goal"
              ? map.goal
              : undefined;
      if (p) {
        ctx.strokeStyle = light ? "#275e46" : "#e5ece7";
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 21, p.y - 21, 42, 42);
      }
    }
  }
  if (editing && selected && !hidden.has(selectionKey(selected))) {
    const handles = transformHandles(map, selected, unit);
    ctx.strokeStyle = light ? "#275e46" : "#c2dfce";
    ctx.lineWidth = 1.5 * unit;
    ctx.setLineDash([4 * unit, 3 * unit]);
    const corners = handles.filter((h) => h.kind !== "rotate");
    if (corners.length) {
      ctx.beginPath();
      corners.forEach((h, i) =>
        i ? ctx.lineTo(h.point.x, h.point.y) : ctx.moveTo(h.point.x, h.point.y),
      );
      if (corners.length === 4) ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const h of handles) {
      ctx.beginPath();
      ctx.arc(h.point.x, h.point.y, 5 * unit, 0, Math.PI * 2);
      ctx.fillStyle = h.kind === "rotate" ? "#376a50" : "#fff";
      ctx.fill();
      ctx.stroke();
    }
  }
  const agent = (s: AgentState, c: string, alpha = 1, details = true) => {
    ctx.globalAlpha = alpha;
    if (details && options.trail && s.trail.length) {
      ctx.beginPath();
      s.trail.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (details && options.sensors && map.mode === "racing") {
      ctx.strokeStyle = c + "38";
      ctx.lineWidth = 1;
      for (const [index, a] of [
        -1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35,
      ].entries()) {
        const length = (s.sensors?.[index] ?? 145 / 180) * 180;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(
          s.x + Math.cos(s.angle + a) * length,
          s.y + Math.sin(s.angle + a) * length,
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
  if (snapshot?.live) {
    const leader = snapshot.live.leader,
      selected = options.selectedAgent ?? leader;
    const order = snapshot.population
      .map((_, i) => i)
      .sort(
        (a, b) =>
          (a === selected ? 2 : a === leader ? 1 : 0) -
          (b === selected ? 2 : b === leader ? 1 : 0),
      );
    order.forEach((i) => {
      const s = snapshot.population[i];
      if (options.populationMode === "alive" && s.done) return;
      if (options.populationMode === "best" && i !== leader) return;
      agent(
        s,
        s.success
          ? "#479c70"
          : s.collision
            ? "#bd7a72"
            : i === leader
              ? "#c39547"
              : color,
        s.collision ? 0.28 : i === leader || i === selected ? 1 : 0.8,
        i === selected,
      );
      if (i === leader) {
        ctx.strokeStyle = "#ba8a32";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 24, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (i === selected) {
        ctx.strokeStyle = light ? "#254f3a" : "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 20, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  } else {
    if (options.all)
      snapshot?.population.forEach((s) => agent(s, color, 0.55, false));
    if (state) agent(state, color);
  }
  if (!state && !snapshot?.live && !editing && !map.draft?.missingStart)
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
  viewport,
  onViewportChange,
  color = "#83a78c",
  ghost,
  animate = false,
  interactive = false,
  overview = false,
  eraserSize = 22,
  testing = false,
  follow = false,
  onNavigate,
  seed = 42,
  horizon = 600,
  onTestState,
  manualAction = -1,
  hidden = new Set<string>(),
  lockedLayers = new Set<string>(),
  onCursor,
  roadAppend = true,
  keyboardDelete = true,
  onAgentSelect,
}: {
  map: TrackMap;
  snapshot?: Snapshot;
  options: ViewOptions;
  editing?: boolean;
  tool?: Tool;
  onChange?: (map: TrackMap, transaction?: string) => void;
  selected?: Selection | null;
  onSelect?: (selection: Selection | null) => void;
  viewport?: Viewport;
  onViewportChange?: (view: Viewport) => void;
  color?: string;
  ghost?: AgentState;
  animate?: boolean;
  interactive?: boolean;
  overview?: boolean;
  eraserSize?: number;
  testing?: boolean;
  follow?: boolean;
  onNavigate?: () => void;
  seed?: number;
  horizon?: number;
  onTestState?: (state: AgentState) => void;
  manualAction?: number;
  zoom?: number;
  hidden?: ReadonlySet<string>;
  lockedLayers?: ReadonlySet<string>;
  onCursor?: (p: Point) => void;
  roadAppend?: boolean;
  keyboardDelete?: boolean;
  onAgentSelect?: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    miniRef = useRef<HTMLCanvasElement>(null);
  const [internalView, setInternalView] = useState<Viewport>(FIT_VIEW);
  const view = viewport ?? internalView;
  const latest = useRef({
    map,
    snapshot,
    options,
    selected,
    view,
    color,
    ghost,
    editing,
    testing,
    follow,
    seed,
    horizon,
    onTestState,
    manualAction,
    hidden,
  });
  latest.current = {
    map,
    snapshot,
    options,
    selected,
    view,
    color,
    ghost,
    editing,
    testing,
    follow,
    seed,
    horizon,
    onTestState,
    manualAction,
    hidden,
  };
  const renderRef = useRef<() => void>(() => {}),
    camera = useRef(view),
    hovered = useRef(false),
    space = useRef(false),
    keys = useRef(new Set<string>());
  const pointers = useRef(new Map<number, Point>()),
    pinch = useRef<{ distance: number; anchor: Point; view: Viewport } | null>(
      null,
    );
  const drag = useRef<{
    kind: "pan" | "road" | "erase" | "move" | "place" | "transform";
    point: Point;
    screen: Point;
    map: TrackMap;
    view: Viewport;
    transaction: string;
    selection?: Selection;
    protectedLayers?: Set<string>;
    before?: TrackMap;
    changed?: boolean;
    handle?: TransformHandle;
  } | null>(null);
  const replay = useRef<{
    mapId: string;
    algorithm: string;
    env: Simulator;
    policy?: PolicyData;
    endedAt: number;
  } | null>(null);
  const brush = useRef<Point | null>(null);
  useEffect(() => {
    drag.current = null;
    pointers.current.clear();
    pinch.current = null;
  }, [map.id]);
  const updateView = (next: Viewport) => {
    camera.current = next;
    onNavigate?.();
    if (onViewportChange) onViewportChange(next);
    else setInternalView(next);
  };
  const frame = () => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { width: r.width, height: r.height };
  };
  const screen = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const point = (e: { clientX: number; clientY: number }) =>
    worldPoint(screen(e), map, frame(), camera.current);
  const snapped = (p: Point) => ({
    x: Math.round(p.x / 10) * 10,
    y: Math.round(p.y / 10) * 10,
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0,
      last = performance.now(),
      accumulator = 0,
      lastDraw = 0,
      lastReport = 0;
    const ensureReplay = () => {
      const p = latest.current,
        algorithm = p.testing
          ? "manual"
          : p.snapshot?.live
            ? undefined
            : p.snapshot?.stats.algorithm;
      if (!algorithm) {
        replay.current = null;
        return;
      }
      if (
        !replay.current ||
        replay.current.mapId !== p.map.id ||
        replay.current.algorithm !== algorithm
      ) {
        const env = new Simulator(p.map, p.horizon);
        env.reset(p.seed);
        replay.current = {
          mapId: p.map.id,
          algorithm,
          env,
          policy: p.snapshot?.policy,
          endedAt: 0,
        };
      }
    };
    const draw = () => {
      const p = latest.current,
        r = canvas.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2);
      if (!r.width || !r.height) return;
      if (
        canvas.width !== Math.round(r.width * dpr) ||
        canvas.height !== Math.round(r.height * dpr)
      ) {
        canvas.width = r.width * dpr;
        canvas.height = r.height * dpr;
      }
      const ctx = canvas.getContext("2d")!;
      const state = p.snapshot?.live
        ? p.snapshot.population[
            p.options.selectedAgent ?? p.snapshot.live.leader
          ]
        : replay.current?.env.getState(true, p.options.sensors);
      const effective =
        p.follow && state
          ? {
              zoom: p.view.zoom,
              pan: {
                x: p.map.width / 2 - state.x,
                y: p.map.height / 2 - state.y,
              },
            }
          : p.view;
      camera.current = effective;
      const scale = baseScale(p.map, r) * effective.zoom * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(
        scale,
        0,
        0,
        scale,
        (canvas.width - p.map.width * scale) / 2 + effective.pan.x * scale,
        (canvas.height - p.map.height * scale) / 2 + effective.pan.y * scale,
      );
      drawWorld(
        ctx,
        p.map,
        p.options,
        p.snapshot,
        p.color,
        p.selected,
        p.ghost,
        p.snapshot?.live ? undefined : state,
        p.editing && !p.testing,
        p.testing ? undefined : p.hidden,
        !!canvas.closest(".light"),
        1 / (baseScale(p.map, r) * effective.zoom),
        p.seed,
      );
      if (p.editing && tool === "erase" && brush.current) {
        ctx.beginPath();
        ctx.arc(brush.current.x, brush.current.y, eraserSize, 0, Math.PI * 2);
        ctx.strokeStyle = "#d6b6a9";
        ctx.lineWidth = 1 / baseScale(p.map, r) / effective.zoom;
        ctx.setLineDash([4 / scale, 4 / scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const mini = miniRef.current;
      if (mini) {
        const c = mini.getContext("2d")!,
          s = Math.min(mini.width / p.map.width, mini.height / p.map.height);
        c.setTransform(s, 0, 0, s, 0, 0);
        drawWorld(
          c,
          p.map,
          {
            sensors: false,
            trail: false,
            collision: false,
            all: false,
            ghost: false,
          },
          undefined,
          "#83a78c",
          null,
          undefined,
          undefined,
          true,
          p.hidden,
          !!canvas.closest(".light"),
        );
        const a = worldPoint({ x: 0, y: 0 }, p.map, r, effective),
          b = worldPoint({ x: r.width, y: r.height }, p.map, r, effective);
        c.fillStyle = "#83a78c15";
        c.strokeStyle = "#d1ddd3";
        c.lineWidth = 1.5 / s;
        c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      }
    };
    renderRef.current = draw;
    ensureReplay();
    draw();
    const tick = (now: number) => {
      const p = latest.current;
      ensureReplay();
      const r = replay.current;
      accumulator += Math.min(0.1, (now - last) / 1000);
      last = now;
      if (r) {
        if (r.env.getState().done) {
          if (!r.endedAt) r.endedAt = now;
          if (!p.testing && now - r.endedAt > 650) {
            r.env.reset(p.seed);
            r.policy = p.snapshot?.policy;
            r.endedAt = 0;
            accumulator = 0;
          }
        } else {
          while (accumulator >= 1 / 60) {
            let action = 4;
            if (p.testing) {
              const left =
                  keys.current.has("ArrowLeft") || keys.current.has("KeyA"),
                right =
                  keys.current.has("ArrowRight") || keys.current.has("KeyD"),
                jump =
                  keys.current.has("Space") ||
                  keys.current.has("ArrowUp") ||
                  keys.current.has("KeyW");
              action =
                p.map.mode === "racing"
                  ? left
                    ? 1
                    : right
                      ? 2
                      : keys.current.has("ArrowDown")
                        ? 3
                        : jump
                          ? 0
                          : 4
                  : jump
                    ? left
                      ? 4
                      : right
                        ? 5
                        : 3
                    : left
                      ? 1
                      : right
                        ? 2
                        : 0;
              if (p.manualAction >= 0) action = p.manualAction;
            } else if (r.policy) action = actionOf(r.policy, r.env.observe());
            r.env.step(action);
            accumulator -= 1 / 60;
          }
        }
        if (p.testing && now - lastReport > 120) {
          p.onTestState?.(r.env.getState());
          lastReport = now;
        }
      }
      if (now - lastDraw >= 1000 / 30) {
        draw();
        lastDraw = now;
      }
      raf = requestAnimationFrame(tick);
    };
    if ((animate && snapshot) || testing) raf = requestAnimationFrame(tick);
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }, [
    map.id,
    map.mode,
    !!snapshot,
    snapshot?.stats.algorithm,
    animate,
    testing,
    tool,
    eraserSize,
  ]);
  useEffect(() => {
    renderRef.current();
  }, [
    map,
    snapshot,
    options,
    selected,
    view,
    color,
    ghost,
    follow,
    overview,
    hidden,
  ]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !interactive) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const local = screen(e);
      updateView(
        zoomAt(
          camera.current,
          local,
          latest.current.map,
          frame(),
          camera.current.zoom *
            Math.exp(-e.deltaY * (e.ctrlKey ? 0.008 : 0.0018)),
        ),
      );
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, [interactive, map.id, onViewportChange]);
  useEffect(() => {
    if (!interactive) return;
    const down = (e: KeyboardEvent) => {
      const focused = document.activeElement === canvasRef.current;
      if (!focused && !hovered.current) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (
        ["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          e.code,
        )
      ) {
        e.preventDefault();
        keys.current.add(e.code);
        if (e.code === "Space") space.current = true;
      }
      if (
        keyboardDelete &&
        editing &&
        !testing &&
        focused &&
        (e.code === "Delete" || e.code === "Backspace") &&
        latest.current.selected
      ) {
        e.preventDefault();
        onChange?.(
          removeSelection(latest.current.map, latest.current.selected),
        );
        onSelect?.(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      if (e.code === "Space") space.current = false;
    };
    const blur = () => {
      keys.current.clear();
      space.current = false;
      cancel();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [interactive, editing, testing, onChange, onSelect, keyboardDelete]);
  useEffect(() => {
    const app = canvasRef.current?.closest(".app");
    if (!app) return;
    const observer = new MutationObserver(() => renderRef.current());
    observer.observe(app, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  function beginPinch() {
    const a = [...pointers.current.values()];
    const center = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
    pinch.current = {
      distance: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y),
      anchor: worldPoint(center, map, frame(), camera.current),
      view: camera.current,
    };
    drag.current = null;
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!interactive) return;
    if (![0, 1, 2].includes(e.button)) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, screen(e));
    if (pointers.current.size === 2) {
      const pending = drag.current;
      if (pending?.changed)
        onChange?.(pending.before ?? pending.map, pending.transaction);
      beginPinch();
      return;
    }
    if (testing) return;
    const p = point(e),
      s = screen(e),
      transaction = crypto.randomUUID(),
      initial = structuredClone(map);
    if (e.button !== 0 && drag.current?.kind !== "pan") drag.current = null;
    if (
      !editing ||
      tool === "pan" ||
      space.current ||
      e.button === 1 ||
      e.button === 2
    ) {
      e.currentTarget.classList.add("panning");
      drag.current = {
        kind: "pan",
        point: p,
        screen: s,
        map: initial,
        view: camera.current,
        transaction,
      };
      return;
    }
    const unit = 1 / baseScale(map, frame()) / view.zoom;
    if (
      selected &&
      !hidden.has(selectionKey(selected)) &&
      !lockedLayers.has(selectionKey(selected))
    ) {
      const handle = transformHandles(map, selected, unit).find(
        (h) => Math.hypot(h.point.x - p.x, h.point.y - p.y) < 9 * unit,
      );
      if (handle) {
        drag.current = {
          kind: "transform",
          point: p,
          screen: s,
          map: initial,
          view: camera.current,
          transaction,
          selection: selected,
          handle: handle.kind,
        };
        return;
      }
    }
    const hits = hitSelections(map, p, 14 * unit)
      .filter(
        (h) =>
          !hidden.has(selectionKey(h)) && !lockedLayers.has(selectionKey(h)),
      )
      .filter(
        (h) =>
          h.kind !== "road" ||
          tool === "select" ||
          (tool === "road" &&
            Math.hypot(map.road[h.index].x - p.x, map.road[h.index].y - p.y) <
              14 * unit),
      );
    if (tool === "select" || (tool !== "erase" && hits.length)) {
      const previous =
        tool === "select"
          ? hits.findIndex(
              (h) => JSON.stringify(h) === JSON.stringify(selected),
            )
          : -1;
      const hit = hits.length ? hits[(previous + 1) % hits.length] : null;
      onSelect?.(hit);
      drag.current = {
        kind: hit ? "move" : "pan",
        point: p,
        screen: s,
        map: initial,
        view: camera.current,
        transaction,
        selection: hit ?? undefined,
      };
      return;
    }
    if (tool === "erase") {
      const protectedLayers = new Set([...hidden, ...lockedLayers]);
      map.checkpoints.forEach((q, i) => {
        if (protectedLayers.delete("checkpoint:" + i))
          protectedLayers.add(`checkpoint-at:${q.x}:${q.y}`);
      });
      const m = eraseAt(initial, p, eraserSize, protectedLayers);
      onSelect?.(null);
      drag.current = {
        kind: "erase",
        point: p,
        screen: s,
        map: m,
        view: camera.current,
        transaction,
        protectedLayers,
        before: initial,
        changed: true,
      };
      onChange?.(m, transaction);
      return;
    }
    if (tool === "road") {
      if (hidden.has("road") || lockedLayers.has("road")) return;
      const m = {
        ...initial,
        road: roadAppend ? [...initial.road, p] : [p],
        checkpoints: initial.checkpoints,
        draft: roadAppend
          ? { ...initial.draft }
          : { missingStart: true, missingGoal: true, roadBreaks: [] },
      };
      drag.current = {
        kind: "road",
        before: initial,
        changed: true,
        point: p,
        screen: s,
        map: m,
        view: camera.current,
        transaction,
      };
      onSelect?.(null);
      onChange?.(m, transaction);
      return;
    }
    const m = structuredClone(initial);
    if (tool === "start") {
      m.start = { ...snapped(p), angle: m.start.angle };
      m.draft = { ...m.draft, missingStart: false };
      onSelect?.({ kind: "start" });
    } else if (tool === "goal") {
      m.goal = snapped(p);
      m.draft = { ...m.draft, missingGoal: false };
      onSelect?.({ kind: "goal" });
    } else if (tool === "checkpoint") {
      const prev = m.checkpoints.at(-1) ?? m.start;
      m.checkpoints.push({
        ...snapped(p),
        id: crypto.randomUUID(),
        width: m.roadWidth * 0.8,
        angle: Math.atan2(p.y - prev.y, p.x - prev.x),
        order: m.checkpoints.length,
        directional: true,
      });
      onSelect?.({ kind: "checkpoint", index: m.checkpoints.length - 1 });
    } else {
      const o: MapObject = {
        ...snapped(p),
        id: crypto.randomUUID(),
        kind: tool as MapObject["kind"],
        w: tool === "wall" ? 35 : 100,
        h: tool === "wall" ? 100 : tool === "spike" ? 24 : 20,
        ...(tool === "moving" ? { amplitude: 60, period: 3 } : {}),
      };
      m.objects.push(o);
      onSelect?.({ kind: "object", id: o.id });
    }
    drag.current = {
      kind: "place",
      point: p,
      screen: s,
      map: m,
      before: initial,
      changed: true,
      view: camera.current,
      transaction,
    };
    onChange?.(m, transaction);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!interactive) return;
    const s = screen(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, s);
    const two = [...pointers.current.values()];
    if (two.length === 2 && pinch.current) {
      const g = pinch.current,
        zoom = Math.max(
          0.4,
          Math.min(
            4,
            (g.view.zoom *
              Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y)) /
              g.distance,
          ),
        );
      updateView(
        anchorViewport(
          g.anchor,
          { x: (two[0].x + two[1].x) / 2, y: (two[0].y + two[1].y) / 2 },
          map,
          frame(),
          zoom,
        ),
      );
      return;
    }
    const p = point(e);
    brush.current = p;
    onCursor?.(p);
    if (tool === "erase") renderRef.current();
    const d = drag.current;
    if (!d) {
      const unit = 1 / baseScale(map, frame()) / view.zoom;
      const handle = transformHandles(map, selected ?? null, unit).find(
        (h) => Math.hypot(h.point.x - p.x, h.point.y - p.y) < 9 * unit,
      );
      const movable =
        tool !== "erase" &&
        hitSelections(map, p, 10 * unit).some(
          (h) =>
            h.kind !== "road" &&
            !hidden.has(selectionKey(h)) &&
            !lockedLayers.has(selectionKey(h)),
        );
      e.currentTarget.style.cursor = handle
        ? handle.kind === "rotate"
          ? "crosshair"
          : handle.kind === "nw" || handle.kind === "se"
            ? "nwse-resize"
            : "nesw-resize"
        : movable
          ? "move"
          : tool === "pan"
            ? "grab"
            : tool === "select"
              ? "default"
              : "crosshair";
      return;
    }
    if (d.kind === "pan") {
      const scale = baseScale(map, frame()) * d.view.zoom;
      updateView({
        ...d.view,
        pan: {
          x: d.view.pan.x + (s.x - d.screen.x) / scale,
          y: d.view.pan.y + (s.y - d.screen.y) / scale,
        },
      });
    } else if (d.kind === "road") {
      if (Math.hypot(p.x - d.point.x, p.y - d.point.y) > 12) {
        d.map.road.push(p);
        d.point = p;
        onChange?.(structuredClone(d.map), d.transaction);
      }
    } else if (d.kind === "erase") {
      d.map = eraseAt(d.map, p, eraserSize, d.protectedLayers);
      onChange?.(d.map, d.transaction);
    } else if (d.kind === "transform" && d.selection && d.handle) {
      d.changed = true;
      onChange?.(
        transformSelection(d.map, d.selection, d.handle, p, e.shiftKey),
        d.transaction,
      );
    } else if (d.selection) {
      d.changed = true;
      onChange?.(
        moveSelection(
          d.map,
          d.selection,
          snapped({ x: p.x - d.point.x, y: p.y - d.point.y }),
        ),
        d.transaction,
      );
    }
  }
  function finish() {
    const d = drag.current;
    if (d?.kind === "road") {
      const m = structuredClone(d.map);
      if (m.road.length > 1) {
        if (!roadAppend || m.draft?.missingStart)
          m.start = {
            ...m.road[0],
            angle: Math.atan2(
              m.road[1].y - m.road[0].y,
              m.road[1].x - m.road[0].x,
            ),
          };
        if (!roadAppend || m.draft?.missingGoal) m.goal = m.road.at(-1)!;
        m.draft = { roadBreaks: m.draft?.roadBreaks ?? [] };
        onChange?.(m, d.transaction);
      } else onChange?.(m, d.transaction);
    }
    drag.current = null;
  }
  function cancel() {
    const d = drag.current;
    if (d?.changed) onChange?.(d.before ?? d.map, d.transaction);
    drag.current = null;
    pointers.current.clear();
    pinch.current = null;
    canvasRef.current?.classList.remove("panning");
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current,
      live = latest.current.snapshot?.live;
    if (
      !editing &&
      live &&
      d?.kind === "pan" &&
      Math.hypot(screen(e).x - d.screen.x, screen(e).y - d.screen.y) < 5
    ) {
      const p = point(e);
      let nearest = -1,
        best = 22 / baseScale(map, frame()) / view.zoom;
      latest.current.snapshot!.population.forEach((s, i) => {
        const distance = Math.hypot(s.x - p.x, s.y - p.y);
        if (distance < best) {
          best = distance;
          nearest = i;
        }
      });
      if (nearest >= 0) onAgentSelect?.(nearest);
    }
    e.currentTarget.classList.remove("panning");
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      drag.current = null;
    } else finish();
  }
  return (
    <div className="world-frame">
      <canvas
        ref={canvasRef}
        className={"world " + (editing ? "editing tool-" + tool : "")}
        aria-label={editing ? "맵 편집 캔버스" : "AI 시뮬레이션 캔버스"}
        tabIndex={interactive ? 0 : undefined}
        data-generation={snapshot?.live?.generation}
        data-live-tick={snapshot?.live?.tick}
        data-live-count={snapshot?.population.length}
        data-live-positions={
          snapshot?.live
            ? snapshot.population
                .map(
                  (s) =>
                    `${s.x.toFixed(2)},${s.y.toFixed(2)},${s.steps},${+s.done}`,
                )
                .join(";")
            : undefined
        }
        data-zoom={view.zoom.toFixed(3)}
        data-pan-x={view.pan.x.toFixed(2)}
        data-pan-y={view.pan.y.toFixed(2)}
        onPointerEnter={() => {
          hovered.current = true;
        }}
        onPointerLeave={() => {
          hovered.current = false;
          brush.current = null;
          renderRef.current();
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={() => interactive && updateView(FIT_VIEW)}
      />
      {overview && (
        <button
          type="button"
          className="overview"
          aria-label="미니맵에서 위치 이동"
          title="클릭하여 이동 · 전체 지도의 현재 보기 영역"
          onPointerDown={(e) => {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect(),
              p = {
                x: ((e.clientX - r.left) / r.width) * map.width,
                y: ((e.clientY - r.top) / r.height) * map.height,
              };
            updateView({
              zoom: camera.current.zoom,
              pan: { x: map.width / 2 - p.x, y: map.height / 2 - p.y },
            });
          }}
        >
          <canvas ref={miniRef} width={160} height={102} />
          <span>전체 지도</span>
        </button>
      )}
    </div>
  );
}
