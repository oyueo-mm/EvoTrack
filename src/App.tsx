import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Flag,
  FlaskConical,
  FolderOpen,
  Gauge,
  GitBranch,
  Grid2X2,
  Hand,
  Home,
  Layers,
  Map as MapIcon,
  Maximize2,
  Menu,
  MousePointer2,
  MoveRight,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  Save,
  Settings2,
  Square,
  Sun,
  Target,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EXAMPLE_MAPS, newMap, validateMap } from "./core/maps";
import {
  DEFAULT_CONFIG,
  SCHEMAS,
  type Algorithm,
  type Config,
  type SavedModel,
  type TrackMap,
} from "./core/types";
import { World, type Tool, type ViewOptions } from "./components/World";
import { Chart } from "./components/Chart";
import { useTraining } from "./hooks/useTraining";
import { assertCompatible, evaluate } from "./learning/evaluate";
import {
  download,
  list,
  put,
  readJSON,
  remove,
  validateConfig,
  validateModel,
  type Experiment,
} from "./storage";
type Page =
  "home" | "lab" | "editor" | "compare" | "maps" | "models" | "experiments";
const NAV: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "프로젝트", icon: Home },
  { id: "lab", label: "학습 실험실", icon: FlaskConical },
  { id: "editor", label: "맵 에디터", icon: Pencil },
  { id: "compare", label: "성능 비교", icon: BarChart3 },
  { id: "maps", label: "맵 라이브러리", icon: MapIcon },
  { id: "models", label: "모델 라이브러리", icon: Box },
  { id: "experiments", label: "실험 기록", icon: BookOpen },
];
const fmt = (n: number | undefined, d = 0) =>
  n === undefined
    ? "—"
    : n.toLocaleString("en-US", { maximumFractionDigits: d });
