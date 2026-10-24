import { useEffect, useState } from "react";
import type { AgentState, Mode } from "../../core/types";
export const TEST_HELP_KEY = "evotrack-test-help-never";
export function TestControls({
  mode,
  state,
  onRespawn,
  onPress,
  onRelease,
}: {
  mode: Mode;
  state: AgentState | null;
  onRespawn: () => void;
  onPress: (key: string) => void;
  onRelease: (key: string) => void;
}) {
  const focusCanvas = () =>
    document
      .querySelector<HTMLCanvasElement>('[aria-label="맵 편집 캔버스"]')
      ?.focus({ preventScroll: true });
  const [never, setNever] = useState(
    () => localStorage.getItem(TEST_HELP_KEY) === "true",
  );
  const [expanded, setExpanded] = useState(
    () =>
      localStorage.getItem(TEST_HELP_KEY) !== "true" &&
      !localStorage.getItem("evotrack-test-help-seen"),
  );
  useEffect(() => {
    localStorage.setItem("evotrack-test-help-seen", "true");
  }, []);
  return (
    <div className="editor-test compact-test">
      <div className="test-controls-bar">
        <output aria-label="테스트 에이전트 위치">
          x {Math.round(state?.x ?? 0)} · y {Math.round(state?.y ?? 0)}
        </output>
        <button
          className="button"
          onClick={() => {
            onRespawn();
            focusCanvas();
          }}
        >
          즉시 부활 (R)
        </button>
        <output aria-label="테스트 부활 횟수">
          부활 {state?.respawns ?? 0}회
        </output>
        <button
          className="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
            if (expanded) focusCanvas();
          }}
        >
          조작 안내
        </button>
      </div>
      {state?.shapingTotal !== undefined && (
        <output aria-label="중간 보상 누적">
          중간 보상 {state.shapingTotal.toFixed(2)}
        </output>
      )}
      {expanded && (
        <div className="test-help-card" aria-label="테스트 조작 안내">
          <button
            className="icon-btn"
            aria-label="조작 안내 닫기"
            onClick={() => {
              setExpanded(false);
              focusCanvas();
            }}
          >
            ×
          </button>
          <p>
            {mode === "racing"
              ? "W/↑ 전진 · S/↓ 후진 · A/D 조향 · Space 부스트 · R 부활"
              : "A/D 이동 · W/↑ 점프 · S/↓ 빠른 낙하 · Space 감속 · R 부활"}
          </p>
          <p className="helper">
            {mode === "bounce"
              ? "마지막 부활 표식, 없으면 시작점에서 재시도합니다."
              : "실패하면 시작점으로 복귀합니다. 게이트는 진행도·보상을 위한 요소입니다."}
          </p>
          <label>
            <input
              type="checkbox"
              aria-label="다시 보지 않기"
              checked={never}
              onChange={(e) => {
                setNever(e.target.checked);
                localStorage.setItem(TEST_HELP_KEY, String(e.target.checked));
              }}
            />
            다시 보지 않기
          </label>
        </div>
      )}
      <div className="row test-touch-controls">
        {(mode === "racing"
          ? [
              ["left", "←"],
              ["forward", "전진"],
              ["reverse", "후진"],
              ["right", "→"],
              ["boost", "부스트"],
            ]
          : [
              ["left", "←"],
              ["jump", "점프"],
              ["right", "→"],
              ["brake", "감속"],
            ]
        ).map(([k, label]) => (
          <button
            className="button"
            key={k}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              onPress(k);
            }}
            onPointerUp={() => onRelease(k)}
            onPointerCancel={() => onRelease(k)}
            onLostPointerCapture={() => onRelease(k)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
