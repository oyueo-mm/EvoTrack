import { useEffect, useRef, useState } from "react";
import { Simulator } from "../../core/environment";
import { actionOf } from "../../learning/network";
import { policySummary } from "../../learning/best-policy";
import {
  schemasFor,
  type Config,
  type PolicyCatalog,
  type PolicyRecord,
  type SavedModel,
  type TrackMap,
  type TrainingStats,
} from "../../core/types";
import { drawWorld } from "../World";
function Playback({
  map,
  record,
  seed,
  nonce,
}: {
  map: TrackMap;
  record: PolicyRecord;
  seed: number;
  nonce: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState("");
  useEffect(() => {
    const el = canvas.current!,
      env = new Simulator(map, record.horizon);
    env.reset(seed);
    setResult("고정 정책으로 주행 중");
    let raf = 0,
      last = performance.now(),
      acc = 0,
      lastReport = 0;
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
      el.dataset.playbackStep = String(env.getState(false).steps);
      el.dataset.playbackReward = String(env.getState(false).reward);
    };
    const tick = (now: number) => {
      acc += Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden)
        while (acc >= 1 / 60 && !env.done) {
          env.step(actionOf(record.policy, env.observe()));
          acc -= 1 / 60;
        }
      else acc = 0;
      draw();
      if (now - lastReport > 180) {
        const s = env.getState(false);
        setResult(
          `${s.success ? "완주" : s.done ? "주행 종료" : "주행 중"} · 진행도 ${(s.progress * 100).toFixed(1)}% · 보상 ${s.reward.toFixed(2)}`,
        );
        lastReport = now;
      }
      if (!env.done) raf = requestAnimationFrame(tick);
    };
    draw();
    raf = requestAnimationFrame(tick);
    const resize = new ResizeObserver(draw);
    resize.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }, [map, record, seed, nonce]);
  return (
    <>
      <canvas
        ref={canvas}
        className="policy-playback"
        aria-label="최고 모델 평가 주행"
        data-policy-checksum={record.policy.weights.reduce(
          (a, b, i) => a + b * (i + 1),
          0,
        )}
      />
      <output className="playback-result">{result}</output>
    </>
  );
}
export function BestPolicyDialog({
  map,
  config,
  stats,
  catalog,
  onClose,
  onResume,
  onSave,
}: {
  map: TrackMap;
  config: Config;
  stats: TrainingStats;
  catalog: PolicyCatalog;
  onClose: () => void;
  onResume?: () => void;
  onSave: (model: SavedModel) => Promise<void>;
}) {
  const [choice, setChoice] = useState<"best" | "current">(
      catalog.best ? "best" : "current",
    ),
    [seed, setSeed] = useState(
      catalog.best?.seeds?.[0] ?? catalog.current?.seeds?.[0] ?? config.seed,
    ),
    [nonce, setNonce] = useState(0),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const record = catalog[choice] ?? catalog.current ?? catalog.best!;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        id: crypto.randomUUID(),
        name: `${map.name} · ${record.algorithm} ${choice === "best" ? "최고" : "현재"} 정책 · ${record.iteration}`,
        kind: "inference",
        algorithm: record.algorithm,
        mode: map.mode,
        schemas: schemasFor(map),
        policy: structuredClone(record.policy),
        policySelection: policySummary(record),
        config: { ...config },
        stats: {
          ...stats,
          iteration: record.iteration,
          best: record.fitness,
          successRate: record.successRate,
          progress: record.progress,
        },
        mapId: map.id,
        trainingMap: structuredClone(map),
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="최고 모델 확인"
        className="modal policy-dialog"
      >
        <header>
          <h2>{record.algorithm} 최고 모델 확인</h2>
          <button className="button" onClick={onClose}>
            학습으로 돌아가기
          </button>
        </header>
        <p className="helper">
          학습과 분리된 평가용 주행입니다. 이 화면에서는 가중치를 업데이트하지
          않습니다.
        </p>
        <div className="policy-inspection-controls">
          <label>
            정책 선택
            <select
              aria-label="확인할 정책"
              value={choice}
              onChange={(e) => {
                setChoice(e.target.value as "best" | "current");
                setNonce((n) => n + 1);
              }}
            >
              <option value="best" disabled={!catalog.best}>
                역대 최고 정책
              </option>
              <option value="current" disabled={!catalog.current}>
                {record.algorithm === "GA"
                  ? "현재 세대 최고 정책"
                  : "현재 정책"}
              </option>
            </select>
          </label>
          <label>
            평가 재생 시드
            <select
              aria-label="평가 재생 시드"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
            >
              {[...new Set([...(record.seeds ?? []), config.seed, seed])].map(
                (n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ),
              )}
            </select>
          </label>
          <button className="button" onClick={() => setNonce((n) => n + 1)}>
            재실행
          </button>
          <button
            className="button primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {choice === "best" ? "최고 정책 저장" : "현재 정책 저장"}
          </button>
          {onResume && (
            <button className="button" onClick={onResume}>
              돌아가서 학습 재개
            </button>
          )}
        </div>
        <div
          className="policy-score"
          aria-label="정책 평가 정보"
          data-iteration={record.iteration}
          data-policy-source={record.source}
        >
          발견 {record.algorithm === "GA" ? "세대" : "업데이트"}{" "}
          {record.iteration} ·{" "}
          {record.source === "generation" ? "학습 적합도" : "평가 보상"}{" "}
          {record.fitness.toFixed(2)} · 완주율{" "}
          {(record.successRate * 100).toFixed(1)}% · 진행도{" "}
          {(record.progress * 100).toFixed(1)}%{" "}
          {record.phase && ` · ${record.phase}`}
          {record.seeds &&
            ` · 고정 평가 시드 ${record.seeds.join(", ")} · 제한 ${record.horizon}스텝`}
        </div>
        {error && <p role="alert">{error}</p>}
        <Playback map={map} record={record} seed={seed} nonce={nonce} />
        <p className="helper">
          정책 저장은 추론용 가중치입니다. 개체군·Actor/Critic·Optimizer를
          포함하는 학습 체크포인트와 구분됩니다.
        </p>
      </section>
    </div>
  );
}