function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={"icon-btn " + (active ? "selected" : "")}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={17} />
    </button>
  );
}
function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export default function App() {
  const [page, setPage] = useState<Page>(() =>
      NAV.some((n) => n.id === location.hash.slice(1))
        ? (location.hash.slice(1) as Page)
        : "lab",
    ),
    [map, setMap] = useState<TrackMap>(() => structuredClone(EXAMPLE_MAPS[2])),
    [maps, setMaps] = useState<TrackMap[]>([]),
    [models, setModels] = useState<SavedModel[]>([]),
    [experiments, setExperiments] = useState<Experiment[]>([]),
    [config, setConfig] = useState<Config>({ ...DEFAULT_CONFIG }),
    [method, setMethod] = useState<"GA" | "PPO" | "both">("both"),
    [tab, setTab] = useState<Algorithm>("GA"),
    [tool, setTool] = useState<Tool>("select"),
    [selected, setSelected] = useState(""),
    [zoom, setZoom] = useState(1),
    [options, setOptions] = useState<ViewOptions>({
      sensors: false,
      trail: true,
      collision: false,
      all: false,
      ghost: false,
    }),
    [notice, setNotice] = useState<{ message: string; error: boolean } | null>(
      null,
    ),
    [panel, setPanel] = useState(true),
    [sidebar, setSidebar] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [light, setLight] = useState(false),
    [evaluation, setEvaluation] = useState<ReturnType<typeof evaluate> | null>(
      null,
    ),
    [evaluateModel, setEvaluateModel] = useState<SavedModel | null>(null),
    [evaluationMap, setEvaluationMap] = useState(""),
    [evaluating, setEvaluating] = useState(false);
  const undo = useRef<TrackMap[]>([]),
    redo = useRef<TrackMap[]>([]),
    importRef = useRef<HTMLInputElement>(null),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (message: string, error = false) => {
    setNotice({ message, error });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6500);
  };
  async function refresh() {
    try {
      const [a, b, c] = await Promise.all([
        list<TrackMap>("maps"),
        list<SavedModel>("models"),
        list<Experiment>("experiments"),
      ]);
      setMaps(a.map(validateMap));
      setModels(b.map(validateModel));
      setExperiments(c);
    } catch (e) {
      notify(String(e), true);
    }
  }
  const training = useTraining(
    (e) => notify(e, true),
    (model) => {
      void put("models", model)
        .then(() => {
          notify("체크포인트를 모델 라이브러리에 저장했습니다.");
          void refresh();
        })
        .catch((e) => notify(String(e), true));
    },
  );
  useEffect(() => {
    void refresh();
    const hash = () => {
      const p = location.hash.slice(1) as Page;
      if (NAV.some((n) => n.id === p)) setPage(p);
    };
    window.addEventListener("hashchange", hash);
    return () => {
      window.removeEventListener("hashchange", hash);
      clearTimeout(noticeTimer.current);
    };
  }, []);
  const navigate = (p: Page) => {
    setPage(p);
    location.hash = p;
    setSidebar(false);
  };
  const histories = training.histories,
    snapshot = training.snapshots[tab],
    stats = snapshot?.stats;
  const locked = training.active || training.paused;
  function edit(m: TrackMap) {
    if (locked) {
      notify("맵을 수정하기 전에 학습을 중지하세요.", true);
      return;
    }
    undo.current.push(structuredClone(map));
    if (undo.current.length > 80) undo.current.shift();
    redo.current = [];
    setMap({ ...m, updatedAt: new Date().toISOString() });
  }
  function chooseMap(m: TrackMap) {
    if (locked) {
      notify("맵을 변경하기 전에 학습을 중지하세요.", true);
      return;
    }
    training.clear();
    setMap(structuredClone(m));
    undo.current = [];
    redo.current = [];
    setZoom(1);
    setSelected("");
  }
  function history(forward = false) {
    const from = forward ? redo : undo,
      to = forward ? undo : redo;
    const last = from.current.pop();
    if (last) {
      to.current.push(map);
      setMap(last);
    }
  }
  async function saveMap() {
    try {
      const checked = validateMap(map);
      await put("maps", checked);
      await refresh();
      notify("맵을 이 브라우저에 저장했습니다.");
    } catch (e) {
      notify(String(e), true);
    }
  }
  function start() {
    try {
      validateMap(map);
      validateConfig(config);
      training.start(map, config, method === "both" ? ["GA", "PPO"] : [method]);
      setTab(method === "PPO" ? "PPO" : "GA");
    } catch (e) {
      notify(String(e), true);
    }
  }
  async function saveInference() {
    if (!snapshot) {
      notify("먼저 학습을 실행하세요.", true);
      return;
    }
    const m: SavedModel = {
      id: crypto.randomUUID(),
      name: map.name + " · " + tab + " policy",
      kind: "inference",
      algorithm: tab,
      mode: map.mode,
      schemas: SCHEMAS,
      policy: snapshot.policy,
      config: { ...config },
      stats: snapshot.stats,
      mapId: map.id,
      trainingMap: structuredClone(map),
      createdAt: new Date().toISOString(),
    };
    try {
      await put("models", m);
      await refresh();
      notify("추론 모델을 저장했습니다.");
    } catch (e) {
      notify(String(e), true);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      const value = await readJSON(file);
      if (value && typeof value === "object" && "policy" in value) {
        await put("models", validateModel(value));
        notify("모델을 가져왔습니다.");
      } else {
        const imported = validateMap(value);
        await put("maps", imported);
        chooseMap(imported);
        notify("맵을 가져왔습니다.");
      }
      await refresh();
    } catch (e) {
      notify(String(e), true);
    }
    if (importRef.current) importRef.current.value = "";
  }
  async function saveExperiment() {
    if (!stats) return;
    try {
      await put("experiments", {
        id: crypto.randomUUID(),
        name: map.name + " · training",
        createdAt: new Date().toISOString(),
        mapId: map.id,
        mapName: map.name,
        algorithm: method,
        result: { config, histories },
      });
      await refresh();
      notify("실험 기록을 저장했습니다.");
    } catch (e) {
      notify(String(e), true);
    }
  }
  function resumeModel(model: SavedModel) {
    try {
      if (locked) throw Error("현재 학습을 먼저 중지하세요.");
      const target =
        model.kind === "checkpoint" || model.mode !== map.mode
          ? validateMap(model.trainingMap)
          : map;
      assertCompatible(model, target);
      chooseMap(target);
      setConfig(model.config);
      setMethod(model.algorithm);
      setTab(model.algorithm);
      training.start(target, model.config, [model.algorithm], model);
      navigate("lab");
      notify(
        model.kind === "inference"
          ? "정책 가중치로 새 학습을 시작했습니다. 옵티마이저는 초기화됩니다."
          : "저장된 학습 맵과 체크포인트에서 재개합니다. PPO는 에피소드 경계부터 시작합니다.",
      );
    } catch (e) {
      notify(String(e), true);
    }
  }
  async function runEvaluation() {
    if (!evaluateModel) return;
    try {
      const target = allMaps.find((m) => m.id === evaluationMap);
      if (!target) throw Error("평가 맵을 선택하세요.");
      assertCompatible(evaluateModel, target);
      setEvaluating(true);
      const worker = new Worker(
        new URL("./workers/evaluator.worker.ts", import.meta.url),
        { type: "module" },
      );
      const result = await new Promise<ReturnType<typeof evaluate>>(
        (resolve, reject) => {
          worker.onmessage = (e) => {
            if (e.data.error) reject(Error(e.data.error));
            else resolve(e.data.result);
            worker.terminate();
          };
          worker.onerror = (e) => {
            worker.terminate();
            reject(Error(e.message));
          };
          worker.postMessage({ model: evaluateModel, map: target });
        },
      );
      setEvaluation(result);
      await put("experiments", {
        id: crypto.randomUUID(),
        name:
          evaluateModel.name +
          " · " +
          (target.id === evaluateModel.mapId
            ? "training-map evaluation"
            : "held-out map evaluation"),
        createdAt: new Date().toISOString(),
        mapId: target.id,
        mapName: target.name,
        algorithm: evaluateModel.algorithm,
        result,
      });
      await refresh();
    } catch (e) {
      notify(String(e), true);
    } finally {
      setEvaluating(false);
    }
  }
  const allMaps = [
    ...EXAMPLE_MAPS.filter((e) => !maps.some((m) => m.id === e.id)),
    ...maps,
  ];
  const changeConfig = (key: keyof Config, value: number) =>
    setConfig((c) => ({ ...c, [key]: value }));
  const object = map.objects.find((o) => o.id === selected);
  const tools: { tool: Tool; icon: LucideIcon; label: string }[] = [
    { tool: "select", icon: MousePointer2, label: "선택 / 이동" },
    { tool: "pan", icon: Hand, label: "화면 이동" },
    ...(map.mode === "racing"
      ? [{ tool: "road" as Tool, icon: Pencil, label: "자유곡선 도로" }]
      : [
          { tool: "platform" as Tool, icon: Layers, label: "고정 발판" },
          { tool: "moving" as Tool, icon: MoveRight, label: "이동 발판" },
          { tool: "spike" as Tool, icon: Zap, label: "가시" },
          { tool: "spring" as Tool, icon: ArrowUpRight, label: "점프대" },
          { tool: "elastic" as Tool, icon: Activity, label: "탄성 발판" },
        ]),
    { tool: "wall", icon: Square, label: "벽" },
    { tool: "start", icon: Flag, label: "시작 위치" },
    { tool: "goal", icon: Target, label: "도착 지점" },
    ...(map.mode === "racing"
      ? [{ tool: "checkpoint" as Tool, icon: GitBranch, label: "체크포인트" }]
      : []),
    { tool: "erase", icon: Trash2, label: "객체 삭제" },
  ];
  return (
    <div className={"app " + (light ? "light" : "")}>
      <aside className={"sidebar " + (sidebar ? "open" : "")}>
        <a className="brand" href="#home" onClick={() => navigate("home")}>
          <span className="brand-symbol">
            <GitBranch size={24} />
          </span>
          <span>
            EvoTrack<span className="brand-dot">.</span>
            <small>AUTONOMOUS LEARNING LAB</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">E</span>
          <div>
            Local workspace<small>브라우저에 안전하게 저장</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {NAV.slice(0, 4).map(({ id, label, icon: Icon }) => (
            <button
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
              key={id}
            >
              <Icon size={18} />
              {label}
              {page === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="nav-label assets-label">LIBRARY</div>
        <nav>
          {NAV.slice(4).map(({ id, label, icon: Icon }) => (
            <button
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
              key={id}
            >
              <Icon size={18} />
              {label}
              {id === "maps" && <span className="count">{allMaps.length}</span>}
              {id === "models" && (
                <span className="count">{models.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-indicator">
            <span />
            100% browser powered
          </div>
          <p>
            서버 없이, 데이터 전송 없이.
            <br />
            당신의 브라우저가 실험실입니다.
          </p>
          <div className="sidebar-footer">
            <span>
              v0.1.0 <b>LOCAL</b>
            </span>
            <IconButton
              icon={Sun}
              label="테마 전환"
              onClick={() => setLight(!light)}
            />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <IconButton
            icon={Menu}
            label="메뉴"
            onClick={() => setSidebar(!sidebar)}
          />
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>{NAV.find((n) => n.id === page)?.label}</span>
          </div>
          <div className="topbar-right">
            <span className="system-status">
              <i /> All systems local
            </span>
            <button
              className="text-btn"
              onClick={() => {
                download({ maps, models, experiments }, "evotrack-workspace");
                notify(
                  "저장된 자료를 백업 파일로 내보냈습니다. 개별 맵·모델 가져오기를 사용하세요.",
                );
              }}
            >
              <Download size={14} /> 데이터 백업
            </button>
            <span className="avatar">EV</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                EVOTRACK /{" "}
                {page === "lab"
                  ? "EXPERIMENT STUDIO"
                  : page === "editor"
                    ? "TRACK BUILDER"
                    : page === "compare"
                      ? "BENCHMARK"
                      : page.toUpperCase()}
              </div>
              <h1>
                {page === "lab"
                  ? "학습 실험실"
                  : page === "editor"
                    ? "맵 에디터"
                    : page === "compare"
                      ? "알고리즘 비교"
                      : page === "home"
                        ? "다음 가능성을, 직접 실험하세요."
                        : NAV.find((n) => n.id === page)?.label}
                <span className="heading-tag">
                  {page === "lab"
                    ? "LIVE WORKSPACE"
                    : page === "editor"
                      ? "CANVAS 2D"
                      : "LOCAL FIRST"}
                </span>
              </h1>
              <p>
                {page === "lab"
                  ? "트랙 위에서 진화하는 지능. 두 가지 알고리즘의 학습 과정을 관찰하세요."
                  : page === "editor"
                    ? "직접 만든 환경이 새로운 학습의 출발점이 됩니다."
                    : page === "compare"
                      ? "같은 환경, 독립된 학습. 환경 스텝과 실제 경과 시간으로 비교합니다."
                      : "만들고, 학습하고, 발견한 것을 보관하세요."}
              </p>
            </div>
            <div className="heading-actions">
              {(page === "lab" || page === "editor") && (
                <>
                  <button className="button" onClick={saveMap}>
                    <Save size={15} /> 맵 저장
                  </button>
                  <button
                    className="button"
                    onClick={() => {
                      if (page === "lab") navigate("editor");
                      else navigate("lab");
                    }}
                  >
                    {page === "lab" ? (
                      <Pencil size={15} />
                    ) : (
                      <FlaskConical size={15} />
                    )}{" "}
                    {page === "lab" ? "맵 편집" : "학습하기"}
                    <ArrowUpRight size={14} />
                  </button>
                </>
              )}
              {["maps", "home"].includes(page) && (
                <button
                  className="button primary"
                  onClick={() => {
                    chooseMap(newMap(map.mode));
                    navigate("editor");
                  }}
                >
                  <Plus size={16} /> 새 맵 만들기
                </button>
              )}
            </div>
          </div>
          {(page === "lab" || page === "editor") && (
            <>
              <div className="mode-row">
                <div className="segmented">
                  <button
                    className={map.mode === "racing" ? "active" : ""}
                    onClick={() => chooseMap(EXAMPLE_MAPS[2])}
                  >
                    <Gauge size={16} /> Racing <small>2D 자율주행</small>
                  </button>
                  <button
                    className={map.mode === "bounce" ? "active" : ""}
                    onClick={() => chooseMap(EXAMPLE_MAPS[4])}
                  >
                    <Activity size={16} /> Bounce <small>물리 퍼즐</small>
                  </button>
                </div>
                <span className="mode-hint">
                  <span className="tiny-dot" />{" "}
                  {map.mode === "racing"
                    ? "12 observations · 5 actions"
                    : "12 observations · 6 actions"}{" "}
                  <span className="divider">/</span> Fixed timestep · 60 Hz
                </span>
              </div>
              <div className={"studio " + (!panel ? "panel-hidden" : "")}>
                <section className="canvas-card">
                  <div className="canvas-heading">
                    <div className="map-title">
                      <span className="map-icon">
                        <MapIcon size={16} />
                      </span>
                      <div>
                        <select
                          aria-label="현재 맵"
                          value={map.id}
                          disabled={locked}
                          onChange={(e) =>
                            chooseMap(
                              allMaps.find((m) => m.id === e.target.value)!,
                            )
                          }
                        >
                          {!allMaps.some((m) => m.id === map.id) && (
                            <option value={map.id}>{map.name}</option>
                          )}
                          {allMaps
                            .filter((m) => m.mode === map.mode)
                            .map((m) => (
                              <option value={m.id} key={m.id}>
                                {m.name}
                              </option>
                            ))}
                        </select>
                        <small>
                          {map.mode === "racing"
                            ? "RACING CIRCUIT"
                            : "BOUNCE COURSE"}{" "}
                          <span>·</span> {map.width} × {map.height}
                        </small>
                      </div>
                    </div>
                    <div className="canvas-heading-right">
                      <span
                        className={
                          "status-badge " + (training.active ? "live" : "")
                        }
                      >
                        <i />
                        {training.active
                          ? "TRAINING"
                          : training.paused
                            ? "PAUSED"
                            : "READY"}
                      </span>
                      <IconButton
                        icon={Settings2}
                        label="설정 패널"
                        onClick={() => setPanel(!panel)}
                        active={panel}
                      />
                    </div>
                  </div>
                  <div className="viewport">
                    <World
                      animate={training.active}
                      map={map}
                      snapshot={page === "lab" ? snapshot : undefined}
                      options={options}
                      editing={page === "editor"}
                      tool={tool}
                      onChange={edit}
                      selected={selected}
                      onSelect={setSelected}
                      zoom={zoom}
                      ghost={training.ghosts[tab]}
                    />
                    <div className="canvas-top-left">
                      <span className="canvas-label">
                        {page === "editor" ? "EDIT MODE" : "SIMULATION VIEW"}
                      </span>
                      {page === "lab" && (
                        <div className="algorithm-switch">
                          <button
                            className={tab === "GA" ? "active ga" : ""}
                            onClick={() => setTab("GA")}
                          >
                            <span />
                            GA
                          </button>
                          <button
                            className={tab === "PPO" ? "active ppo" : ""}
                            onClick={() => setTab("PPO")}
                          >
                            <span />
                            PPO
                          </button>
                        </div>
                      )}
                    </div>
                    {page === "editor" && (
                      <div className="editor-tools">
                        {tools.map((t) => (
                          <IconButton
                            key={t.tool}
                            icon={t.icon}
                            label={t.label}
                            active={tool === t.tool}
                            onClick={() => setTool(t.tool)}
                          />
                        ))}
                        <span className="tool-separator" />
                        <IconButton
                          icon={Undo2}
                          label="실행 취소"
                          onClick={() => history()}
                          disabled={!undo.current.length}
                        />
                        <IconButton
                          icon={Redo2}
                          label="다시 실행"
                          onClick={() => history(true)}
                          disabled={!redo.current.length}
                        />
                      </div>
                    )}
                    {page === "lab" && stats && (
                      <div className="canvas-telemetry">
                        <span>
                          <i className={tab === "GA" ? "ga-dot" : "ppo-dot"} />
                          {tab}{" "}
                          {tab === "GA" ? "BEST POLICY" : "CURRENT POLICY"}
                        </span>
                        <strong>
                          {Math.round(stats.progress * 100)}
                          <small>%</small>
                        </strong>
                        <span>체크포인트 진행률</span>
                        <div className="progress-line">
                          <i style={{ width: `${stats.progress * 100}%` }} />
                        </div>
                      </div>
                    )}
                    <div className="canvas-bottom-left">
                      <span className="coordinate">
                        x {Math.round(snapshot?.state.x ?? map.start.x)}{" "}
                        <span>·</span> y{" "}
                        {Math.round(snapshot?.state.y ?? map.start.y)}
                      </span>
                      <span className="canvas-note">
                        {page === "editor"
                          ? tool === "road"
                            ? "드래그하여 도로를 그리세요 · 체크포인트 자동 생성"
                            : "10 px grid · 선택 도구로 객체 이동"
                          : "DETERMINISTIC ENVIRONMENT · v1"}
                      </span>
                    </div>
                    <div className="zoom-controls">
                      <IconButton
                        icon={ZoomOut}
                        label="축소"
                        onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                      />
                      <span>{Math.round(zoom * 100)}%</span>
                      <IconButton
                        icon={ZoomIn}
                        label="확대"
                        onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                      />
                      <IconButton
                        icon={Maximize2}
                        label="화면 맞춤"
                        onClick={() => setZoom(1)}
                      />
                    </div>
                  </div>
                  <div className="playback-bar">
                    <div className="playback-actions">
                      {page === "lab" ? (
                        <>
                          <button
                            className={
                              "button " + (training.active ? "" : "primary")
                            }
                            onClick={() =>
                              training.active
                                ? training.send("PAUSE")
                                : training.paused
                                  ? training.send("RESUME")
                                  : start()
                            }
                          >
                            {training.active ? (
                              <Pause size={16} />
                            ) : (
                              <Play size={16} />
                            )}{" "}
                            {training.active
                              ? "일시정지"
                              : training.paused
                                ? "학습 재개"
                                : "학습 시작"}
                          </button>
                          <IconButton
                            icon={Square}
                            label="학습 중지"
                            onClick={() => training.send("STOP")}
                            disabled={!locked}
                          />
                          <span className="playback-divider" />
                          <span className="muted small">배속</span>
                          <select
                            aria-label="학습 배속"
                            value={config.speed}
                            onChange={(e) => {
                              const c = {
                                ...config,
                                speed: Number(e.target.value),
                              };
                              setConfig(c);
                              if (locked) training.send("UPDATE_CONFIG", c);
                            }}
                          >
                            {[1, 2, 5, 10].map((n) => (
                              <option key={n} value={n}>
                                {n === 10 ? "MAX / 10×" : n + "×"}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <>
                          <button
                            className="button primary"
                            onClick={() => {
                              try {
                                validateMap(map);
                                notify(
                                  "맵 구조와 출발 위치가 유효합니다. 완주 가능성은 실제 실행으로 확인하세요.",
                                );
                              } catch (e) {
                                notify(String(e), true);
                              }
                            }}
                          >
                            <Check size={16} /> 맵 검사
                          </button>
                          <button
                            className="text-btn"
                            onClick={() => download(validateMap(map), map.name)}
                          >
                            <Download size={15} /> JSON
                          </button>
                        </>
                      )}
                    </div>
                    <span className="runtime">
                      <span className="tiny-dot" />
                      {page === "lab"
                        ? stats
                          ? fmt(stats.stepsPerSecond) + " steps/s"
                          : "학습 대기 중"
                        : "변경 사항은 맵 저장으로 보관"}
                    </span>
                  </div>
                </section>
                {panel && (
                  <aside className="settings-card">
                    <div className="panel-heading">
                      <span>
                        <Settings2 size={16} />{" "}
                        {page === "editor" ? "맵 속성" : "학습 설정"}
                      </span>
                      <IconButton
                        icon={X}
                        label="패널 닫기"
                        onClick={() => setPanel(false)}
                      />
                    </div>
                    {page === "lab" ? (
                      <>
                        <section className="settings-section">
                          <div className="section-label">
                            ALGORITHM <span>01</span>
                          </div>
                          <div className="algorithm-choices">
                            {(["GA", "PPO", "both"] as const).map((a) => (
                              <button
                                key={a}
                                disabled={locked}
                                onClick={() => setMethod(a)}
                                className={method === a ? "chosen" : ""}
                              >
                                <span className="radio" />
                                <span>
                                  {a === "both"
                                    ? "GA + PPO"
                                    : a === "GA"
                                      ? "Genetic Algorithm"
                                      : "Proximal Policy Opt."}
                                  <small>
                                    {a === "both"
                                      ? "독립적인 동시 학습"
                                      : a === "GA"
                                        ? "신경망 가중치의 진화"
                                        : "Actor–Critic 강화학습"}
                                  </small>
                                </span>
                                {a === "both" && (
                                  <span className="recommended">COMPARE</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </section>
                        <section className="settings-section">
                          <div className="section-label">
                            HYPERPARAMETERS <span>02</span>
                          </div>
                          <Field
                            label="개체군 크기"
                            value={config.population}
                            min={4}
                            max={256}
                            onChange={(n) => changeConfig("population", n)}
                            disabled={locked}
                          />
                          <Field
                            label="돌연변이 확률"
                            value={config.mutation}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(n) => changeConfig("mutation", n)}
                            disabled={locked}
                          />
                          <Field
                            label="학습률 (PPO)"
                            value={config.learningRate}
                            min={0.000001}
                            max={0.1}
                            step={0.0001}
                            onChange={(n) => changeConfig("learningRate", n)}
                            disabled={locked}
                          />
                          <Field
                            label="에피소드 최대 스텝"
                            value={config.horizon}
                            min={30}
                            max={10000}
                            step={30}
                            onChange={(n) => changeConfig("horizon", n)}
                            disabled={locked}
                          />
                          <Field
                            label="랜덤 시드"
                            value={config.seed}
                            min={0}
                            max={4294967295}
                            onChange={(n) => changeConfig("seed", n)}
                            disabled={locked}
                          />
                          <button
                            className="advanced-toggle"
                            onClick={() => setAdvanced(!advanced)}
                          >
                            고급 설정{" "}
                            <ChevronDown
                              size={13}
                              style={{
                                transform: advanced ? "rotate(180deg)" : "",
                              }}
                            />
                          </button>
                          {advanced && (
                            <div className="advanced-fields">
                              {(
                                [
                                  ["elite", "엘리트 비율", 0.01, 0.5, 0.01],
                                  ["crossover", "교차 확률", 0, 1, 0.05],
                                  ["sigma", "변이 강도", 0, 2, 0.05],
                                  ["rollout", "Rollout 길이", 16, 4096, 16],
                                  ["epochs", "Epochs", 1, 20, 1],
                                  ["minibatch", "Minibatch", 8, 512, 8],
                                  ["gamma", "Gamma", 0, 1, 0.01],
                                  ["lambda", "GAE lambda", 0, 1, 0.01],
                                  ["clip", "PPO clip", 0.01, 0.5, 0.01],
                                  ["entropy", "Entropy bonus", 0, 1, 0.001],
                                ] as const
                              ).map(([k, l, min, max, step]) => (
                                <Field
                                  key={k}
                                  label={l}
                                  value={config[k]}
                                  min={min}
                                  max={max}
                                  step={step}
                                  disabled={locked}
                                  onChange={(n) => changeConfig(k, n)}
                                />
                              ))}
                            </div>
                          )}
                        </section>
                        <section className="settings-section visualization">
                          <div className="section-label">
                            VISUALIZATION <span>03</span>
                          </div>
                          {(
                            [
                              ["sensors", "센서 광선"],
                              ["trail", "이동 경로"],
                              ["collision", "충돌 영역"],
                              ["all", "전체 GA 개체"],
                              ["ghost", "이전 최고 기록 고스트"],
                            ] as const
                          ).map(([k, l]) => (
                            <label className="toggle-row" key={k}>
                              <span>{l}</span>
                              <input
                                type="checkbox"
                                checked={options[k]}
                                onChange={(e) =>
                                  setOptions((o) => ({
                                    ...o,
                                    [k]: e.target.checked,
                                  }))
                                }
                              />
                              <span className="toggle" />
                            </label>
                          ))}
                        </section>
                        <div className="panel-footnote">
                          <Box size={14} />
                          <span>
                            CPU backend · Web Workers
                            <br />
                            <small>
                              두 알고리즘은 가중치를 공유하지 않습니다.
                            </small>
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <section className="settings-section">
                          <label className="stack-field">
                            맵 이름
                            <input
                              value={map.name}
                              onChange={(e) =>
                                edit({ ...map, name: e.target.value })
                              }
                            />
                          </label>
                          <label className="stack-field">
                            설명
                            <textarea
                              value={map.description}
                              onChange={(e) =>
                                edit({ ...map, description: e.target.value })
                              }
                            />
                          </label>
                          {map.mode === "racing" && (
                            <Field
                              label="도로 폭"
                              value={map.roadWidth}
                              min={30}
                              max={300}
                              onChange={(n) => edit({ ...map, roadWidth: n })}
                            />
                          )}
                          <Field
                            label="출발 방향 (°)"
                            value={Math.round(
                              (map.start.angle * 180) / Math.PI,
                            )}
                            min={-180}
                            max={180}
                            onChange={(n) =>
                              edit({
                                ...map,
                                start: {
                                  ...map.start,
                                  angle: (n * Math.PI) / 180,
                                },
                              })
                            }
                          />
                          <Field
                            label="최고 속도"
                            value={map.physics.maxSpeed}
                            min={10}
                            max={800}
                            onChange={(n) =>
                              edit({
                                ...map,
                                physics: { ...map.physics, maxSpeed: n },
                              })
                            }
                          />
                          {map.mode === "bounce" && (
                            <Field
                              label="중력"
                              value={map.physics.gravity}
                              min={100}
                              max={2500}
                              onChange={(n) =>
                                edit({
                                  ...map,
                                  physics: { ...map.physics, gravity: n },
                                })
                              }
                            />
                          )}
                          <p className="helper">
                            {map.mode === "racing"
                              ? "도로 도구로 드래그하면 출발점·결승선·순서가 있는 체크포인트를 함께 생성합니다."
                              : "도구를 선택하고 캔버스를 눌러 배치하세요. 이동 도구에서 객체를 드래그할 수 있습니다."}
                          </p>
                        </section>
                        {object && (
                          <section className="settings-section">
                            <div className="section-label">
                              SELECTED OBJECT <span>{object.kind}</span>
                            </div>
                            {(
                              [
                                "x",
                                "y",
                                "w",
                                "h",
                                ...(object.kind === "moving"
                                  ? ["amplitude", "period"]
                                  : []),
                              ] as const
                            ).map((k) => (
                              <Field
                                key={k}
                                label={k}
                                value={
                                  object[k as keyof typeof object] as number
                                }
                                min={k === "period" ? 0.5 : 0}
                                max={k === "period" ? 30 : 1000}
                                step={k === "period" ? 0.5 : 10}
                                onChange={(n) =>
                                  edit({
                                    ...map,
                                    objects: map.objects.map((o) =>
                                      o.id === selected ? { ...o, [k]: n } : o,
                                    ),
                                  })
                                }
                              />
                            ))}
                            <div className="row">
                              <button
                                className="button"
                                onClick={() =>
                                  edit({
                                    ...map,
                                    objects: [
                                      ...map.objects,
                                      {
                                        ...object,
                                        id: crypto.randomUUID(),
                                        x: object.x + 20,
                                        y: object.y + 20,
                                      },
                                    ],
                                  })
                                }
                              >
                                <Copy size={14} /> 복제
                              </button>
                              <button
                                className="button"
                                onClick={() => {
                                  edit({
                                    ...map,
                                    objects: map.objects.filter(
                                      (o) => o.id !== selected,
                                    ),
                                  });
                                  setSelected("");
                                }}
                              >
                                <Trash2 size={14} /> 삭제
                              </button>
                            </div>
                          </section>
                        )}
                      </>
                    )}
                  </aside>
                )}
              </div>
              {page === "lab" && (
                <>
                  <div className="metric-grid">
                    {[
                      {
                        label: tab === "GA" ? "GENERATION" : "POLICY UPDATES",
                        value: fmt(stats?.iteration),
                        sub: tab === "GA" ? "진화 세대" : "정책 업데이트",
                        icon: GitBranch,
                      },
                      {
                        label: "ENVIRONMENT STEPS",
                        value: fmt(stats?.steps),
                        sub: fmt(stats?.episodes) + " episodes",
                        icon: Layers,
                      },
                      {
                        label: "BEST EVALUATION",
                        value: fmt(stats?.best, 2),
                        sub: "같은 시드 · 결정론적 정책 평가",
                        icon: Target,
                      },
                      {
                        label: "SUCCESS RATE",
                        value: stats
                          ? fmt(stats.successRate * 100, 1) + "%"
                          : "—",
                        sub: stats
                          ? "평균 완주 " +
                            (stats.completionTime
                              ? fmt(stats.completionTime, 2) + " s"
                              : "—")
                          : "완료된 에피소드 기준",
                        icon: Flag,
                      },
                    ].map(({ label, value, sub, icon: Icon }) => (
                      <div className="metric-card" key={label}>
                        <div>
                          {label}
                          <Icon size={15} />
                        </div>
                        <strong>{value}</strong>
                        <small>{sub}</small>
                      </div>
                    ))}
                  </div>
                  <div className="bottom-grid">
                    <section className="graph-card">
                      <div className="card-heading">
                        <div>
                          <h2>
                            학습 성능 <span>Reward over environment steps</span>
                          </h2>
                        </div>
                        <div className="legend">
                          <span>
                            <i className="ga-dot" /> GA
                          </span>
                          <span>
                            <i className="ppo-dot" /> PPO
                          </span>
                        </div>
                      </div>
                      <Chart histories={histories} />
                      <div className="graph-footer">
                        <span>실제 환경 상호작용 횟수 기준</span>
                        <button
                          className="text-btn"
                          onClick={() => navigate("compare")}
                        >
                          비교 대시보드 <ArrowRight size={13} />
                        </button>
                      </div>
                    </section>
                    <section className="session-card">
                      <div className="card-heading">
                        <h2>세션 정보</h2>
                        <span className="small muted">{tab}</span>
                      </div>
                      <dl>
                        <div>
                          <dt>학습 상태</dt>
                          <dd>{training.statuses[tab] ?? "idle"}</dd>
                        </div>
                        <div>
                          <dt>경과 시간</dt>
                          <dd>{stats ? fmt(stats.elapsed, 1) + " s" : "—"}</dd>
                        </div>
                        <div>
                          <dt>최근 평균 보상</dt>
                          <dd>{fmt(stats?.mean, 2)}</dd>
                        </div>
                        <div>
                          <dt>
                            {tab === "GA"
                              ? "개체군 크기"
                              : "정책 손실 / 가치 손실"}
                          </dt>
                          <dd>
                            {tab === "GA"
                              ? config.population
                              : stats
                                ? fmt(stats.policyLoss, 4) +
                                  " / " +
                                  fmt(stats.valueLoss, 4)
                                : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>{tab === "GA" ? "충돌 횟수" : "Entropy / KL"}</dt>
                          <dd>
                            {tab === "GA"
                              ? fmt(stats?.collisions)
                              : stats
                                ? fmt(stats.entropy, 3) +
                                  " / " +
                                  fmt(stats.kl, 4)
                                : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Tensor 메모리</dt>
                          <dd>
                            {stats
                              ? fmt(stats.bytes / 1024, 1) +
                                " KB · " +
                                stats.tensors
                              : "—"}
                          </dd>
                        </div>
                      </dl>
                      <div className="session-buttons">
                        <button
                          className="button"
                          disabled={!snapshot}
                          onClick={saveInference}
                        >
                          <Save size={14} /> 모델 저장
                        </button>
                        <button
                          className="button"
                          disabled={!snapshot || !locked}
                          onClick={() =>
                            training.send("SAVE_CHECKPOINT", undefined, tab)
                          }
                        >
                          <ArrowDownToLine size={14} /> 체크포인트
                        </button>
                      </div>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
          {page === "home" && (
            <>
              <section className="welcome-card">
                <div>
                  <span className="eyebrow">
                    YOUR BROWSER. YOUR EXPERIMENT.
                  </span>
                  <h2>지능이 길을 찾는 순간.</h2>
                  <p>
                    트랙을 설계하고, 신경망을 학습시키고,
                    <br />
                    진화와 강화학습의 차이를 직접 관찰하세요.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => navigate("lab")}
                  >
                    실험실 열기 <ArrowRight size={16} />
                  </button>
                </div>
                <div className="welcome-visual">
                  <World map={EXAMPLE_MAPS[2]} options={options} />
                </div>
              </section>
              <div className="section-heading">
                <h2>바로 시작하는 실험</h2>
                <button className="text-btn" onClick={() => navigate("maps")}>
                  모든 맵 <ArrowRight size={14} />
                </button>
              </div>
              <div className="library-grid">
                {[EXAMPLE_MAPS[0], EXAMPLE_MAPS[2], EXAMPLE_MAPS[4]].map(
                  (m) => (
                    <MapCard
                      key={m.id}
                      map={m}
                      onOpen={() => {
                        chooseMap(m);
                        navigate("lab");
                      }}
                      onEdit={() => {
                        chooseMap(m);
                        navigate("editor");
                      }}
                    />
                  ),
                )}
              </div>
            </>
          )}
          {page === "maps" && (
            <>
              <div className="library-toolbar">
                <div className="row">
                  <span className="pill">{allMaps.length} MAPS</span>
                  <span className="muted small">
                    9가지 예제와 직접 만든 환경
                  </span>
                </div>
                <button
                  className="button"
                  onClick={() => importRef.current?.click()}
                >
                  <Upload size={15} /> JSON 가져오기
                </button>
              </div>
              <div className="library-grid">
                {allMaps.map((m) => (
                  <MapCard
                    key={m.id}
                    map={m}
                    onOpen={() => {
                      chooseMap(m);
                      navigate("lab");
                    }}
                    onEdit={() => {
                      chooseMap(m);
                      navigate("editor");
                    }}
                    onExport={() => download(m, m.name)}
                    onDelete={
                      maps.some((x) => x.id === m.id)
                        ? () => {
                            void remove("maps", m.id)
                              .then(refresh)
                              .catch((e) => notify(String(e), true));
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </>
          )}
          {page === "models" && (
            <>
              <div className="library-toolbar">
                <span className="muted">
                  정책 가중치와 학습 재개용 체크포인트를 구분하여 보관합니다.
                </span>
                <button
                  className="button"
                  onClick={() => importRef.current?.click()}
                >
                  <Upload size={15} /> 모델 가져오기
                </button>
              </div>
              {!models.length ? (
                <div className="empty-state">
                  <Box size={36} />
                  <h2>첫 번째 정책을 기다리고 있습니다.</h2>
                  <p>학습 실험실에서 모델이나 체크포인트를 저장하세요.</p>
                  <button
                    className="button primary"
                    onClick={() => navigate("lab")}
                  >
                    학습 시작하기 <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <div className="model-list">
                  {models.map((m) => (
                    <article className="model-card" key={m.id}>
                      <div
                        className={"model-icon " + m.algorithm.toLowerCase()}
                      >
                        <GitBranch size={24} />
                      </div>
                      <div className="model-info">
                        <span className="eyebrow">
                          {m.algorithm} · {m.mode} ·{" "}
                          {m.kind === "checkpoint"
                            ? "CHECKPOINT"
                            : "INFERENCE POLICY"}
                        </span>
                        <h3>{m.name}</h3>
                        <p>
                          {fmt(m.stats.steps)} steps ·{" "}
                          {new Date(m.createdAt).toLocaleString("ko-KR")} ·{" "}
                          {m.policy.weights.length} parameters
                        </p>
                        {m.algorithm === "PPO" && m.kind === "checkpoint" && (
                          <small className="muted">
                            에피소드 경계 재개 · Adam 상태 포함
                          </small>
                        )}
                      </div>
                      <div className="row">
                        <button
                          className="button"
                          onClick={() => resumeModel(m)}
                        >
                          <Play size={14} />
                          {m.kind === "checkpoint"
                            ? "재개"
                            : "가중치로 새 학습"}
                        </button>
                        <button
                          className="button"
                          onClick={() => {
                            setEvaluateModel(m);
                            setEvaluation(null);
                            setEvaluationMap(
                              allMaps.find(
                                (x) => x.mode === m.mode && x.id !== m.mapId,
                              )?.id ?? m.mapId,
                            );
                          }}
                        >
                          평가
                        </button>
                        <IconButton
                          icon={Download}
                          label="모델 내보내기"
                          onClick={() => download(m, m.name)}
                        />
                        <IconButton
                          icon={Trash2}
                          label="모델 삭제"
                          onClick={() => {
                            void remove("models", m.id)
                              .then(refresh)
                              .catch((e) => notify(String(e), true));
                          }}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {page === "compare" && (
            <>
              <div className="comparison-grid">
                {(["GA", "PPO"] as const).map((a) => (
                  <section className="graph-card" key={a}>
                    <div className="card-heading">
                      <h2>
                        <i className={a === "GA" ? "ga-dot" : "ppo-dot"} />{" "}
                        {a === "GA"
                          ? "Genetic Algorithm"
                          : "Proximal Policy Optimization"}
                      </h2>
                      <span className="pill">
                        {training.statuses[a] ?? "IDLE"}
                      </span>
                    </div>
                    <div className="comparison-world">
                      <World
                        animate={training.statuses[a] === "running"}
                        map={map}
                        snapshot={training.snapshots[a]}
                        options={options}
                        color={a === "GA" ? "#a7e879" : "#9fafff"}
                      />
                    </div>
                    <div className="comparison-stats">
                      <span>
                        스텝 <b>{fmt(training.snapshots[a]?.stats.steps)}</b>
                      </span>
                      <span>
                        경과 시간{" "}
                        <b>{fmt(training.snapshots[a]?.stats.elapsed, 1)} s</b>
                      </span>
                      <span>
                        평가 보상{" "}
                        <b>{fmt(training.snapshots[a]?.stats.best, 2)}</b>
                      </span>
                    </div>
                  </section>
                ))}
              </div>
              <section className="graph-card compare-chart">
                <div className="card-heading">
                  <h2>동일 환경의 결정론적 정책 평가</h2>
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
                </div>
                <Chart histories={histories} height={220} />
                <div className="graph-footer">
                  <span>
                    세대 수와 업데이트 수는 동일한 학습량이 아닙니다. 스텝 수와
                    경과 시간을 함께 확인하세요.
                  </span>
                  <button
                    className="button"
                    disabled={!stats}
                    onClick={saveExperiment}
                  >
                    <Save size={14} /> 실험 저장
                  </button>
                </div>
              </section>
              <div className="comparison-grid">
                <section className="graph-card">
                  <div className="card-heading">
                    <h2>체크포인트 진행률</h2>
                  </div>
                  <Chart histories={histories} metric="progress" />
                </section>
                <section className="session-card">
                  <div className="card-heading">
                    <h2>GA 적합도 분포</h2>
                  </div>
                  <div className="fitness-bars">
                    {training.snapshots.GA?.stats.fitness.map((v, i) => (
                      <div
                        title={`${i + 1}: ${v.toFixed(2)}`}
                        key={i}
                        style={{
                          height: `${Math.max(4, ((v - Math.min(...training.snapshots.GA!.stats.fitness) + 1) / (Math.max(...training.snapshots.GA!.stats.fitness) - Math.min(...training.snapshots.GA!.stats.fitness) + 1)) * 100)}%`,
                        }}
                      />
                    ))}
                    {!training.snapshots.GA && (
                      <span className="muted small">
                        GA 학습 이후 표시됩니다.
                      </span>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
          {page === "experiments" && (
            <>
              {!experiments.length ? (
                <div className="empty-state">
                  <BookOpen size={36} />
                  <h2>기록된 실험이 없습니다.</h2>
                  <p>
                    비교 대시보드에서 세션을 저장하거나 모델의 일반화 평가를
                    실행하세요.
                  </p>
                </div>
              ) : (
                <div className="model-list">
                  {experiments.map((e) => (
                    <article className="model-card" key={e.id}>
                      <div className="model-icon">
                        <FlaskConical size={24} />
                      </div>
                      <div className="model-info">
                        <span className="eyebrow">
                          {e.algorithm} ·{" "}
                          {new Date(e.createdAt).toLocaleString("ko-KR")}
                        </span>
                        <h3>{e.name}</h3>
                        <p>{e.mapName}</p>
                      </div>
                      <button
                        className="button"
                        onClick={() => download(e, e.name)}
                      >
                        <Download size={14} /> 결과 내보내기
                      </button>
                      <IconButton
                        icon={Trash2}
                        label="실험 삭제"
                        onClick={() => {
                          void remove("experiments", e.id)
                            .then(refresh)
                            .catch((x) => notify(String(x), true));
                        }}
                      />
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          <footer className="main-footer">
            <span>
              <span className="tiny-dot" /> Computed on your device. Stored in
              your browser.
            </span>
            <span>
              EvoTrack <span> / </span> Explore. Evolve. Understand.
            </span>
          </footer>
        </main>
      </div>
      <input
        type="file"
        accept="application/json,.json"
        ref={importRef}
        hidden
        onChange={(e) => void importFile(e.target.files?.[0])}
      />
      {notice && (
        <div
          className={"toast " + (notice.error ? "error" : "")}
          role={notice.error ? "alert" : "status"}
        >
          {notice.error ? <X size={17} /> : <Check size={17} />}
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} aria-label="알림 닫기">
            <X size={14} />
          </button>
        </div>
      )}
      {evaluateModel && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="모델 일반화 평가"
          >
            <div className="card-heading">
              <h2>정책 일반화 평가</h2>
              <IconButton
                icon={X}
                label="평가 닫기"
                onClick={() => setEvaluateModel(null)}
              />
            </div>
            <p className="muted">
              {evaluateModel.name} · 가중치 업데이트 없이 시드 101, 202, 303에서
              평가합니다.
            </p>
            <label className="stack-field">
              평가 환경
              <select
                value={evaluationMap}
                onChange={(e) => {
                  setEvaluationMap(e.target.value);
                  setEvaluation(null);
                }}
              >
                {allMaps
                  .filter((m) => m.mode === evaluateModel.mode)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{" "}
                      {m.id === evaluateModel.mapId ? "(학습 맵)" : "(새 맵)"}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="button primary"
              disabled={evaluating}
              onClick={runEvaluation}
            >
              <Play size={15} />
              {evaluating ? "평가 중…" : "3개 시드로 평가"}
            </button>
            {evaluation && (
              <div className="evaluation-result">
                <span className="eyebrow">
                  {evaluationMap === evaluateModel.mapId
                    ? "TRAINING MAP EVALUATION"
                    : "HELD-OUT MAP EVALUATION"}
                </span>
                <dl>
                  <div>
                    <dt>성공률</dt>
                    <dd>{fmt(evaluation.successRate * 100, 1)}%</dd>
                  </div>
                  <div>
                    <dt>평균 진행도</dt>
                    <dd>{fmt(evaluation.meanProgress * 100, 1)}%</dd>
                  </div>
                  <div>
                    <dt>평균 보상</dt>
                    <dd>{fmt(evaluation.meanReward, 3)}</dd>
                  </div>
                  <div>
                    <dt>평균 완주 시간</dt>
                    <dd>
                      {evaluation.completionTime
                        ? fmt(evaluation.completionTime, 2) + " s"
                        : "완주 없음"}
                    </dd>
                  </div>
                  <div>
                    <dt>실패 원인</dt>
                    <dd>
                      충돌 {evaluation.failures.collision} · 시간 초과{" "}
                      {evaluation.failures.timeout}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function MapCard({
  map,
  onOpen,
  onEdit,
  onExport,
  onDelete,
}: {
  map: TrackMap;
  onOpen: () => void;
  onEdit: () => void;
  onExport?: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className="map-card">
      <button
        className="map-preview"
        onClick={onOpen}
        aria-label={map.name + " 열기"}
      >
        <World
          map={map}
          options={{
            sensors: false,
            trail: false,
            collision: false,
            all: false,
            ghost: false,
          }}
        />
        <span>{map.mode.toUpperCase()}</span>
      </button>
      <div className="map-card-body">
        <h3>{map.name}</h3>
        <p>{map.description}</p>
        <div className="map-card-footer">
          <button className="text-btn" onClick={onOpen}>
            실험 시작 <ArrowUpRight size={14} />
          </button>
          <div className="row">
            <IconButton
              icon={Pencil}
              label={map.name + " 편집"}
              onClick={onEdit}
            />
            {onExport && (
              <IconButton
                icon={Download}
                label={map.name + " 내보내기"}
                onClick={onExport}
              />
            )}{" "}
            {onDelete && (
              <IconButton
                icon={Trash2}
                label={map.name + " 삭제"}
                onClick={onDelete}
              />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
