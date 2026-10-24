import type { TrackMap } from "../core/types";
import { demonstrate } from "../core/demonstrations";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Simulator } from "../core/environment";
import { EXAMPLE_MAPS } from "../core/maps";
import { drawWorld } from "./World";

const cache = new Map<string, number[]>();
export function HeroDemo({
  map: provided,
  compact = false,
}: {
  map?: TrackMap;
  compact?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(
    () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const el = canvas.current!;
    const map = provided ?? EXAMPLE_MAPS[0],
      env = new Simulator(map, 600);
    let frame = 0,
      last = performance.now(),
      accumulator = 0,
      attempt = 0,
      ended = 0,
      visible = true;
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    });
    observer.observe(el);
    const draw = () => {
      const r = el.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2),
        scale = Math.min(r.width / map.width, r.height / map.height) * dpr;
      el.width = r.width * dpr;
      el.height = r.height * dpr;
      const ctx = el.getContext("2d")!;
      ctx.setTransform(
        scale,
        0,
        0,
        scale,
        (el.width - map.width * scale) / 2,
        (el.height - map.height * scale) / 2,
      );
      drawWorld(
        ctx,
        map,
        {
          sensors: false,
          trail: true,
          collision: false,
          all: false,
          ghost: false,
        },
        undefined,
        "#578a6b",
        null,
        undefined,
        env.getState(),
        false,
        new Set(),
        !!el.closest(".light"),
      );
      el.dataset.demoX = String(env.getState(false).x);
      el.dataset.demoOutcome = env.done
        ? env.getState().success
          ? "success"
          : "failure"
        : "running";
    };
    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (playing && visible && !document.hidden) {
        if (env.done) {
          if (!ended) {
            ended = now;
          }
          if (now - ended > 650) {
            attempt = (attempt + 1) % 3;
            env.reset(42);
            ended = 0;
            accumulator = 0;
          }
        } else {
          accumulator += delta * 1.5;
          if (compact && !cache.has(map.id))
            cache.set(map.id, demonstrate(map, 2000).actions);
          while (accumulator >= 1 / 60 && !env.done) {
            env.step(
              compact
                ? (cache.get(map.id)?.[env.getState(false).steps] ??
                    (map.mode === "bounce" ? 5 : 0))
                : attempt === 0
                  ? 1
                  : attempt === 1 && env.getState(false).steps < 25
                    ? 1
                    : 0,
            );
            accumulator -= 1 / 60;
          }
        }
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    draw();
    frame = requestAnimationFrame(tick);
    const resize = new ResizeObserver(draw);
    resize.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
    };
  }, [playing, provided, compact]);
  return (
    <div className="hero-demo">
      <canvas
        ref={canvas}
        aria-label={
          compact
            ? `${provided?.name} 애니메이션 프리뷰`
            : "실제 물리 기반 주행 데모"
        }
        data-preview={compact || undefined}
      />
      {!compact && (
        <button
          className="demo-play-toggle icon-btn"
          aria-label={playing ? "데모 일시정지" : "데모 재생"}
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
      )}
    </div>
  );
}
