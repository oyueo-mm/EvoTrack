import type { PolicyData, TrackMap } from "../core/types";
import { demonstrate } from "../core/demonstrations";
import recordings from "../core/home-recordings.json";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Simulator } from "../core/environment";
import { EXAMPLE_MAPS } from "../core/maps";
import { V05_MAPS } from "../core/v05-maps";
import { actionOf } from "../learning/network";
import { drawWorld } from "./World";
const actionCache = new Map<string, number[]>();
export const HOME_SCENARIOS = [
  "r-straight",
  "b-v5-elevator",
  "r-v5-precision",
  "b-v5-crumble",
  "r-v5-speed",
  "b-v5-mixed",
  "r-v5-obstacles",
  "b-v5-horizontal",
  "r-v5-corners",
  "r-precision-hairpins",
  "r-v5-endurance",
  "b-v5-elastic",
  "r-v5-timing",
  "b-v5-belt",
  "b-jump",
].map((id) => EXAMPLE_MAPS.find((m) => m.id === id)!);

const subscribers = new Set<(time: number) => void>();
let raf = 0,
  last = 0;
function subscribe(fn: (time: number) => void) {
  subscribers.add(fn);
  if (!raf) {
    const tick = (time: number) => {
      if (time - last >= (innerWidth < 600 ? 50 : 1000 / 30)) {
        for (const sub of subscribers) sub(time);
        last = time;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}
export function HeroDemo({
  map: provided,
  compact = false,
}: {
  map?: TrackMap;
  compact?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [playing, setPlaying] = useState(
      () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [scenario, setScenario] = useState(0),
    [display, setDisplay] = useState("");
  useEffect(() => {
    const el = canvas.current!,
      map = provided ?? HOME_SCENARIOS[scenario],
      record = recordings.records.find((r) => r.mapId === map.id),
      env = new Simulator(map, record?.horizon ?? 600);
    env.reset(42);
    let visible = false,
      last = performance.now(),
      acc = 0,
      attempt = 0,
      ended = 0,
      lastDraw = 0;
    const resize = () => {
      const r = el.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, compact ? 1.25 : 1.75);
      if (
        el.width !== Math.round(r.width * dpr) ||
        el.height !== Math.round(r.height * dpr)
      ) {
        el.width = r.width * dpr;
        el.height = r.height * dpr;
      }
      return r;
    };
    const draw = () => {
      resize();
      const scale = Math.min(el.width / map.width, el.height / map.height),
        ctx = el.getContext("2d")!;
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
      const s = env.getState(false);
      el.dataset.demoX = String(s.x);
      el.dataset.demoSteps = String(s.steps);
      el.dataset.demoOutcome = env.done
        ? s.success
          ? "success"
          : "failure"
        : "running";
      el.dataset.demoSource = record ? "recorded-ga" : "scripted-physics";
      el.dataset.demoMap = map.id;
      el.dataset.demoDifficulty = map.difficulty ?? "Easy";
      el.dataset.demoAttempt = String(attempt);
      el.dataset.demoGeneration = record
        ? String(
            record.policies[
              compact
                ? record.policies.length - 1
                : Math.min(attempt, record.policies.length - 1)
            ].generation,
          )
        : "";
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      last = performance.now();
      acc = 0;
    });
    observer.observe(el);
    const media = matchMedia("(prefers-reduced-motion: reduce)"),
      reduced = () => {
        if (media.matches) setPlaying(false);
      };
    media.addEventListener("change", reduced);
    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!playing || !visible || document.hidden) {
        acc = 0;
        return;
      }
      if (env.done) {
        if (!ended) ended = now;
        if (now - ended > 500) {
          attempt++;
          if (!compact && attempt >= (record?.policies.length ?? 3)) {
            setScenario((s) => (s + 1) % HOME_SCENARIOS.length);
            return;
          }
          env.reset(42);
          ended = 0;
          acc = 0;
        }
      } else {
        acc += delta * 1.75;
        let count = 0;
        while (acc >= 1 / 60 && !env.done && count++ < 8) {
          let action: number;
          if (record) {
            const p = record.policies[
              compact
                ? record.policies.length - 1
                : Math.min(attempt, record.policies.length - 1)
            ].policy as PolicyData;
            action = actionOf(p, env.observe());
          } else {
            if (!actionCache.has(map.id))
              actionCache.set(map.id, demonstrate(map, 1800).actions);
            action =
              actionCache.get(map.id)?.[env.getState(false).steps] ??
              (map.mode === "bounce" ? 2 : 0);
            if (!compact && attempt === 0)
              action = map.mode === "racing" ? 1 : 0;
            else if (
              !compact &&
              attempt === 1 &&
              env.getState(false).steps < 18
            )
              action = 0;
          }
          env.step(action);
          acc -= 1 / 60;
        }
      }
      if (now - lastDraw >= (compact ? 80 : 33)) {
        draw();
        lastDraw = now;
      }
    };
    setDisplay(
      `${map.mode === "racing" ? "Racing" : "Bounce"} · ${map.difficulty ?? "Easy"} · ${map.name}`,
    );
    draw();
    const unsubscribe = subscribe(tick),
      ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => {
      unsubscribe();
      observer.disconnect();
      ro.disconnect();
      media.removeEventListener("change", reduced);
    };
  }, [playing, provided, compact, scenario]);
  return (
    <div className="hero-demo">
      <canvas
        ref={canvas}
        aria-label={
          compact
            ? `${provided?.name} 애니메이션 프리뷰`
            : "실제 물리 기반 주행 데모"
        }
        aria-description="기록된 GA 정책 또는 스크립트 물리 시연입니다. 홈에서는 실시간 학습하지 않습니다. 데이터 출처는 캔버스 속성과 시연 정보에 표시됩니다."
        data-preview={compact || undefined}
      />
      {!compact && (
        <>
          <div className="demo-scenario">{display}</div>
          <button
            className="demo-play-toggle icon-btn"
            aria-label={playing ? "데모 일시정지" : "데모 재생"}
            aria-pressed={playing}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            className="demo-next button"
            onClick={() => setScenario((s) => (s + 1) % HOME_SCENARIOS.length)}
          >
            다음 환경
          </button>
          <details className="demo-provenance">
            <summary>시연 정보</summary>
            <p>
              Launch strip·First jump는 실제 GA 세대 0·1·4·10의 고정 정책
              기록입니다. 다른 코스는 실패·부분 통과·완주 조작을 사용하는 물리
              시연이며 AI 학습 결과가 아닙니다.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
