import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Download,
  Flag,
  Gauge,
  GitBranch,
  Hand,
  Layers,
  Map as MapIcon,
  Maximize2,
  MousePointer2,
  MoveRight,
  Pause,
  Pencil,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
  Square,
  Target,
  Trash2,
  Undo2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
  Navigation,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EXAMPLE_MAPS, validateMap } from "../../core/maps";
import type { AgentState, Algorithm, Config, TrackMap } from "../../core/types";
import { FIT_VIEW, type Selection, type Viewport } from "../../core/editor";
import type { useTraining } from "../../hooks/useTraining";

import { World, type Tool, type ViewOptions } from "../World";
import { Chart } from "../Chart";
import { RangeField, ToolButton, Toggle } from "../ui";
import { EditorPanel } from "./EditorPanel";
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
interface Props {
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
}
export function Studio({
  editing,
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
  onMapChange,
  onChooseMap,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onStart,
  onSaveInference,
  onSaveMap,
  onCompare,
  onModels,
  onError,
}: Props) {
  const [panel, setPanel] = useState(() => window.innerWidth > 900),
    [tool, setTool] = useState<Tool>("select"),
    [selection, setSelection] = useState<Selection | null>(null),
    [viewport, setViewport] = useState<Viewport>(FIT_VIEW),
    [eraserSize, setEraserSize] = useState(22),
    [overview, setOverview] = useState(true),
    [follow, setFollow] = useState(false),
    [testing, setTesting] = useState(false),
    [testRun, setTestRun] = useState(0),
    [testState, setTestState] = useState<AgentState | null>(null),
    [pressed, setPressed] = useState<string[]>([]),
    [chartMetric, setChartMetric] = useState<"best" | "mean">("best"),
    [windowSize, setWindowSize] = useState(100);
  const snapshot = training.snapshots[tab],
    stats = snapshot?.stats,
    locked = training.active || training.paused,
    editDisabled = locked || testing,
    status = training.statuses[tab] ?? "idle";
  useEffect(() => {
    setViewport(FIT_VIEW);
    setSelection(null);
    setTesting(false);
    setFollow(false);
  }, [map.id, map.mode]);
  useEffect(() => {
    setPanel(window.innerWidth > 900);
    setTesting(false);
    setPressed([]);
  }, [editing]);
  useEffect(() => {
    if (!panel || window.innerWidth > 900) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [panel]);
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        locked ||
        testing
      )
        return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
      } else if (meta && e.code === "KeyY") {
        e.preventDefault();
        onRedo();
      } else if (!meta) {
        const shortcuts: Record<string, Tool> = {
          KeyV: "select",
          KeyP: "road",
          KeyE: "erase",
          KeyH: "pan",
        };
        if (shortcuts[e.code] && (e.code !== "KeyP" || map.mode === "racing"))
          setTool(shortcuts[e.code]);
        if (e.code === "Escape") setSelection(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing, locked, testing, map.mode, onUndo, onRedo]);
  let validation = "";
  try {
    validateMap(map);
  } catch (e) {
    validation = e instanceof Error ? e.message : String(e);
  }
  const tools: {
    tool: Tool;
    icon: LucideIcon;
    label: string;
    hint?: string;
  }[] = [
    { tool: "select", icon: MousePointer2, label: "선택 / 이동", hint: "V" },
    { tool: "pan", icon: Hand, label: "화면 이동", hint: "H" },
    ...(map.mode === "racing"
      ? [
          {
            tool: "road" as Tool,
            icon: Pencil,
            label: "도로 그리기",
            hint: "P",
          },
          { tool: "checkpoint" as Tool, icon: GitBranch, label: "체크포인트" },
        ]
      : [
          { tool: "platform" as Tool, icon: Layers, label: "고정 발판" },
          { tool: "moving" as Tool, icon: MoveRight, label: "이동 발판" },
          { tool: "spike" as Tool, icon: Zap, label: "가시" },
          { tool: "spring" as Tool, icon: ArrowUpRight, label: "점프대" },
          { tool: "elastic" as Tool, icon: Activity, label: "탄성 발판" },
        ]),
    { tool: "start", icon: Flag, label: "시작점" },
    { tool: "goal", icon: Target, label: "결승점" },
    { tool: "wall", icon: Square, label: "벽" },
    { tool: "erase", icon: Trash2, label: "지우개", hint: "E" },
  ];
  function changeConfig(c: Config) {
    onConfig(c);
    if (locked) training.send("UPDATE_CONFIG", c);
  }
  function testMap() {
    if (validation) {
      onError(validation);
      return;
    }
    setTestRun((n) => n + 1);
    setTesting(true);
    setTestState(null);
    setPressed([]);
    requestAnimationFrame(() => {
      (
        document.querySelector(
          '[aria-label="맵 편집 캔버스"]',
        ) as HTMLCanvasElement | null
      )?.focus({ preventScroll: true });
    });
  }
  const manualAction = pressed.length
    ? map.mode === "racing"
      ? pressed.includes("left")
        ? 1
        : pressed.includes("right")
          ? 2
          : pressed.includes("brake")
            ? 3
            : 0
      : pressed.includes("jump")
        ? pressed.includes("left")
          ? 4
          : pressed.includes("right")
            ? 5
            : 3
        : pressed.includes("left")
          ? 1
          : pressed.includes("right")
            ? 2
            : 0
    : -1;
  return (
    <>
      <section className="experiment-context" aria-label="실험 대상">
        <div className="mode-tabs" aria-label="환경 모드">
          <button
            aria-pressed={map.mode === "racing"}
            disabled={locked || testing}
            onClick={() =>
              map.mode !== "racing" && onChooseMap(EXAMPLE_MAPS[2])
            }
          >
            <Gauge size={17} />
            Racing
          </button>
          <button
            aria-pressed={map.mode === "bounce"}
            disabled={locked || testing}
            onClick={() =>
              map.mode !== "bounce" && onChooseMap(EXAMPLE_MAPS[4])
            }
          >
            <Activity size={17} />
            Bounce
          </button>
        </div>
        <span className="context-divider" />
        <label className="current-map">
          <MapIcon size={17} />
          <span>현재 맵</span>
          <select
            aria-label="현재 맵"
            value={map.id}
            disabled={locked || testing}
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
        <button
          className="button panel-trigger"
          aria-expanded={panel}
          onClick={() => setPanel(!panel)}
        >
          <Settings2 size={16} />
          {panel ? "패널 접기" : editing ? "속성 열기" : "학습 설정"}
        </button>
      </section>
      {editing && (
        <ol className="editor-flow" aria-label="맵 제작 순서">
          <li>
            <b>1</b>맵 이름
          </li>
          <li>
            <b>2</b>
            {map.mode === "racing" ? "도로 그리기" : "발판 배치"}
          </li>
          <li>
            <b>3</b>시작점 · 결승점
          </li>
          <li>
            <b>4</b>테스트 실행
          </li>
          <li>
            <b>5</b>맵 저장
          </li>
        </ol>
      )}
      <div className={"studio " + (!panel ? "panel-hidden" : "")}>
        <section className="canvas-card">
          <div className="canvas-heading">
            <div>
              <h2>{editing ? "맵 작업 영역" : "시뮬레이션"}</h2>
              <span>
                {editing
                  ? "선택한 도구로 지도 위에 직접 편집하세요."
                  : method === "both"
                    ? "GA와 PPO가 독립적으로 학습합니다."
                    : "대표 정책의 실제 움직임을 재생합니다."}
              </span>
            </div>
            <span className={"status-badge " + (training.active ? "live" : "")}>
              {testing
                ? "직접 테스트"
                : editing
                  ? locked
                    ? "읽기 전용"
                    : "편집 중"
                  : statusText[status]}
            </span>
          </div>
          {editing && (
            <>
              <div
                className="editor-toolbar"
                role="toolbar"
                aria-label="맵 편집 도구"
              >
                {tools.map((t) => (
                  <ToolButton
                    key={t.tool}
                    icon={t.icon}
                    label={t.label}
                    hint={t.hint}
                    active={tool === t.tool}
                    disabled={editDisabled}
                    onClick={() => setTool(t.tool)}
                  />
                ))}
                <span className="toolbar-divider" />
                <ToolButton
                  icon={Undo2}
                  label="실행 취소"
                  disabled={!canUndo || editDisabled}
                  onClick={onUndo}
                />
                <ToolButton
                  icon={Redo2}
                  label="다시 실행"
                  disabled={!canRedo || editDisabled}
                  onClick={onRedo}
                />
              </div>
              <div className="tool-context">
                {map.mode === "racing" && tool !== "erase" ? (
                  <RangeField
                    label="도로 두께"
                    value={map.roadWidth}
                    min={30}
                    max={300}
                    step={1}
                    unit="px"
                    disabled={editDisabled}
                    numberInput
                    onChange={(n, group) =>
                      onMapChange({ ...map, roadWidth: n }, group)
                    }
                  />
                ) : tool === "erase" ? (
                  <RangeField
                    label="지우개 반경"
                    value={eraserSize}
                    min={8}
                    max={80}
                    step={1}
                    unit="px"
                    disabled={editDisabled}
                    onChange={setEraserSize}
                  />
                ) : (
                  <span className="tool-hint">
                    10px 그리드에 맞춰 배치합니다. 선택 후 드래그하여
                    이동하세요.
                  </span>
                )}
                {tool === "road" && (
                  <p className="helper">
                    드래그하면 도로와 시작·결승·체크포인트가 만들어집니다. 기존
                    도로는 새 경로로 교체되며 실행 취소할 수 있습니다.
                  </p>
                )}
                {tool === "erase" && (
                  <p className="helper">
                    드래그해 지우세요. 지워진 시작·결승점은 다시 배치해야 하며,
                    끊긴 도로는 속성에서 연결할 수 있습니다.
                  </p>
                )}
              </div>
            </>
          )}
          <div className="view-toolbar">
            <div className="row">
              {!editing && (
                <>
                  <span className="toolbar-label">표시할 정책</span>
                  <div className="algorithm-switch">
                    <button
                      aria-pressed={tab === "GA"}
                      onClick={() => onTab("GA")}
                    >
                      GA
                    </button>
                    <button
                      aria-pressed={tab === "PPO"}
                      onClick={() => onTab("PPO")}
                    >
                      PPO
                    </button>
                  </div>
                </>
              )}
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
            <div className="row">
              {!editing && (
                <ToolButton
                  icon={Navigation}
                  label="에이전트 추적"
                  active={follow}
                  disabled={!snapshot}
                  onClick={() => setFollow(!follow)}
                />
              )}
              <details className="view-options">
                <summary>
                  <SlidersHorizontal size={16} />
                  표시 옵션
                </summary>
                <div>
                  {(
                    [
                      ["sensors", "센서 광선"],
                      ["trail", "이동 경로"],
                      ["collision", "충돌 영역"],
                      ["all", "전체 GA 개체"],
                      ["ghost", "이전 최고 기록 고스트"],
                    ] as const
                  ).map(([key, label]) => (
                    <Toggle
                      key={key}
                      label={label}
                      checked={options[key]}
                      onChange={(checked) =>
                        onOptions({ ...options, [key]: checked })
                      }
                    />
                  ))}
                  {editing && (
                    <Toggle
                      label="미니맵"
                      checked={overview}
                      onChange={setOverview}
                    />
                  )}
                </div>
              </details>
            </div>
          </div>
          <div className={"viewport " + (editing ? "editor-viewport" : "")}>
            <World
              key={testing ? "test-" + testRun : "workspace"}
              map={map}
              snapshot={!editing ? snapshot : undefined}
              animate={!editing && training.active}
              options={options}
              editing={editing}
              tool={tool}
              selected={selection}
              onSelect={setSelection}
              onChange={onMapChange}
              viewport={viewport}
              onViewportChange={setViewport}
              interactive
              overview={editing && overview}
              eraserSize={eraserSize}
              follow={follow}
              onNavigate={() => setFollow(false)}
              ghost={training.ghosts[tab]}
              seed={config.seed}
              horizon={config.horizon}
              testing={testing}
              onTestState={setTestState}
              manualAction={manualAction}
            />
            {!editing && !snapshot && (
              <div className="canvas-idle-hint">
                <Play size={16} />
                <span>
                  알고리즘을 선택하고 <strong>학습 시작</strong>을 누르세요.
                </span>
              </div>
            )}
          </div>
          <div className="canvas-help">
            <span>
              {testing
                ? map.mode === "racing"
                  ? "↑ 가속 · ← → 조향 · ↓ 제동"
                  : "← → 이동 · Space 점프"
                : editing
                  ? "휠로 확대·축소 · Space + 드래그로 이동 · 두 번 클릭해 화면 맞춤"
                  : "드래그로 이동 · 휠로 확대·축소"}
            </span>
            <span>
              {map.width} × {map.height} px
            </span>
          </div>
          {editing ? (
            <div className="editor-actions">
              <div>
                {testing ? (
                  <span className="test-feedback">
                    {testState?.success
                      ? "결승점 도착"
                      : testState?.collision
                        ? "충돌 또는 낙하 — 배치를 확인하세요."
                        : testState?.done
                          ? "시간 제한에 도달했습니다."
                          : "직접 조작하며 경로를 확인하세요."}
                    <output
                      aria-label="테스트 에이전트 위치"
                      className="test-position"
                    >
                      x {Math.round(testState?.x ?? map.start.x)} · y{" "}
                      {Math.round(testState?.y ?? map.start.y)}
                    </output>
                  </span>
                ) : validation ? (
                  <span className="validation-message">{validation}</span>
                ) : (
                  <span className="valid-message">
                    테스트와 저장이 가능한 맵입니다.
                  </span>
                )}
              </div>
              <div className="row">
                {testing ? (
                  <>
                    <button
                      className="button"
                      onClick={() => {
                        setTesting(false);
                        setPressed([]);
                      }}
                    >
                      테스트 종료
                    </button>
                    <button className="button primary" onClick={testMap}>
                      <RotateCcw size={16} />
                      다시 테스트
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="button"
                      disabled={locked}
                      onClick={testMap}
                    >
                      <Play size={16} />
                      테스트 실행
                    </button>
                    <button
                      className="button primary"
                      disabled={locked}
                      onClick={onSaveMap}
                    >
                      <Save size={16} />
                      저장
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="playback-bar">
              <div className="playback-actions">
                <button
                  className="button primary"
                  onClick={() =>
                    training.active
                      ? training.send("PAUSE")
                      : training.paused
                        ? training.send("RESUME")
                        : onStart()
                  }
                >
                  {training.active ? <Pause size={17} /> : <Play size={17} />}{" "}
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
                  <Square size={15} />
                  학습 중지
                </button>
                <button
                  className="button quiet"
                  disabled={locked || !stats}
                  onClick={() => training.clear()}
                  title="현재 세션의 지표와 저장하지 않은 정책을 지웁니다. 저장된 맵·모델은 유지됩니다."
                >
                  <RotateCcw size={15} />
                  세션 초기화
                </button>
              </div>
              <div className="runtime">
                <span>{config.speed.toFixed(1)}×</span>
                <span>
                  {stats
                    ? fmt(stats.stepsPerSecond) + " 스텝/초"
                    : "학습 대기 중"}
                </span>
              </div>
            </div>
          )}
          {testing && (
            <div className="test-pad">
              {(map.mode === "racing"
                ? [
                    ["left", "← 왼쪽"],
                    ["jump", "↑ 가속"],
                    ["right", "오른쪽 →"],
                    ["brake", "제동"],
                  ]
                : [
                    ["left", "← 왼쪽"],
                    ["jump", "점프"],
                    ["right", "오른쪽 →"],
                  ]
              ).map(([key, label]) => (
                <button
                  className="button"
                  key={key}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setPressed((p) => [...p.filter((k) => k !== key), key]);
                  }}
                  onPointerUp={() =>
                    setPressed((p) => p.filter((k) => k !== key))
                  }
                  onPointerCancel={() =>
                    setPressed((p) => p.filter((k) => k !== key))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </section>
        {panel && (
          <button
            className="panel-scrim"
            aria-label="설정 배경 닫기"
            onClick={() => setPanel(false)}
          />
        )}
        {panel && (
          <aside className="settings-card">
            <div className="panel-heading">
              <h2>{editing ? "요소와 속성" : "학습 설정"}</h2>
              <button
                className="icon-btn"
                aria-label="패널 닫기"
                onClick={() => setPanel(false)}
              >
                <X size={17} />
              </button>
            </div>
            {editing ? (
              <EditorPanel
                map={map}
                selection={selection}
                onSelect={setSelection}
                onChange={onMapChange}
                disabled={editDisabled}
              />
            ) : (
              <TrainingPanel
                config={config}
                onConfig={changeConfig}
                method={method}
                onMethod={onMethod}
                locked={locked}
                onModels={onModels}
              />
            )}
          </aside>
        )}
      </div>
      {!editing && (
        <>
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
                label: "최고 평가 보상",
                value: fmt(stats?.best, 2),
                sub: "같은 맵·시드의 정책 평가",
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
                    <option value="best">최고 평가 보상</option>
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
                      ? fmt(stats.bytes / 1024, 1) +
                        " KB · " +
                        stats.tensors +
                        "개"
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
                  disabled={!snapshot || !locked}
                  onClick={() =>
                    training.send("SAVE_CHECKPOINT", undefined, tab)
                  }
                >
                  <Download size={15} />
                  체크포인트
                </button>
              </div>
              <p className="helper session-note">
                모델은 추론 가중치를, 체크포인트는 학습 재개에 필요한 상태를
                저장합니다.
              </p>
            </section>
          </div>
        </>
      )}
    </>
  );
}
