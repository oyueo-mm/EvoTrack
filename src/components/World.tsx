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
  Snapshot,
  TrackMap,
} from "../core/types";
import { motionAngle, movingPose } from "../core/bounce-v5";
import { objectPosition, Simulator } from "../core/environment";
import { gateAt, gateEnds } from "../core/geometry";
export type Tool =
  | "select"
  | "road"
  | "wall"
  | "platform"
  | "moving"
  | "crumble"
  | "spike"
  | "spring"
  | "elastic"
  | "start"
  | "goal"
  | "checkpoint"
  | "erase"
  | "pan"
  | "bomb"
  | "respawn"
  | "belt"
  | "reward";
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
  previewTime = 0,
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
      if ((map.environmentVersion ?? 1) < 2) {
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
    if (
      hidden.has("object:" + original.id) ||
      (original.kind === "reward" && original.visible === false && !editing)
    )
      return;
    if (
      editing &&
      original.kind === "moving" &&
      selected?.kind === "object" &&
      selected.id === original.id
    ) {
      const a = motionAngle(original),
        amplitude = original.amplitude ?? 50,
        cx = original.x + original.w / 2,
        cy = original.y + original.h / 2;
      ctx.strokeStyle = "#4d9dc2";
      ctx.lineWidth = 2 * unit;
      ctx.setLineDash([7 * unit, 5 * unit]);
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * amplitude, cy - Math.sin(a) * amplitude);
      ctx.lineTo(cx + Math.cos(a) * amplitude, cy + Math.sin(a) * amplitude);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(
          cx + Math.cos(a) * amplitude * sign,
          cy + Math.sin(a) * amplitude * sign,
          5 * unit,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      const pose = movingPose(original, previewTime, seed);
      ctx.fillStyle = "#4d9dc244";
      ctx.fillRect(pose.x, pose.y, original.w, original.h);
    }
    const o = editing
      ? original
      : objectPosition(
          original,
          (snapshot?.live?.tick ?? state?.steps ?? 0) / 60,
          state?.environmentSeed ?? seed,
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
    if (o.kind === "crumble") {
      const entry = state?.platforms?.[o.id],
        t = (state?.steps ?? 0) / 60;
      ctx.fillStyle =
        entry?.collapsedAt !== undefined
          ? "#b78e5322"
          : entry
            ? "#e99c5e"
            : "#c4a170";
      if (entry?.collapsedAt !== undefined)
        ctx.globalAlpha = Math.max(0.08, 1 - (t - entry.collapsedAt) / 0.3);
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = "#684e36";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(o.x + o.w * 0.35, o.y);
      ctx.lineTo(o.x + o.w * 0.5, o.y + o.h * 0.5);
      ctx.lineTo(o.x + o.w * 0.4, o.y + o.h);
      ctx.stroke();
      ctx.setLineDash([]);
      if (entry && entry.collapsedAt === undefined) {
        ctx.fillStyle = "#9b3f2d";
        ctx.fillRect(
          o.x,
          o.y - 4,
          o.w *
            Math.max(0, 1 - (t - entry.triggeredAt) / (o.collapseDelay ?? 0.4)),
          2,
        );
      }
    } else if (o.kind === "belt") {
      ctx.fillStyle = o.beltType === "brake" ? "#d78f5577" : "#55b7a177";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = o.beltType === "brake" ? "#a55b30" : "#287c68";
      ctx.lineWidth = 2;
      for (let x = o.x + 15; x < o.x + o.w - 8; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, o.y + o.h * 0.25);
        ctx.lineTo(x + 10, o.y + o.h * 0.5);
        ctx.lineTo(x, o.y + o.h * 0.75);
        ctx.stroke();
      }
    } else if (o.kind === "reward") {
      ctx.fillStyle = (o.rewardValue ?? 1) < 0 ? "#d36c6633" : "#e3be4e33";
      ctx.strokeStyle = (o.rewardValue ?? 1) < 0 ? "#b44545" : "#aa8724";
      ctx.setLineDash([6, 4]);
      if (o.rewardShape === "gate") {
        ctx.beginPath();
        ctx.moveTo(o.x + o.w / 2, o.y);
        ctx.lineTo(o.x + o.w / 2, o.y + o.h);
        ctx.stroke();
      } else {
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeRect(o.x, o.y, o.w, o.h);
      }
      ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = "12px sans-serif";
      ctx.fillText(
        `${(o.rewardValue ?? 1) >= 0 ? "+" : ""}${o.rewardValue ?? 1}`,
        o.x + 6,
        o.y + 16,
      );
    } else if (o.kind === "bomb" || o.kind === "respawn") {
      ctx.fillStyle = o.kind === "bomb" ? "#c66b50" : "#4087a2";
      ctx.beginPath();
      ctx.arc(
        o.x + o.w / 2,
        o.y + o.h / 2,
        Math.min(o.w, o.h) / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        o.kind === "bomb" ? "!" : "R",
        o.x + o.w / 2,
        o.y + o.h / 2 + 5,
      );
      ctx.textAlign = "start";
    } else if (o.kind === "spike") {
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
    const pivot =
      selected.kind === "object"
        ? map.objects.find((o) => o.id === selected.id)
        : selected.kind === "checkpoint"
          ? map.checkpoints[selected.index]
          : null;
    if (pivot) {
      const cx = pivot.x + ("w" in pivot ? pivot.w / 2 : 0),
        cy = pivot.y + ("h" in pivot ? pivot.h / 2 : 0);
      ctx.save();
      ctx.strokeStyle = "#8c9c9266";
      ctx.lineWidth = unit;
      ctx.setLineDash([3 * unit, 4 * unit]);
      ctx.beginPath();
      ctx.moveTo(cx - 65 * unit, cy);
      ctx.lineTo(cx + 65 * unit, cy);
      ctx.moveTo(cx, cy - 65 * unit);
      ctx.lineTo(cx, cy + 65 * unit);
      ctx.stroke();
      ctx.fillStyle = light ? "#627165" : "#a4aeb9";
      ctx.font = `${9 * unit}px sans-serif`;
      for (const [a, t] of [
        [0, "0°"],
        [Math.PI / 2, "90°"],
        [Math.PI, "180°"],
        [-Math.PI / 2, "270°"],
      ] as const)
        ctx.fillText(
          t,
          cx + Math.cos(a) * 70 * unit,
          cy + Math.sin(a) * 70 * unit,
        );
      ctx.restore();
    }
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
    if (pivot) {
      ctx.fillStyle = light ? "#275e46" : "#c2dfce";
      ctx.font = `${11 * unit}px sans-serif`;
      ctx.fillText(
        `${Math.round(((pivot.angle ?? 0) * 180) / Math.PI)}°`,
        pivot.x,
        pivot.y - 12 * unit,
      );
    }
    for (const h of handles) {
      ctx.beginPath();
      ctx.arc(
        h.point.x,
        h.point.y,
        (h.kind === "rotate" ? 7 : 5) * unit,
        0,
        Math.PI * 2,
      );
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
  onFrame,
  label,
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
  manualButtons = [],
  respawnToken = 0,
  snapRightAngles = true,
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
  onFrame?: (sequence: number, session?: string) => void;
  label?: string;
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
  manualButtons?: string[];
  respawnToken?: number;
  snapRightAngles?: boolean;
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
    onFrame,
    manualAction,
    manualButtons,
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
    onFrame,
    manualAction,
    manualButtons,
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
    kind: "pan" | "road" | "erase" | "move" | "place" | "transform" | "zoom";
    snapAngle?: number;
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
    const ensureManualTest = () => {
      const p = latest.current,
        algorithm = p.testing ? "manual" : undefined;
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
          endedAt: 0,
        };
      }
    };
    let previewTime = 0;
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
      const state = p.snapshot
        ? (p.snapshot.population[
            p.options.selectedAgent ?? p.snapshot.live?.leader ?? 0
          ] ?? p.snapshot.state)
        : replay.current?.env.getState(true, p.options.sensors);
      if (p.testing && state) {
        canvas.dataset.testSpeed = String(state.speed);
        canvas.dataset.testAngle = String(state.angle);
        canvas.dataset.testRespawns = String(state.respawns ?? 0);
        canvas.dataset.testX = String(state.x);
        canvas.dataset.testY = String(state.y);
      }
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
        previewTime,
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
      if (drag.current?.snapAngle !== undefined) {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#356c54";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText(
          `${Math.round((drag.current.snapAngle * 180) / Math.PI)}° · 자석 스냅`,
          18,
          80,
        );
        ctx.restore();
      }
      if (p.snapshot?.sequence) {
        const sequence = p.snapshot.sequence,
          session = p.snapshot.session;
        requestAnimationFrame(() =>
          latest.current.onFrame?.(sequence, session),
        );
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
    ensureManualTest();
    draw();
    const tick = (now: number) => {
      const p = latest.current;
      if (p.editing && !document.hidden) previewTime = now / 1000;
      ensureManualTest();
      const r = replay.current;
      accumulator += Math.min(0.1, (now - last) / 1000);
      last = now;
      if (r) {
        if (r.env.getState().done) {
          if (!r.endedAt) r.endedAt = now;
          if (p.testing && !r.env.getState().success && now - r.endedAt > 180) {
            r.env.respawn();
            r.endedAt = 0;
            accumulator = 0;
          }
        } else {
          while (accumulator >= 1 / 60) {
            if (p.testing) {
              const held = (...codes: string[]) =>
                codes.some(
                  (c) => keys.current.has(c) || p.manualButtons.includes(c),
                );
              r.env.stepManual({
                steer:
                  (held("ArrowRight", "KeyD", "right") ? 1 : 0) -
                  (held("ArrowLeft", "KeyA", "left") ? 1 : 0),
                throttle:
                  (held("ArrowUp", "KeyW", "forward") ? 1 : 0) -
                  (held("ArrowDown", "KeyS", "reverse") ? 1 : 0),
                boost: p.map.mode === "racing" && held("Space", "boost"),
                jump: held("ArrowUp", "KeyW", "jump"),
                drop: held("ArrowDown", "KeyS"),
                brake: p.map.mode === "bounce" && held("Space", "brake"),
              });
            }
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
    if (
      testing ||
      (editing &&
        (tool === "moving" || map.objects.some((o) => o.kind === "moving")))
    )
      raf = requestAnimationFrame(tick);
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
    keys.current.clear();
    if (testing) canvasRef.current?.focus();
  }, [testing]);
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
        [
          "Space",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          ...(testing ? ["KeyA", "KeyD", "KeyW", "KeyS", "KeyR"] : []),
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.current.add(e.code);
        if (testing && e.code === "KeyR") {
          replay.current?.env.respawn();
          if (replay.current) replay.current.endedAt = 0;
        }
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
  useEffect(() => {
    if (testing) {
      replay.current?.env.respawn();
      if (replay.current) replay.current.endedAt = 0;
    }
  }, [respawnToken]);
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
    const unit = 1 / baseScale(map, frame()) / view.zoom;
    if (
      e.button === 0 &&
      selected &&
      !hidden.has(selectionKey(selected)) &&
      !lockedLayers.has(selectionKey(selected))
    ) {
      const handle = transformHandles(map, selected, unit).find(
        (h) => Math.hypot(h.point.x - p.x, h.point.y - p.y) < 14 * unit,
      );
      if (handle) {
        drag.current = {
          kind: "transform",
          before: initial,
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
    if (editing && e.ctrlKey && e.button === 0) {
      drag.current = {
        kind: "zoom",
        point: p,
        screen: s,
        map: initial,
        view: camera.current,
        transaction,
      };
      return;
    }
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
        w:
          tool === "wall"
            ? 35
            : tool === "belt"
              ? 180
              : tool === "reward"
                ? 120
                : 100,
        h:
          tool === "wall"
            ? 100
            : tool === "spike"
              ? 24
              : tool === "belt"
                ? 50
                : tool === "reward"
                  ? 90
                  : 20,
        ...(tool === "moving"
          ? {
              amplitude: 60,
              period: 3,
              ...(map.environmentVersion === 5
                ? { moveAxis: "horizontal" as const, phase: 0 }
                : {}),
            }
          : {}),
        ...(tool === "crumble"
          ? { collapseDelay: 0.4, regenerate: false, restoreDelay: 2 }
          : {}),
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
    if (
      d.kind === "place" &&
      Math.hypot(s.x - d.screen.x, s.y - d.screen.y) > 4
    ) {
      if (d.changed) onChange?.(d.before ?? d.map, d.transaction);
      d.changed = false;
      d.kind = "pan";
    }
    if (d.kind === "zoom") {
      updateView(
        zoomAt(
          d.view,
          d.screen,
          map,
          frame(),
          d.view.zoom * Math.exp((d.screen.y - s.y) * 0.01),
        ),
      );
    } else if (d.kind === "pan") {
      const scale = baseScale(map, frame()) * d.view.zoom;
      updateView({
        ...d.view,
        pan: {
          x: d.view.pan.x + (s.x - d.screen.x) / scale,
          y: d.view.pan.y + (s.y - d.screen.y) / scale,
        },
      });
    } else if (d.kind === "road") {
      const distance = Math.hypot(p.x - d.point.x, p.y - d.point.y);
      if (distance >= 12) {
        const count = Math.ceil(distance / 12),
          origin = d.point;
        for (let i = 1; i <= count; i++)
          d.map.road.push({
            x: origin.x + ((p.x - origin.x) * i) / count,
            y: origin.y + ((p.y - origin.y) * i) / count,
          });
        d.point = p;
        onChange?.(structuredClone(d.map), d.transaction);
      }
    } else if (d.kind === "erase") {
      d.map = eraseAt(d.map, p, eraserSize, d.protectedLayers);
      onChange?.(d.map, d.transaction);
    } else if (d.kind === "transform" && d.selection && d.handle) {
      d.changed = true;
      const transformed = transformSelection(
        d.map,
        d.selection,
        d.handle,
        p,
        e.shiftKey,
        { enabled: snapRightAngles && !e.altKey, previous: d.snapAngle },
      );
      const angle =
        d.selection.kind === "object"
          ? transformed.objects.find(
              (o) => o.id === (d.selection as { id: string }).id,
            )?.angle
          : d.selection.kind === "checkpoint"
            ? transformed.checkpoints[d.selection.index]?.angle
            : undefined;
      d.snapAngle =
        d.handle === "rotate" &&
        snapRightAngles &&
        !e.altKey &&
        angle !== undefined &&
        Math.abs(angle / (Math.PI / 2) - Math.round(angle / (Math.PI / 2))) <
          1e-8
          ? angle
          : undefined;
      e.currentTarget.dataset.angleSnap =
        d.snapAngle === undefined
          ? ""
          : String(Math.round((d.snapAngle * 180) / Math.PI));
      onChange?.(transformed, d.transaction);
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
        aria-label={
          label ?? (editing ? "맵 편집 캔버스" : "AI 시뮬레이션 캔버스")
        }
        tabIndex={interactive ? 0 : undefined}
        data-test-x={
          testing ? replay.current?.env.getState(false).x : undefined
        }
        data-generation={snapshot?.live?.generation}
        data-frame-bytes={snapshot?.runtime?.frameBytes}
        data-actual-tps={snapshot?.runtime?.ticksPerSecond}
        data-training-environments={snapshot?.runtime?.learningEnvironmentCount}
        data-training-phase={snapshot?.runtime?.phase}
        data-environment-id={snapshot?.runtime?.environmentId}
        data-backend={snapshot?.runtime?.backend}
        data-backend-support={JSON.stringify(
          snapshot?.runtime?.backendSupport ?? {},
        )}
        data-env-version={map.environmentVersion ?? 1}
        data-policy-input={snapshot?.policy.input}
        data-platforms={JSON.stringify(snapshot?.state.platforms ?? {})}
        data-training-samples={snapshot?.runtime?.sample}
        data-training-ticks={snapshot?.runtime?.ticks}
        data-rollout={snapshot?.runtime?.rollout}
        data-updates={snapshot?.runtime?.updates}
        data-frame-sequence={snapshot?.sequence}
        data-policy-checksum={snapshot?.debug?.policyChecksum}
        data-training-state={
          snapshot?.debug ? JSON.stringify(snapshot.state) : undefined
        }
        data-transition={
          snapshot?.debug
            ? JSON.stringify(snapshot.debug.transition)
            : undefined
        }
        data-live-traces={
          snapshot?.debug
            ? JSON.stringify(snapshot.population.map((s) => s.trail.length))
            : undefined
        }
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
