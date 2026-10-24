import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FlaskConical,
  GitBranch,
  Home,
  Map as MapIcon,
  Menu,
  Pencil,
  Play,
  Plus,
  Save,
  Sun,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EXAMPLE_MAPS, newMap, validateMap } from "./core/maps";
import {
  DEFAULT_CONFIG,
  SCHEMAS,
  schemasFor,
  type Algorithm,
  type Config,
  type SavedModel,
  type TrackMap,
} from "./core/types";
import { HeroDemo } from "./components/HeroDemo";
import { World, type ViewOptions } from "./components/World";
import { Chart } from "./components/Chart";
import { WorkspaceTransfer } from "./components/WorkspaceTransfer";
import { Studio } from "./components/studio/Studio";
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
    [options, setOptions] = useState<ViewOptions>({
      sensors: false,
      trail: true,
      collision: false,
      all: false,
      ghost: false,
      populationMode: "all",
    }),
    [notice, setNotice] = useState<{ message: string; error: boolean } | null>(
      null,
    ),
    [sidebar, setSidebar] = useState(false),
    [navCollapsed, setNavCollapsed] = useState(
      () => localStorage.getItem("evotrack-nav-collapsed") === "true",
    ),
    [navWidth, setNavWidth] = useState(() =>
      Math.max(
        192,
        Math.min(
          360,
          Number(localStorage.getItem("evotrack-nav-width")) || 216,
        ),
      ),
    ),
    [sessionMap, setSessionMap] = useState<TrackMap | null>(null),
    [draftSession, setDraftSession] = useState(false),
    [saveChoice, setSaveChoice] = useState(false),
    [showTutorials, setShowTutorials] = useState(false),
    [compactNav, setCompactNav] = useState(() => window.innerWidth <= 1100),
    [light, setLight] = useState(
      () => localStorage.getItem("evotrack-theme") !== "dark",
    ),
    [transfer, setTransfer] = useState(false),
    [difficulty, setDifficulty] = useState("all"),
    [evaluation, setEvaluation] = useState<ReturnType<typeof evaluate> | null>(
      null,
    ),
    [evaluateModel, setEvaluateModel] = useState<SavedModel | null>(null),
    [evaluationMap, setEvaluationMap] = useState(""),
    [evaluating, setEvaluating] = useState(false);
  const pageRef = useRef(page);
  pageRef.current = page;
  const route = useRef<(p: Page) => void>(() => {});
  const baseline = useRef(structuredClone(EXAMPLE_MAPS[2]));
  const dirty = JSON.stringify(map) !== JSON.stringify(baseline.current);
  const guard = useRef<(p: Page) => boolean>(() => true);
  guard.current = (p) =>
    page !== "editor" ||
    p === "editor" ||
    !dirty ||
    window.confirm(
      "저장되지 않은 변경이 있습니다. 저장하지 않고 나가시겠습니까?",
    );
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
  useEffect(() => {
    localStorage.setItem("evotrack-nav-collapsed", String(navCollapsed));
    localStorage.setItem("evotrack-nav-width", String(navWidth));
  }, [navCollapsed, navWidth]);
  const undo = useRef<TrackMap[]>([]),
    hydrated = useRef(false),
    redo = useRef<TrackMap[]>([]),
    importRef = useRef<HTMLInputElement>(null),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const resize = () =>
        setCompactNav(window.innerWidth <= 1100 || location.hash === "#editor"),
      escape = (e: KeyboardEvent) => {
        if (e.key === "Escape") setSidebar(false);
      };
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (sidebar && compactNav)
      requestAnimationFrame(() => {
        (
          document.querySelector(
            ".sidebar nav button",
          ) as HTMLButtonElement | null
        )?.focus();
      });
  }, [sidebar, compactNav]);
  useEffect(() => {
    setCompactNav(window.innerWidth <= 1100 || page === "editor");
    setSidebar(false);
  }, [page]);
  useEffect(() => {
    localStorage.setItem("evotrack-theme", light ? "light" : "dark");
  }, [light]);
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
      if (!hydrated.current) {
        hydrated.current = true;
        setMap((current) => {
          const stored = a.find((m) => m.id === current.id);
          const example = EXAMPLE_MAPS.find((m) => m.id === current.id);
          if (stored && JSON.stringify(current) === JSON.stringify(example)) {
            baseline.current = validateMap(stored);
            return baseline.current;
          }
          return current;
        });
      }
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
      if (NAV.some((n) => n.id === p)) route.current(p);
    };
    window.addEventListener("hashchange", hash);
    return () => {
      window.removeEventListener("hashchange", hash);
      clearTimeout(noticeTimer.current);
    };
  }, []);
  const navigate = (p: Page) => {
    if (!guard.current(p)) {
      window.history.replaceState(null, "", "#" + pageRef.current);
      return;
    }
    if (
      p === "editor" &&
      (training.active || training.paused) &&
      !draftSession
    ) {
      const original = sessionMap ?? map;
      setSessionMap(structuredClone(original));
      const fork = {
        ...structuredClone(original),
        id: crypto.randomUUID(),
        name: original.name + " · 편집본",
      };
      baseline.current = structuredClone(fork);
      setMap(fork);
      setDraftSession(true);
      undo.current = [];
      redo.current = [];
    }
    setPage(p);
    location.hash = p;
    setSidebar(false);
  };
  route.current = navigate;
  const trainingRef = useRef(training);
  trainingRef.current = training;
  const observationRef = useRef(config.trainingMode !== "fast");
  observationRef.current = config.trainingMode !== "fast";
  useEffect(() => {
    if (page !== "lab" && observationRef.current && trainingRef.current.active)
      trainingRef.current.send("PAUSE");
  }, [page]);
  useEffect(() => {
    const hidden = () => {
      if (
        document.hidden &&
        observationRef.current &&
        trainingRef.current.active
      )
        trainingRef.current.send("PAUSE");
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  const histories = training.histories,
    snapshot = training.snapshots[tab],
    stats = snapshot?.stats;
  const locked = training.active || training.paused;
  const lastEditGroup = useRef<string | undefined>(undefined);
  function edit(m: TrackMap, group?: string) {
    if (locked && page !== "editor") return;
    // A cancelled touch gesture restores its initial snapshot without leaving a
    // no-op undo entry or marking the map dirty (e.g. a second finger starts pinch).
    if (
      group &&
      lastEditGroup.current === group &&
      JSON.stringify(undo.current.at(-1)) === JSON.stringify(m)
    ) {
      undo.current.pop();
      lastEditGroup.current = undefined;
      setMap(m);
      return;
    }
    if (!group || lastEditGroup.current !== group)
      undo.current.push(structuredClone(map));
    lastEditGroup.current = group;
    if (undo.current.length > 80) undo.current.shift();
    redo.current = [];
    setMap({ ...m, updatedAt: new Date().toISOString() });
  }
  function chooseMap(m: TrackMap) {
    if (locked && page !== "editor") {
      notify("학습 중에는 편집 화면에서 편집본을 선택하세요.", true);
      return;
    }
    if (!locked) {
      training.clear();
      setSessionMap(null);
      setDraftSession(false);
    }
    baseline.current = structuredClone(m);
    setMap(structuredClone(m));
    if (!locked && m.recommendedHorizon)
      setConfig((c) => ({ ...c, horizon: m.recommendedHorizon! }));
    undo.current = [];
    redo.current = [];
  }
  function history(forward = false) {
    if (locked && page !== "editor") return;
    lastEditGroup.current = undefined;
    const from = forward ? redo : undo,
      to = forward ? undo : redo;
    const last = from.current.pop();
    if (last) {
      to.current.push(map);
      setMap(last);
    }
  }
  async function saveMap(apply?: "next" | "now") {
    try {
      const checked = validateMap(map);
      if (locked && draftSession && !apply) {
        setSaveChoice(true);
        return;
      }
      await put("maps", checked);
      baseline.current = structuredClone(checked);
      setSaveChoice(false);
      if (apply === "now") {
        setSessionMap(structuredClone(checked));
        training.start(
          checked,
          config,
          method === "both" ? ["GA", "PPO"] : [method],
        );
        setDraftSession(false);
        setPage("lab");
        location.hash = "lab";
      }
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
      setSessionMap(structuredClone(map));
      setDraftSession(false);
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
    const source = sessionMap ?? map;
    const m: SavedModel = {
      id: crypto.randomUUID(),
      name: source.name + " · " + tab + " policy",
      kind: "inference",
      algorithm: tab,
      mode: source.mode,
      schemas: schemasFor(source),
      policy: snapshot.policy,
      config: { ...config },
      stats: snapshot.stats,
      mapId: source.id,
      trainingMap: structuredClone(source),
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
    const source = sessionMap ?? map;
    try {
      await put("experiments", {
        id: crypto.randomUUID(),
        name: source.name + " · training",
        createdAt: new Date().toISOString(),
        mapId: source.id,
        mapName: source.name,
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
        model.kind === "checkpoint" ||
        model.mode !== map.mode ||
        model.schemas.environment !== schemasFor(map).environment
          ? validateMap(model.trainingMap)
          : map;
      assertCompatible(model, target);
      chooseMap(target);
      setConfig(model.config);
      setMethod(model.algorithm);
      setTab(model.algorithm);
      setSessionMap(structuredClone(target));
      setDraftSession(false);
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
      const target =
        evaluationMap === "training-map"
          ? evaluateModel.trainingMap
          : allMaps.find((m) => m.id === evaluationMap);
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
  return (
    <div
      className={
        "app " +
        (light ? "light " : "") +
        (page === "editor" ? "editor-mode " : "") +
        (navCollapsed ? "nav-collapsed" : "")
      }
      style={{ "--nav-width": `${navWidth}px` } as React.CSSProperties}
    >
      <aside
        className={"sidebar " + (sidebar ? "open" : "")}
        inert={(compactNav || page === "editor") && !sidebar}
        aria-hidden={(compactNav || page === "editor") && !sidebar}
        aria-label="주요 메뉴"
      >
        <a
          className="brand"
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <span className="brand-symbol">
            <GitBranch size={24} />
          </span>
          <span>
            EvoTrack<span className="brand-dot">.</span>
            <small>자율 학습 시뮬레이터</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">E</span>
          <div>
            내 작업 공간<small>브라우저 로컬 저장</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <button
          className="button sidebar-dismiss"
          onClick={() => setSidebar(false)}
        >
          <X size={15} />
          메뉴 닫기
        </button>
        <div className="nav-label">실험</div>
        <nav>
          {NAV.slice(0, 4).map(({ id, label, icon: Icon }) => (
            <button
              aria-label={label}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
              key={id}
            >
              <Icon size={18} />
              <span className="nav-text">{label}</span>
              {page === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="nav-label assets-label">보관함</div>
        <nav>
          {NAV.slice(4).map(({ id, label, icon: Icon }) => (
            <button
              aria-label={label}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
              key={id}
            >
              <Icon size={18} />
              <span className="nav-text">{label}</span>
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
        <div
          className="nav-resizer"
          role="separator"
          aria-label="사이드바 너비"
          aria-orientation="vertical"
          aria-valuemin={192}
          aria-valuemax={360}
          aria-valuenow={navWidth}
          tabIndex={0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              setNavWidth(Math.max(192, Math.min(360, e.clientX)));
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              setNavWidth((n) =>
                Math.max(
                  192,
                  Math.min(360, n + (e.key === "ArrowRight" ? 16 : -16)),
                ),
              );
            }
          }}
        />
      </aside>
      {sidebar && compactNav && (
        <button
          className="nav-scrim"
          aria-label="메뉴 배경 닫기"
          onClick={() => setSidebar(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <IconButton
            icon={Menu}
            label="메뉴"
            onClick={() =>
              compactNav ? setSidebar(!sidebar) : setNavCollapsed(!navCollapsed)
            }
          />
          <div className="breadcrumb">
            작업 공간 <ChevronRight size={13} />
            <span>{NAV.find((n) => n.id === page)?.label}</span>
          </div>
          <div className="topbar-right">
            <span className="system-status">
              <i /> 브라우저에서 실행
            </span>
            <button className="text-btn" onClick={() => setTransfer(true)}>
              <Download size={14} /> 데이터 백업 · 이전
            </button>
            <span className="avatar">EV</span>
          </div>
        </header>
        <main>
          {page === "editor" && (
            <div className="editor-return">
              <IconButton
                icon={Menu}
                label="메뉴"
                onClick={() => setSidebar(!sidebar)}
              />
              <button className="text-btn" onClick={() => navigate("home")}>
                EvoTrack <span>/ 작업 공간</span>
              </button>
              <IconButton
                icon={Sun}
                label="테마 전환"
                onClick={() => setLight(!light)}
              />
            </div>
          )}
          <div className="page-heading">
            <div>
              <h1>
                {page === "lab"
                  ? "학습 실험실"
                  : page === "editor"
                    ? "맵 에디터"
                    : page === "compare"
                      ? "알고리즘 비교"
                      : page === "home"
                        ? "새로운 실험을 시작하세요."
                        : NAV.find((n) => n.id === page)?.label}
              </h1>
              <p>
                {page === "lab"
                  ? "맵을 선택하고 학습을 시작하세요. 알고리즘별 결과를 한곳에서 비교합니다."
                  : page === "editor"
                    ? "도로와 지형을 만들고, 직접 테스트한 뒤 저장하세요."
                    : page === "compare"
                      ? "같은 환경, 독립된 학습. 환경 스텝과 실제 경과 시간으로 비교합니다."
                      : "만들고, 학습하고, 발견한 것을 보관하세요."}
              </p>
            </div>
            <div className="heading-actions">
              {(page === "lab" || page === "editor") && (
                <>
                  {page === "lab" && (
                    <button className="button" onClick={() => void saveMap()}>
                      <Save size={15} /> 맵 저장
                    </button>
                  )}
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
                  {page === "lab" && (
                    <button
                      className="button"
                      disabled={!models.length}
                      title={
                        models.length
                          ? "저장된 모델을 다른 맵에서 평가합니다."
                          : "학습 후 모델을 저장하면 평가할 수 있습니다."
                      }
                      onClick={() => navigate("models")}
                    >
                      <Target size={15} />
                      모델 평가
                    </button>
                  )}
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
          {draftSession && (
            <div className="draft-session-banner">
              학습 원본: {sessionMap?.name} · 편집본의 변경은 실행 중인 학습에
              영향을 주지 않습니다.{" "}
              {page === "lab" && !locked && (
                <button className="button primary" onClick={start}>
                  편집본으로 새 학습
                </button>
              )}
            </div>
          )}
          {(page === "lab" || page === "editor") && (
            <Studio
              editing={page === "editor"}
              map={page === "editor" ? map : (sessionMap ?? map)}
              maps={allMaps}
              config={config}
              onConfig={setConfig}
              method={method}
              onMethod={setMethod}
              training={training}
              tab={tab}
              onTab={setTab}
              options={options}
              onOptions={setOptions}
              onMapChange={edit}
              onChooseMap={chooseMap}
              canUndo={!!undo.current.length}
              canRedo={!!redo.current.length}
              onUndo={() => history()}
              onRedo={() => history(true)}
              onStart={start}
              onSaveInference={() => void saveInference()}
              onSaveMap={() => void saveMap()}
              onCompare={() => navigate("compare")}
              onModels={() => navigate("models")}
              onError={(message) => notify(message, true)}
            />
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
                  <HeroDemo />
                </div>
              </section>
              <div className="section-heading">
                <h2>바로 시작하는 실험</h2>
                <button className="text-btn" onClick={() => navigate("maps")}>
                  모든 맵 <ArrowRight size={14} />
                </button>
              </div>
              <div className="library-grid">
                {[
                  EXAMPLE_MAPS.find((m) => m.id === "r-sparse-expert")!,
                  EXAMPLE_MAPS.find((m) => m.id === "b-timing-hazards")!,
                  EXAMPLE_MAPS.find((m) => m.id === "b-bomb-relay")!,
                ].map((m) => (
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
                ))}
              </div>
            </>
          )}
          {page === "maps" && (
            <>
              <div className="library-toolbar">
                <div className="row">
                  <span className="pill">{allMaps.length} MAPS</span>
                  <select
                    aria-label="맵 난이도"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                  >
                    <option value="all">모든 난이도</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                  <span className="muted small">
                    {EXAMPLE_MAPS.length}가지 예제와 직접 만든 환경
                  </span>
                </div>
                <button
                  className="button"
                  onClick={() => importRef.current?.click()}
                >
                  <Upload size={15} /> JSON 가져오기
                </button>
              </div>
              <label className="tutorial-filter">
                <input
                  type="checkbox"
                  checked={showTutorials}
                  onChange={(e) => setShowTutorials(e.target.checked)}
                />
                튜토리얼 맵도 보기 (원본 유지)
              </label>
              <div className="library-grid">
                {allMaps
                  .filter(
                    (m) =>
                      showTutorials ||
                      m.category !== "tutorial" ||
                      maps.some((saved) => saved.id === m.id),
                  )
                  .filter(
                    (m) =>
                      difficulty === "all" ||
                      (m.difficulty ?? "Easy") === difficulty,
                  )
                  .map((m) => (
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
                        <small className="model-compatibility">
                          환경 v{m.schemas.environment} ·{" "}
                          {m.schemas.environment === 1
                            ? "이전 판정 규칙"
                            : m.schemas.environment === 3
                              ? "방향 게이트·회전 충돌·발사/탄성 계수"
                              : "방향 게이트·회전 충돌"}
                          {m.kind === "checkpoint" && m.algorithm === "GA"
                            ? " · 세대 경계 재개"
                            : ""}
                        </small>
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
                                (x) =>
                                  x.mode === m.mode &&
                                  x.id !== m.mapId &&
                                  schemasFor(x).environment ===
                                    m.schemas.environment,
                              )?.id ?? "training-map",
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
                        map={sessionMap ?? map}
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
                        관찰 보상{" "}
                        <b>{fmt(training.snapshots[a]?.stats.best, 2)}</b>
                      </span>
                    </div>
                  </section>
                ))}
              </div>
              <section className="graph-card compare-chart">
                <div className="card-heading">
                  <h2>동일 맵에서 수집한 실제 학습 기록</h2>
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
              <span className="tiny-dot" /> 학습과 저장은 이 브라우저에서
              실행됩니다.
            </span>
            <span>
              EvoTrack <span> / </span> 자율 학습 실험 도구
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
      {saveChoice && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="학습 중 편집본 저장"
          >
            <h2>편집본 적용 시점</h2>
            <p>
              실행 중인 학습은 원본 맵을 계속 사용합니다. 지금 반영하려면 새
              맵으로 세션을 재시작해야 합니다.
            </p>
            <button
              className="button primary"
              onClick={() => void saveMap("next")}
            >
              저장 · 다음 세션부터 적용
            </button>
            <button className="button" onClick={() => void saveMap("now")}>
              저장 · 지금 세션 재시작
            </button>
            <button
              className="button quiet"
              onClick={() => setSaveChoice(false)}
            >
              계속 편집
            </button>
          </section>
        </div>
      )}
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
      {transfer && (
        <WorkspaceTransfer
          onClose={() => setTransfer(false)}
          onError={(message) => notify(message, true)}
          onRestored={() => {
            setTransfer(false);
            void refresh();
            notify("작업 공간을 가져왔습니다.");
          }}
        />
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
                <option value="training-map">
                  {evaluateModel.trainingMap.name} (모델에 보존된 학습 맵 · 환경
                  v{evaluateModel.schemas.environment})
                </option>
                {allMaps
                  .filter(
                    (m) =>
                      showTutorials ||
                      m.category !== "tutorial" ||
                      maps.some((saved) => saved.id === m.id),
                  )
                  .filter(
                    (m) =>
                      m.mode === evaluateModel.mode &&
                      schemasFor(m).environment ===
                        evaluateModel.schemas.environment,
                  )
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
                  {evaluationMap === "training-map" ||
                  evaluationMap === evaluateModel.mapId
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
            populationMode: "all",
          }}
        />
        <span>{map.mode.toUpperCase()}</span>
      </button>
      <div className="map-card-body">
        <h3>{map.name}</h3>
        <span className="map-difficulty">{map.difficulty ?? "Easy"}</span>
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
