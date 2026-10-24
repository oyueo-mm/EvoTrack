import { TOOL_GROUPS, toolsFor } from "./editor-tools";
import { TestControls, TEST_HELP_KEY } from "./TestControls";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Eraser,
  Eye,
  EyeOff,
  Flag,
  Hand,
  Layers,
  Lock,
  Maximize2,
  MousePointer2,
  MoveRight,
  Navigation,
  Pencil,
  Play,
  Redo2,
  Save,
  Settings2,
  Square,
  Target,
  Undo2,
  Unlock,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AgentState, Config, Point, TrackMap } from "../../core/types";
import { EXAMPLE_MAPS, validateMap } from "../../core/maps";
import {
  FIT_VIEW,
  removeSelection,
  copySelection,
  pasteSelection,
  type EditorClipboard,
  remapCheckpointLayers,
  selectionKey,
  selectionPoint,
  smoothRoad,
  type Selection,
  type Viewport,
} from "../../core/editor";
import { gateAt } from "../../core/geometry";
import { World, type Tool, type ViewOptions } from "../World";
import { NumberField, RangeField, Section, ToolButton, Toggle } from "../ui";
import { EditorPanel } from "./EditorPanel";

interface Props {
  map: TrackMap;
  maps: TrackMap[];
  options: ViewOptions;
  config: Config;
  locked: boolean;
  onChange: (map: TrackMap, group?: string) => void;
  onChoose: (map: TrackMap) => void;
  onSave: () => void;
  onError: (message: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}
function readCamera(id: string): Viewport {
  try {
    const v = JSON.parse(
      sessionStorage.getItem("evotrack-camera:" + id) ?? "null",
    );
    if (
      v &&
      Number.isFinite(v.zoom) &&
      v.zoom >= 0.4 &&
      v.zoom <= 4 &&
      Number.isFinite(v.pan?.x) &&
      Number.isFinite(v.pan?.y)
    )
      return v;
  } catch {
    /* A missing or unavailable session cache falls back to fit. */
  }
  return FIT_VIEW;
}
const labels = {
  wall: "벽",
  platform: "고정 발판",
  moving: "이동 발판",
  crumble: "일회용 발판",
  spike: "가시",
  spring: "점프대",
  elastic: "탄성 발판",
  bomb: "폭탄",
  respawn: "부활 지점",
  belt: "속도 벨트",
  reward: "중간 보상",
};
export function EditorWorkspace({
  map,
  maps,
  options,
  config,
  locked,
  onChange: commitChange,
  onChoose,
  onSave,
  onError,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [view, setView] = useState<Viewport>(() => readCamera(map.id));
  const [panel, setPanel] = useState(() => innerWidth > 900);
  const [tab, setTab] = useState<"properties" | "layers" | "settings">(
    "properties",
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [locks, setLocks] = useState<Set<string>>(new Set());
  const [radius, setRadius] = useState(22);
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [snapRightAngles, setSnapRightAngles] = useState(true);
  const [respawnToken, setRespawnToken] = useState(0);
  const [testing, setTesting] = useState(false);
  const [helpReset, setHelpReset] = useState(0);
  const [testRun, setTestRun] = useState(0);
  const [testState, setTestState] = useState<AgentState | null>(null);
  const [pressed, setPressed] = useState<string[]>([]);
  const [append, setAppend] = useState(true);
  const lastMap = useRef(map.id);
  const clipboard = useRef<EditorClipboard | null>(null);
  const pasteOffset = useRef(20);
  const onChange = (next: TrackMap, group?: string) => {
    next = {
      ...next,
      checkpoints: next.checkpoints.map((p, order) =>
        p.id ? { ...p, order } : p,
      ),
    };
    if (
      next.checkpoints.length !== map.checkpoints.length ||
      next.checkpoints.some((p, i) => p.id !== map.checkpoints[i]?.id)
    ) {
      setHidden((keys) => remapCheckpointLayers(map, next, keys));
      setLocks((keys) => remapCheckpointLayers(map, next, keys));
      if (selected?.kind === "checkpoint") setSelected(null);
    }
    commitChange(next, group);
  };
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "evotrack-camera:" + lastMap.current,
        JSON.stringify(view),
      );
    } catch {
      /* Optional camera cache. */
    }
    if (lastMap.current !== map.id) {
      setView(readCamera(map.id));
      lastMap.current = map.id;
      setSelected(null);
      setHidden(new Set());
      setLocks(new Set());
      setTesting(false);
    }
  }, [map.id, view]);
  const disabled = testing;
  const selectedLocked =
    !!selected &&
    (locks.has(selectionKey(selected)) || hidden.has(selectionKey(selected)));
  let validation = "";
  try {
    validateMap(map);
  } catch (e) {
    validation = e instanceof Error ? e.message : String(e);
  }
  const saved = maps.find((m) => m.id === map.id);
  const dirty = !saved || JSON.stringify(saved) !== JSON.stringify(map);
  const select = (s: Selection | null) => {
    setSelected(s);
    if (innerWidth > 900) setTab("properties");
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.matches(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (e.code === "Escape") {
        setSelected(null);
        if (innerWidth <= 900) setPanel(false);
      }
      if (disabled) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && ["KeyC", "KeyV", "KeyX", "KeyD"].includes(e.code)) {
        if (e.code === "KeyC" || e.code === "KeyX") {
          const copied = copySelection(map, selected);
          if (copied) {
            e.preventDefault();
            clipboard.current = copied;
            pasteOffset.current = 20;
          }
          if (copied && e.code === "KeyX" && selected && !selectedLocked) {
            onChange(removeSelection(map, selected));
            setSelected(null);
          }
        } else {
          if (e.code === "KeyD") {
            const copied = copySelection(map, selected);
            if (!copied) return;
            clipboard.current = copied;
            pasteOffset.current = 20;
          }
          if (!clipboard.current) return;
          e.preventDefault();
          if (
            (map.environmentVersion ?? 1) < 2 &&
            (clipboard.current.value.angle ?? 0) !== 0
          ) {
            onError(
              "회전 요소를 붙여넣으려면 맵 설정에서 새 환경 편집본을 만드세요.",
            );
            return;
          }
          const pasted = pasteSelection(
            map,
            clipboard.current,
            pasteOffset.current,
          );
          pasteOffset.current += 20;
          onChange(pasted.map);
          setSelected(pasted.selection);
        }
      } else if (meta && ["KeyZ", "KeyY", "KeyS"].includes(e.code)) {
        e.preventDefault();
        if (e.code === "KeyS") onSave();
        else if (e.shiftKey || e.code === "KeyY") onRedo();
        else onUndo();
      } else if (!meta) {
        const shortcuts: Partial<Record<string, Tool>> = {
          KeyV: "select",
          KeyP: map.mode === "racing" ? "road" : "platform",
          KeyH: "pan",
          KeyE: "erase",
          KeyC: "checkpoint",
          KeyS: "start",
          KeyG: "goal",
          KeyW: "wall",
        };
        if (shortcuts[e.code]) {
          setTool(shortcuts[e.code]!);
          setSelected(null);
        }
        if (e.code === "Digit1" || e.code === "KeyF") {
          setView(FIT_VIEW);
          e.preventDefault();
        }
        if (
          (e.code === "Delete" || e.code === "Backspace") &&
          selected &&
          !selectedLocked
        ) {
          e.preventDefault();
          onChange(removeSelection(map, selected));
          setSelected(null);
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    disabled,
    map,
    selected,
    selectedLocked,
    onUndo,
    onRedo,
    onSave,
    onChange,
  ]);
  const tools = toolsFor(map.mode);
  const [compactTools, setCompactTools] = useState(() => innerWidth <= 900),
    [openToolGroup, setOpenToolGroup] = useState<string | null>(null);
  useEffect(() => {
    const resize = () => setCompactTools(innerWidth <= 900);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const layers: { s: Selection; label: string }[] = [
    ...(map.road.length
      ? [
          {
            s: { kind: "road", index: 0 } as Selection,
            label: `도로 · ${map.road.length}개 제어점`,
          },
        ]
      : []),
    ...(!map.draft?.missingStart
      ? [{ s: { kind: "start" } as Selection, label: "시작점" }]
      : []),
    ...(!map.draft?.missingGoal
      ? [{ s: { kind: "goal" } as Selection, label: "결승점" }]
      : []),
    ...map.checkpoints.map((_, index) => ({
      s: { kind: "checkpoint", index } as Selection,
      label: `체크포인트 ${index + 1}`,
    })),
    ...map.objects.map((o, index) => ({
      s: { kind: "object", id: o.id } as Selection,
      label: `${labels[o.kind]} ${o.name || index + 1}`,
    })),
  ];
  const toggle = (set: typeof setHidden, key: string) =>
    set((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const focusSelected = () => {
    const p = selectionPoint(map, selected);
    if (p)
      setView((v) => ({
        zoom: Math.max(v.zoom, 1.4),
        pan: { x: map.width / 2 - p.x, y: map.height / 2 - p.y },
      }));
  };
  const test = () => {
    if (validation) {
      onError(validation);
      return;
    }
    setTestRun((n) => n + 1);
    setTesting(true);
    setTestState(null);
    setPressed([]);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLCanvasElement>('[aria-label="맵 편집 캔버스"]')
        ?.focus(),
    );
  };
  const manualAction = !pressed.length
    ? -1
    : map.mode === "racing"
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
          : 2;
  return (
    <section
      className="editor-workspace"
      aria-label="맵 편집 작업 공간"
      data-environment-version={map.environmentVersion}
    >
      <header className="editor-header">
        <div className="editor-document">
          <input
            aria-label="맵 이름"
            value={map.name}
            maxLength={200}
            disabled={disabled}
            onChange={(e) => onChange({ ...map, name: e.target.value })}
          />
          <span className="save-state" role="status">
            {dirty ? "저장되지 않은 변경" : "저장됨"}
          </span>
        </div>
        <select
          aria-label="환경 모드"
          value={map.mode}
          disabled={disabled}
          onChange={(e) =>
            onChoose(EXAMPLE_MAPS[e.target.value === "racing" ? 2 : 4])
          }
        >
          <option value="racing">Racing</option>
          <option value="bounce">Bounce</option>
        </select>
        <div className="editor-header-actions">
          <button
            className="button"
            disabled={false}
            onClick={() =>
              testing ? (setTesting(false), setPressed([])) : test()
            }
          >
            <Play size={15} />
            {testing ? "테스트 종료" : "테스트 실행"}
          </button>
          <button
            className="button primary"
            disabled={disabled}
            onClick={onSave}
          >
            <Save size={15} />맵 저장
          </button>
          <button
            className="icon-btn"
            aria-label={panel ? "패널 접기" : "속성 열기"}
            aria-expanded={panel}
            onClick={() => setPanel(!panel)}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </header>
      <div className={"editor-body " + (panel ? "with-inspector" : "")}>
        <div className="editor-stage">
          <div
            className="floating-tools grouped-tools"
            role="toolbar"
            aria-label="맵 편집 도구"
          >
            {TOOL_GROUPS.map((group) => (
              <details
                key={group}
                className="tool-group"
                open={!compactTools || openToolGroup === group}
                data-active={tools.some(
                  (t) => t.group === group && t.id === tool,
                )}
              >
                <summary
                  onClick={(e) => {
                    e.preventDefault();
                    if (compactTools)
                      setOpenToolGroup((v) => (v === group ? null : group));
                  }}
                >
                  {group}
                </summary>
                <div
                  className="tool-group-items"
                  role="group"
                  aria-label={group}
                >
                  {group === "편집 기록" ? (
                    <>
                      <ToolButton
                        icon={Undo2}
                        label="실행 취소"
                        description="마지막 편집 되돌리기"
                        hint="Ctrl Z"
                        disabled={!canUndo || disabled}
                        onClick={onUndo}
                      />
                      <ToolButton
                        icon={Redo2}
                        label="다시 실행"
                        description="되돌린 편집 복원"
                        hint="Ctrl Shift Z"
                        disabled={!canRedo || disabled}
                        onClick={onRedo}
                      />
                    </>
                  ) : (
                    tools
                      .filter((t) => t.group === group)
                      .map((t) => (
                        <span
                          key={t.id}
                          data-tool-id={t.id}
                          data-tool-icon={t.iconName}
                        >
                          <ToolButton
                            icon={t.icon}
                            label={t.label}
                            description={t.description}
                            hint={t.hint}
                            active={tool === t.id}
                            disabled={disabled}
                            onClick={() => {
                              setTool(t.id);
                              setSelected(null);
                              setTab("properties");
                              if (compactTools) setOpenToolGroup(null);
                            }}
                          />
                        </span>
                      ))
                  )}
                </div>
              </details>
            ))}
          </div>
          <div className="editor-canvas">
            <World
              key={testing ? `test-${testRun}` : "edit"}
              map={map}
              options={options}
              editing
              tool={tool}
              selected={selected}
              onSelect={select}
              onChange={disabled || selectedLocked ? undefined : onChange}
              viewport={view}
              onViewportChange={setView}
              interactive
              keyboardDelete={false}
              overview
              eraserSize={radius}
              hidden={hidden}
              lockedLayers={locks}
              onCursor={setCursor}
              roadAppend={append}
              testing={testing}
              seed={config.seed}
              horizon={config.horizon}
              onTestState={setTestState}
              manualAction={manualAction}
              manualButtons={pressed}
              respawnToken={respawnToken}
              snapRightAngles={snapRightAngles}
            />
          </div>
          <div className="editor-camera">
            <ToolButton
              icon={ZoomOut}
              label="축소"
              onClick={() =>
                setView((v) => ({ ...v, zoom: Math.max(0.4, v.zoom / 1.2) }))
              }
            />
            <output aria-label="현재 줌 배율">
              {Math.round(view.zoom * 100)}%
            </output>
            <ToolButton
              icon={ZoomIn}
              label="확대"
              onClick={() =>
                setView((v) => ({ ...v, zoom: Math.min(4, v.zoom * 1.2) }))
              }
            />
            <ToolButton
              icon={Maximize2}
              label="화면 맞춤"
              hint="F / 1"
              onClick={() => setView(FIT_VIEW)}
            />
          </div>
          {testing && (
            <TestControls
              key={helpReset}
              mode={map.mode}
              state={testState}
              onRespawn={() => setRespawnToken((n) => n + 1)}
              onPress={(k) => setPressed((p) => [...new Set([...p, k])])}
              onRelease={(k) => setPressed((p) => p.filter((x) => x !== k))}
            />
          )}
        </div>
        {panel && (
          <>
            <button
              className="inspector-scrim"
              aria-label="설정 배경 닫기"
              onClick={() => setPanel(false)}
            />
            <aside className="editor-inspector" aria-label="속성과 레이어">
              <div className="panel-heading">
                <h2>요소와 속성</h2>
                <button
                  className="icon-btn"
                  aria-label="패널 닫기"
                  onClick={() => setPanel(false)}
                >
                  <X size={17} />
                </button>
              </div>
              <div
                className="inspector-tabs"
                role="tablist"
                aria-label="Inspector"
              >
                {(
                  [
                    ["properties", "속성"],
                    ["layers", "레이어"],
                    ["settings", "맵 설정"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    aria-controls={`inspector-${key}`}
                    id={`tab-${key}`}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                className="inspector-content"
                role="tabpanel"
                id={`inspector-${tab}`}
                aria-labelledby={`tab-${tab}`}
              >
                <button
                  className="button restore-test-help"
                  onClick={() => {
                    localStorage.removeItem(TEST_HELP_KEY);
                    localStorage.removeItem("evotrack-test-help-seen");
                    setHelpReset((n) => n + 1);
                  }}
                >
                  테스트 조작 안내 다시 켜기
                </button>
                <div className="snap-option">
                  <Toggle
                    label="자석형 직각 스냅 (Alt: 임시 해제)"
                    checked={snapRightAngles}
                    onChange={setSnapRightAngles}
                  />
                </div>
                {tab === "properties" && (
                  <>
                    <Section
                      title={
                        tools.find((t) => t.id === tool)?.label ?? "도구 옵션"
                      }
                    >
                      {map.mode === "racing" && tool !== "erase" && (
                        <RangeField
                          label="도로 두께"
                          value={map.roadWidth}
                          min={30}
                          max={300}
                          numberInput
                          unit="px"
                          disabled={disabled}
                          onChange={(n, group) =>
                            onChange({ ...map, roadWidth: n }, group)
                          }
                        />
                      )}
                      {tool === "erase" && (
                        <RangeField
                          label="지우개 반경"
                          value={radius}
                          min={8}
                          max={80}
                          unit="px"
                          onChange={setRadius}
                        />
                      )}
                      {tool === "road" && (
                        <>
                          <label className="stack-field">
                            경로 제작
                            <select
                              aria-label="경로 제작 방식"
                              value={append ? "append" : "replace"}
                              onChange={(e) =>
                                setAppend(e.target.value === "append")
                              }
                            >
                              <option value="append">
                                기존 도로에 제어점 추가
                              </option>
                              <option value="replace">새 경로로 교체</option>
                            </select>
                          </label>
                          <p className="helper">
                            클릭해 점을 추가하거나 드래그해 경로를 그리세요.
                            선택 도구로 제어점을 이동할 수 있습니다.
                          </p>
                          <button
                            className="button full-width"
                            disabled={
                              disabled ||
                              map.road.length < 3 ||
                              map.road.length > 500 ||
                              !!map.draft?.roadBreaks?.length
                            }
                            onClick={() => onChange(smoothRoad(map))}
                          >
                            도로 곡선 다듬기
                          </button>
                          <p className="helper">
                            도로만 다듬습니다. 체크포인트는 추가하거나 이동하지
                            않습니다.
                          </p>
                        </>
                      )}
                      {tool === "erase" && (
                        <p className="helper">
                          원을 따라 드래그해 삭제합니다. 숨기거나 잠근 레이어는
                          보호됩니다. Ctrl Z로 복원하세요.
                        </p>
                      )}
                      {tool === "select" && (
                        <p className="helper">
                          요소를 클릭하고 드래그하세요. 겹친 요소는 클릭할
                          때마다 순환합니다. 빈 공간이나 우클릭 드래그로 화면을
                          이동합니다.
                        </p>
                      )}
                      <p className="element-count">
                        도로 {map.road.length}점 · 체크포인트{" "}
                        {map.checkpoints.length}개 · 장애물 {map.objects.length}
                        개
                      </p>
                    </Section>
                    {selected && (
                      <button
                        className="button focus-selection"
                        onClick={focusSelected}
                      >
                        <Navigation size={15} />
                        선택 요소로 이동
                      </button>
                    )}
                    {selectedLocked && (
                      <p className="helper">
                        숨겨지거나 잠긴 요소입니다. 레이어에서 해제 후
                        편집하세요.
                      </p>
                    )}
                    <EditorPanel
                      map={map}
                      selection={selected}
                      onSelect={setSelected}
                      onChange={onChange}
                      disabled={disabled || selectedLocked}
                      view="properties"
                    />
                  </>
                )}
                {tab === "layers" && (
                  <>
                    <div className="layer-intro">
                      <Layers size={18} />
                      <span>요소 {layers.length}개</span>
                      <small>표시와 잠금은 현재 편집에만 적용</small>
                    </div>
                    <div className="layer-list">
                      {layers.map(({ s, label }) => {
                        const key = selectionKey(s);
                        return (
                          <div
                            className={
                              "layer-row " +
                              (selected && selectionKey(selected) === key
                                ? "active"
                                : "")
                            }
                            key={key}
                          >
                            <button
                              className="layer-name"
                              aria-label={`레이어 선택 ${label}`}
                              onClick={() => {
                                setSelected(s);
                              }}
                            >
                              <span>
                                {s.kind === "object" ? (
                                  <Square size={14} />
                                ) : s.kind === "road" ? (
                                  <Pencil size={14} />
                                ) : (
                                  <Flag size={14} />
                                )}
                              </span>
                              {label}
                            </button>
                            <button
                              className="icon-btn"
                              aria-label={`${label} ${hidden.has(key) ? "표시" : "숨기기"}`}
                              aria-pressed={hidden.has(key)}
                              onClick={() => toggle(setHidden, key)}
                            >
                              {hidden.has(key) ? (
                                <EyeOff size={14} />
                              ) : (
                                <Eye size={14} />
                              )}
                            </button>
                            <button
                              className="icon-btn"
                              aria-label={`${label} ${locks.has(key) ? "잠금 해제" : "잠금"}`}
                              aria-pressed={locks.has(key)}
                              onClick={() => toggle(setLocks, key)}
                            >
                              {locks.has(key) ? (
                                <Lock size={14} />
                              ) : (
                                <Unlock size={14} />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {selected && (
                      <button
                        className="button focus-selection"
                        onClick={focusSelected}
                      >
                        <Navigation size={15} />
                        선택 요소로 이동
                      </button>
                    )}
                  </>
                )}
                {tab === "settings" && (
                  <>
                    <EditorPanel
                      map={map}
                      selection={null}
                      onSelect={setSelected}
                      onChange={onChange}
                      disabled={disabled}
                      view="settings"
                    />
                    <Section title="작업 영역">
                      <NumberField
                        label="맵 가로"
                        value={map.width}
                        min={100}
                        max={5000}
                        unit="px"
                        disabled={disabled}
                        onChange={(n) => onChange({ ...map, width: n })}
                      />
                      <NumberField
                        label="맵 세로"
                        value={map.height}
                        min={100}
                        max={5000}
                        unit="px"
                        disabled={disabled}
                        onChange={(n) => onChange({ ...map, height: n })}
                      />
                      <NumberField
                        label="최고 속도"
                        value={map.physics.maxSpeed}
                        min={10}
                        max={800}
                        unit="px/s"
                        disabled={disabled}
                        onChange={(n) =>
                          onChange({
                            ...map,
                            physics: { ...map.physics, maxSpeed: n },
                          })
                        }
                      />
                      {map.mode === "bounce" && (
                        <NumberField
                          label="중력"
                          value={map.physics.gravity}
                          min={100}
                          max={2500}
                          disabled={disabled}
                          onChange={(n) =>
                            onChange({
                              ...map,
                              physics: { ...map.physics, gravity: n },
                            })
                          }
                        />
                      )}
                      <button
                        className="button full-width"
                        disabled={disabled}
                        onClick={() => {
                          onChange({
                            ...map,
                            road: [],
                            checkpoints: [],
                            objects: [],
                            draft: { missingStart: true, missingGoal: true },
                          });
                          setSelected(null);
                        }}
                      >
                        요소 비우기 · 실행 취소 가능
                      </button>
                    </Section>
                  </>
                )}
              </div>
            </aside>
          </>
        )}
      </div>
      <footer className="editor-status">
        <span>
          {tools.find((t) => t.id === tool)?.label}
          <span className="status-coordinates">
            {" "}
            · x {Math.round(cursor.x)} y {Math.round(cursor.y)}
          </span>
        </span>
        <span>
          {selected
            ? layers.find((l) => selectionKey(l.s) === selectionKey(selected))
                ?.label
            : "선택 없음"}
        </span>
        <span className={validation ? "validation-message" : "valid-message"}>
          {validation || "테스트와 저장이 가능한 맵입니다."}
        </span>
        <span>
          {map.width} × {map.height}
        </span>
      </footer>
    </section>
  );
}
