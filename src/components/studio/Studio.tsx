import { BestPolicyDialog } from "./BestPolicyDialog";
import type { PolicyCatalog, SavedModel } from "../../core/types";
import { useEffect, useState, useRef, type CSSProperties } from "react";
import {
  Activity,
  ArrowRight,
  Download,
  Gauge,
  Map as MapIcon,
  Maximize2,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Save,
  Settings2,
  Square,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { EXAMPLE_MAPS } from "../../core/maps";
import type { Algorithm, Config, TrackMap } from "../../core/types";
import { FIT_VIEW, type Viewport } from "../../core/editor";
import type { useTraining } from "../../hooks/useTraining";
import { World, type ViewOptions } from "../World";
import { Chart } from "../Chart";
import { ToolButton, Toggle } from "../ui";
import { EditorWorkspace } from "./EditorWorkspace";
import { TrainingPanel } from "./TrainingPanel";
const fmt = (n: number | undefined, d = 0) =>
  n === undefined
    ? "—"
    : n.toLocaleString("ko-KR", { maximumFractionDigits: d });
const statusText: Record<string, string> = {
  idle: "준비",
  starting: "학습 준비 중",
  running: "학습 중",
  paused: "일시정지",
  stopped: "중지됨",
  error: "오류",
};
export interface Props {
  editing: boolean;
  map: TrackMap;
  maps: TrackMap[];
  config: Config;
  onConfig: (c: Config) => void;
  method: "GA" | "PPO" | "both";
  onMethod: (m: "GA" | "PPO" | "both") => void;
  training: ReturnType<typeof useTraining>;
  tab: Algorithm;
  onTab: (a: Algorithm) => void;
  options: ViewOptions;
  onOptions: (o: ViewOptions) => void;
  onMapChange: (m: TrackMap, group?: string) => void;
  onChooseMap: (m: TrackMap) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onStart: () => void;
  onSaveInference: () => void;
  onSaveMap: () => void;
  onCompare: () => void;
  onModels: () => void;
  onError: (message: string) => void;
  onSaveModel: (model: SavedModel) => Promise<void>;
}
export function Studio(props: Props) {
  if (props.editing && props.map.environmentVersion !== 4)
    return <section role="status">v4 편집 환경 준비 중…</section>;
  return props.editing ? (
    <EditorWorkspace
      map={props.map}
      maps={props.maps}
      options={props.options}
      config={props.config}
      locked={false}
      onChange={props.onMapChange}
      onChoose={props.onChooseMap}
      onSave={props.onSaveMap}
      onError={props.onError}
      canUndo={props.canUndo}
      canRedo={props.canRedo}
      onUndo={props.onUndo}
      onRedo={props.onRedo}
    />
  ) : (
    <TrainingStudio {...props} />
  );
}
function TrainingStudio({
  map,
  maps,
  config,
  onConfig,
  method,
  onMethod,
  training,
  tab,
  onTab,
  options,
  onOptions,
  onChooseMap,
  onStart,
  onSaveInference,
  onCompare,
  onModels,
  onSaveModel,
  onError,
}: Props) {
  const [panel, setPanel] = useState(false);
  const [inspection, setInspection] = useState<PolicyCatalog | null>(null),
    [inspecting, setInspecting] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null),
    [headingHeight, setHeadingHeight] = useState(120);
  useEffect(() => {
    const el = headingRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setHeadingHeight(el.getBoundingClientRect().height),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const inspect = async () => {
    setInspecting(true);
    try {
      setInspection(await training.inspect(tab));
    } catch (e) {
      onError(String(e));
    } finally {
      setInspecting(false);
    }
  };

  const [viewport, setViewport] = useState<Viewport>(FIT_VIEW);
  const [follow, setFollow] = useState(false);
  const [chartMetric, setChartMetric] = useState<"best" | "mean">("best");
  const [windowSize, setWindowSize] = useState(100);
  const snapshot = training.snapshots[tab],
    stats = snapshot?.stats,
    live = snapshot?.live;
  const locked = training.active || training.paused,
    status = training.statuses[tab] ?? "idle";
  useEffect(() => {
    setViewport(FIT_VIEW);
    setFollow(false);
  }, [map.id]);
  useEffect(() => {
    if (!panel || innerWidth > 900) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prior;
    };
  }, [panel]);
  const changeConfig = (c: Config) => {
    onConfig(c);
    if (locked) training.send("UPDATE_CONFIG", c);
  };
  return (
    <>
      {inspection && snapshot && (
        <BestPolicyDialog
          map={map}
          config={config}
          stats={snapshot.stats}
          catalog={inspection}
          onClose={() => setInspection(null)}
          onResume={
            training.paused
              ? () => {
                  setInspection(null);
                  training.send("RESUME");
                }
              : undefined
          }
          onSave={onSaveModel}
        />
      )}

      <div
        className={"studio " + (!panel ? "panel-hidden" : "")}
        style={
          { "--training-heading-height": `${headingHeight}px` } as CSSProperties
        }
      >
        <section className="canvas-card">
          <div className="canvas-heading training-card-header" ref={headingRef}>
            <div>
              <h2>
                {tab === "GA" ? "실시간 개체군" : "실제 PPO Rollout"}{" "}
                <small className="environment-label">
                  환경 v{map.environmentVersion ?? 1} ·{" "}
                  {(map.environmentVersion ?? 1) >= 2
                    ? "방향 게이트·회전 충돌"
                    : "이전 점형 판정"}
                </small>
              </h2>
              <span>
                {tab === "GA"
                  ? "독립된 환경 · 고정 1/60초 · 개체 간 충돌 없음."
                  : "단일 학습 환경 · PPO 에이전트 1개 · 실제 경험 수집"}
              </span>
              <span className="status-badge">{statusText[status]}</span>
              <div className="map-context">
                {" "}
                <div className="mode-tabs">
                  <button
                    aria-pressed={map.mode === "racing"}
                    onClick={() =>
                      map.mode !== "racing" && onChooseMap(EXAMPLE_MAPS[2])
                    }
                  >
                    <Gauge size={16} />
                    Racing
                  </button>
                  <button
                    aria-pressed={map.mode === "bounce"}
                    onClick={() =>
                      map.mode !== "bounce" && onChooseMap(EXAMPLE_MAPS[4])
                    }
                  >
                    <Activity size={16} />
                    Bounce
                  </button>
                </div>
                <label className="current-map">
                  <MapIcon size={16} />
                  <select
                    aria-label="현재 맵"
                    value={map.id}
                    onChange={(e) =>
                      onChooseMap(maps.find((m) => m.id === e.target.value)!)
                    }
                  >
                    {!maps.some((m) => m.id === map.id) && (
                      <option value={map.id}>{map.name}</option>
                    )}
                    {maps
                      .filter((m) => m.mode === map.mode)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id === map.id ? map.name : m.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </div>
            <div
              className="card-training-controls training-controls"
              aria-label="학습 실행 제어"
            >
              {" "}
              <select
                aria-label="학습 알고리즘"
                value={method}
                onChange={(e) => onMethod(e.target.value as typeof method)}
              >
                <option value="GA">GA</option>
                <option value="PPO">PPO</option>
                <option value="both">GA + PPO</option>
              </select>
              <label className="top-speed">
                배속
                <input
                  type="number"
                  aria-label="상단 학습 배속"
                  value={config.speed}
                  min={0.5}
                  max={10}
                  step={0.1}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 0.5 && n <= 10)
                      changeConfig({ ...config, speed: n });
                  }}
                />
                ×
              </label>
              <button
                className="button primary training-main-action"
                onClick={() =>
                  training.active
                    ? training.send("PAUSE")
                    : training.paused
                      ? training.send("RESUME")
                      : onStart()
                }
              >
                {training.active ? <Pause size={17} /> : <Play size={17} />}
                {training.active
                  ? "일시정지"
                  : training.paused
                    ? "학습 재개"
                    : "학습 시작"}
              </button>
              <button
                className="button"
                disabled={!locked}
                onClick={() => training.send("STOP")}
              >
                <Square size={14} />
                학습 중지
              </button>
              <button
                className="button panel-trigger"
                aria-expanded={panel}
                onClick={() => setPanel(!panel)}
              >
                <Settings2 size={16} />
                {panel ? "패널 접기" : "학습 설정"}
              </button>
              <button
                className="button"
                disabled={!snapshot || inspecting}
                onClick={() => void inspect()}
              >
                {inspecting ? "정책 확인 중…" : "최고 모델 확인"}
              </button>
            </div>
          </div>
          <section className="observation-controls">
            <label>
              학습 모드{" "}
              <select
                aria-label="학습 진행 모드"
                value={config.trainingMode ?? "observe"}
                onChange={(e) =>
                  changeConfig({
                    ...config,
                    trainingMode: e.target.value as "observe" | "fast",
                  })
                }
              >
                <option value="observe">실시간 관찰</option>
                <option value="fast">빠른 학습 · 중간 프레임 생략</option>
              </select>
            </label>
            <span>
              요청 {config.speed.toFixed(1)}× · 실제{" "}
              {(snapshot?.runtime?.effectiveSpeed ?? 0).toFixed(2)}× ·{" "}
              {(snapshot?.runtime?.ticksPerSecond ?? 0).toFixed(0)} ticks/s
            </span>
            {training.paused && (
              <span>일시정지 · 학습 재개로 이어서 관찰하세요.</span>
            )}
          </section>
          <div className="view-toolbar">
            <div className="row">
              <div className="algorithm-switch">
                <button aria-pressed={tab === "GA"} onClick={() => onTab("GA")}>
                  GA
                </button>
                <button
                  aria-pressed={tab === "PPO"}
                  onClick={() => onTab("PPO")}
                >
                  PPO
                </button>
              </div>
              <ToolButton
                icon={ZoomOut}
                label="축소"
                onClick={() =>
                  setViewport((v) => ({
                    ...v,
                    zoom: Math.max(0.4, v.zoom / 1.2),
                  }))
                }
              />
              <output className="zoom-value" aria-label="현재 줌 배율">
                {Math.round(viewport.zoom * 100)}%
              </output>
              <ToolButton
                icon={ZoomIn}
                label="확대"
                onClick={() =>
                  setViewport((v) => ({
                    ...v,
                    zoom: Math.min(4, v.zoom * 1.2),
                  }))
                }
              />
              <ToolButton
                icon={Maximize2}
                label="화면 맞춤"
                onClick={() => {
                  setViewport(FIT_VIEW);
                  setFollow(false);
                }}
              />
            </div>
            <ToolButton
              icon={Navigation}
              label="에이전트 추적"
              active={follow}
              disabled={!snapshot}
              onClick={() => setFollow(!follow)}
            />
            <details className="view-options">
              <summary>표시 옵션</summary>
              <div>
                <Toggle
                  label="충돌 영역"
                  checked={options.collision}
                  onChange={(collision) => onOptions({ ...options, collision })}
                />
                <Toggle
                  label="이전 최고 기록 고스트"
                  checked={options.ghost}
                  onChange={(ghost) => onOptions({ ...options, ghost })}
                />
                {tab === "PPO" && (
                  <>
                    <Toggle
                      label="주행 궤적"
                      checked={options.trail}
                      onChange={(trail) => onOptions({ ...options, trail })}
                    />
                    <Toggle
                      label="센서 표시"
                      checked={options.sensors}
                      onChange={(sensors) => onOptions({ ...options, sensors })}
                    />
                  </>
                )}
              </div>
            </details>
          </div>
          {tab === "GA" && (
            <div className="population-toolbar">
              <label>
                표시
                <select
                  aria-label="개체 표시"
                  value={options.populationMode ?? "all"}
                  onChange={(e) =>
                    onOptions({
                      ...options,
                      populationMode: e.target
                        .value as ViewOptions["populationMode"],
                    })
                  }
                >
                  <option value="all">모든 개체</option>
                  <option value="alive">생존 개체만</option>
                  <option value="best">현재 최고 개체만</option>
                </select>
              </label>
              <label>
                선택 개체
                <select
                  aria-label="선택 개체"
                  value={options.selectedAgent ?? -1}
                  onChange={(e) =>
                    onOptions({
                      ...options,
                      selectedAgent:
                        Number(e.target.value) < 0
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                >
                  <option value={-1}>현재 최고</option>
                  {Array.from(
                    { length: live?.total ?? config.population },
                    (_, i) => (
                      <option key={i} value={i}>
                        개체 {i + 1}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <Toggle
                label="주행 궤적"
                checked={options.trail}
                onChange={(trail) => onOptions({ ...options, trail })}
              />
              <Toggle
                label="센서 표시"
                checked={options.sensors}
                onChange={(sensors) => onOptions({ ...options, sensors })}
              />
            </div>
          )}
          <div
            className={
              "viewport " + (method === "both" ? "split-learning" : "")
            }
          >
            <div className="learning-pane">
              {method === "both" && (
                <span className="pane-label">GA · 실시간 개체군</span>
              )}
              <World
                map={map}
                options={options}
                snapshot={method === "both" ? training.snapshots.GA : snapshot}
                animate={false}
                onFrame={(sequence, session) =>
                  training.presentFrame(
                    method === "both" ? "GA" : tab,
                    sequence,
                    options.selectedAgent,
                    session,
                  )
                }
                viewport={viewport}
                onViewportChange={setViewport}
                interactive
                onAgentSelect={(index) =>
                  onOptions({ ...options, selectedAgent: index })
                }
                follow={follow}
                onNavigate={() => setFollow(false)}
                seed={config.seed}
                horizon={config.horizon}
              />
            </div>
            {method === "both" && (
              <div className="learning-pane">
                <span className="pane-label">PPO · 단일 에이전트 Rollout</span>
                <World
                  map={map}
                  options={options}
                  snapshot={training.snapshots.PPO}
                  label="PPO 실제 학습 캔버스"
                  onFrame={(sequence, session) =>
                    training.presentFrame("PPO", sequence, undefined, session)
                  }
                />
              </div>
            )}
            {!snapshot && (
              <div className="canvas-idle-hint">
                <Play size={16} />
                <span>상단에서 알고리즘을 선택하고 학습을 시작하세요.</span>
              </div>
            )}
          </div>
          {method === "both" && (
            <div className="split-comparison" aria-label="실제 학습량 비교">
              {(["GA", "PPO"] as const).map((a) => {
                const s = training.snapshots[a];
                return (
                  <div key={a}>
                    <strong>{a}</strong> · 환경 상호작용 {s?.stats.steps ?? 0} ·{" "}
                    {a === "GA" ? "세대" : "업데이트"} {s?.stats.iteration ?? 0}{" "}
                    · 평균 보상 {(s?.stats.mean ?? 0).toFixed(2)} · 완주율{" "}
                    {((s?.stats.successRate ?? 0) * 100).toFixed(0)}% · 최고
                    진행도 {((s?.runtime?.bestProgress ?? 0) * 100).toFixed(1)}%
                    · {(s?.stats.elapsed ?? 0).toFixed(1)}초
                  </div>
                );
              })}
            </div>
          )}
          {training.snapshots.PPO?.runtime && (
            <div className="ppo-runtime" aria-label="PPO 경험 수집 상태">
              <strong>
                {training.paused
                  ? "PAUSED"
                  : training.snapshots.PPO.runtime.phase}
              </strong>
              <span>
                {training.snapshots.PPO.runtime.phase === "OPTIMIZING"
                  ? "수집한 경험으로 정책을 업데이트하는 중"
                  : "실제 환경에서 경험 수집"}
              </span>
              <span>
                Rollout {training.snapshots.PPO.runtime.rollout}/
                {training.snapshots.PPO.runtime.target} · 업데이트{" "}
                {training.snapshots.PPO.runtime.updates}
              </span>
              <span>
                현재 보상 {training.snapshots.PPO.state.reward.toFixed(2)} ·
                정책 손실 {training.snapshots.PPO.stats.policyLoss.toFixed(4)} ·
                가치 손실 {training.snapshots.PPO.stats.valueLoss.toFixed(4)} ·
                엔트로피 {training.snapshots.PPO.stats.entropy.toFixed(3)} · KL{" "}
                {training.snapshots.PPO.stats.kl.toFixed(4)}
              </span>
            </div>
          )}
          {live && (
            <div className="population-stats" aria-label="실시간 개체군 상태">
              <span>
                세대 <b>{live.generation}</b>
              </span>
              <span>
                전체 <b>{live.total}</b>
              </span>
              <span>
                생존 <b>{live.alive}</b>
              </span>
              <span>
                충돌 <b>{live.crashed}</b>
              </span>
              <span>
                완주 <b>{live.finished}</b>
              </span>
              <span>
                최고{" "}
                <b>
                  {fmt(
                    Math.max(...snapshot!.population.map((s) => s.reward)),
                    2,
                  )}
                </b>
              </span>
              <span>
                평균{" "}
                <b>
                  {fmt(
                    snapshot!.population.reduce((a, s) => a + s.reward, 0) /
                      live.total,
                    2,
                  )}
                </b>
              </span>
              <span>
                실제 <b>{fmt(live.effectiveSpeed, 2)}×</b> ·{" "}
                {fmt(live.environmentStepsPerSecond)} 스텝/초
              </span>
            </div>
          )}
          <div className="canvas-help">
            <span>
              {live
                ? `세대 스텝 ${live.tick} · ${live.boundary ? "세대 경계" : "주행 중"}`
                : "드래그로 이동 · 휠로 확대·축소"}
            </span>
            <button
              className="text-btn"
              disabled={locked || !stats}
              onClick={() => training.clear()}
            >
              <RotateCcw size={13} />
              세션 초기화
            </button>
          </div>
        </section>
        {panel && (
          <>
            <button
              className="panel-scrim"
              aria-label="설정 배경 닫기"
              onClick={() => setPanel(false)}
            />
            <aside className="settings-card" aria-label="학습 설정 패널">
              <div className="panel-heading">
                <h2>학습 설정</h2>
                <button
                  className="icon-btn"
                  aria-label="패널 닫기"
                  onClick={() => setPanel(false)}
                >
                  <X size={17} />
                </button>
              </div>
              <TrainingPanel
                config={config}
                onConfig={changeConfig}
                method={method}
                onMethod={onMethod}
                locked={locked}
                onModels={onModels}
              />
            </aside>
          </>
        )}
      </div>
      <div className="results-heading">
        <h2>
          학습 결과{" "}
          <span>
            {tab} · {statusText[status]}
          </span>
        </h2>
        <button className="text-btn" onClick={onCompare}>
          두 알고리즘 비교
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="metric-grid">
        {[
          {
            label: tab === "GA" ? "진화 세대" : "정책 업데이트",
            value: fmt(stats?.iteration),
            sub: stats
              ? fmt(stats.episodes) + " 에피소드"
              : "아직 학습 기록이 없습니다.",
          },
          {
            label: "환경 상호작용",
            value: fmt(stats?.steps),
            sub: stats
              ? "경과 시간 " + fmt(stats.elapsed, 1) + "초"
              : "실제 처리한 스텝 수",
          },
          {
            label: "최근 평균 보상",
            value: fmt(stats?.mean, 2),
            sub: "최근 학습 배치 기준",
          },
          {
            label: "최고 관찰 보상 / 적합도",
            value: fmt(stats?.best, 2),
            sub: "실제 학습 환경에서 기록한 보상",
          },
          {
            label: "완주율",
            value: stats ? fmt(stats.successRate * 100, 1) + "%" : "—",
            sub: "최근 완료된 에피소드 기준",
          },
          {
            label: "평균 완주 시간",
            value: stats?.completionTime
              ? fmt(stats.completionTime, 2) + "초"
              : "—",
            sub: "충돌 " + fmt(stats?.collisions) + "회",
          },
        ].map((m) => (
          <div className="metric-card" key={m.label}>
            <div>{m.label}</div>
            <strong>{m.value}</strong>
            <small>{m.sub}</small>
          </div>
        ))}
      </div>
      <div className="bottom-grid">
        <section className="graph-card">
          <div className="card-heading">
            <div>
              <h2>보상 추이</h2>
              <p>학습량에 따른 실제 측정 결과</p>
            </div>
            <div className="chart-controls">
              <select
                aria-label="그래프 보상 종류"
                value={chartMetric}
                onChange={(e) =>
                  setChartMetric(e.target.value as "best" | "mean")
                }
              >
                <option value="best">최고 관찰 보상 / 적합도</option>
                <option value="mean">최근 평균 보상</option>
              </select>
              <select
                aria-label="그래프 측정 구간"
                value={windowSize}
                onChange={(e) => setWindowSize(Number(e.target.value))}
              >
                {[50, 100, 300].map((n) => (
                  <option key={n} value={n}>
                    최근 {n}회 측정
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Chart
            histories={Object.fromEntries(
              Object.entries(training.histories).map(([key, values]) => [
                key,
                values?.slice(-windowSize),
              ]),
            )}
            metric={chartMetric}
            height={220}
          />
          <div className="graph-footer">
            <div className="legend">
              <span>
                <i className="ga-dot" />
                GA
              </span>
              <span>
                <i className="ppo-dot" />
                PPO
              </span>
            </div>
            <span>
              가로축: 환경 스텝 · 세대와 업데이트 수를 동일하게 비교하지
              않습니다.
            </span>
          </div>
        </section>
        <section className="session-card">
          <div className="card-heading">
            <h2>모델과 세션</h2>
            <span className="pill">{tab}</span>
          </div>
          <dl>
            <div>
              <dt>학습 상태</dt>
              <dd>{statusText[status]}</dd>
            </div>
            <div>
              <dt>개체군 크기</dt>
              <dd>{tab === "GA" ? config.population : "해당 없음"}</dd>
            </div>
            {tab === "PPO" && (
              <>
                <div>
                  <dt>정책 손실 / 가치 손실</dt>
                  <dd>
                    {stats
                      ? fmt(stats.policyLoss, 4) +
                        " / " +
                        fmt(stats.valueLoss, 4)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>엔트로피 / KL</dt>
                  <dd>
                    {stats
                      ? fmt(stats.entropy, 3) + " / " + fmt(stats.kl, 4)
                      : "—"}
                  </dd>
                </div>
              </>
            )}
            <div>
              <dt>텐서 메모리</dt>
              <dd>
                {stats
                  ? fmt(stats.bytes / 1024, 1) + " KB · " + stats.tensors + "개"
                  : "—"}
              </dd>
            </div>
          </dl>
          <div className="session-buttons">
            <button
              className="button"
              disabled={!snapshot}
              onClick={onSaveInference}
            >
              <Save size={15} />
              모델 저장
            </button>
            <button
              className="button"
              disabled={
                !snapshot ||
                !locked ||
                training.checkpointPending[tab] ||
                (training.paused &&
                  (tab === "GA"
                    ? !snapshot.live?.boundary
                    : snapshot.runtime?.phase !== "READY"))
              }
              title="일시정지 도중에는 세대/rollout 경계에서만 저장할 수 있습니다. 중간 상태라면 재개한 뒤 저장을 요청하세요."
              aria-label="체크포인트"
              onClick={() => training.send("SAVE_CHECKPOINT", undefined, tab)}
            >
              <Download size={15} />
              {training.checkpointPending[tab]
                ? tab === "GA"
                  ? "세대 경계까지 대기…"
                  : "Rollout 업데이트 경계까지 대기…"
                : "체크포인트"}
            </button>
          </div>
          <p className="helper session-note">
            GA는 다음 세대 경계에서 개체군·RNG를 저장합니다. 세대 도중 요청하면
            경계까지 기다립니다. 일시정지 중에는 경계에서만 저장할 수 있습니다.
            PPO는 완료된 Rollout 업데이트 경계에서 Actor·Critic·Adam·RNG를
            저장하고 새 에피소드에서 재개합니다. 중간 Rollout은 저장하지
            않습니다.
          </p>
        </section>
      </div>
    </>
  );
}
