import { Copy, Trash2 } from "lucide-react";
import type { TrackMap } from "../../core/types";
import {
  moveSelection,
  removeSelection,
  selectionPoint,
  type Selection,
} from "../../core/editor";
import { NumberField, Section } from "../ui";
export function EditorPanel({
  map,
  selection,
  onSelect,
  onChange,
  disabled,
}: {
  map: TrackMap;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  onChange: (m: TrackMap, transaction?: string) => void;
  disabled: boolean;
}) {
  const p = selectionPoint(map, selection),
    object =
      selection?.kind === "object"
        ? map.objects.find((o) => o.id === selection.id)
        : undefined;
  const title = !selection
    ? "맵 속성"
    : selection.kind === "object"
      ? "장애물 속성"
      : selection.kind === "road"
        ? "도로 제어점"
        : selection.kind === "checkpoint"
          ? "체크포인트"
          : selection.kind === "start"
            ? "시작점"
            : "결승점";
  const setPosition = (axis: "x" | "y", value: number) => {
    if (selection && p)
      onChange(
        moveSelection(map, selection, {
          x: axis === "x" ? value - p.x : 0,
          y: axis === "y" ? value - p.y : 0,
        }),
      );
  };
  return (
    <>
      <Section title="맵 정보">
        <label className="stack-field">
          맵 이름
          <input
            value={map.name}
            disabled={disabled}
            maxLength={200}
            onChange={(e) => onChange({ ...map, name: e.target.value })}
          />
        </label>
        <details className="disclosure">
          <summary>설명 편집</summary>
          <label className="stack-field">
            맵 설명
            <textarea
              value={map.description}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...map, description: e.target.value })
              }
            />
          </label>
        </details>
        <p className="element-count">
          도로 {map.road.length}점 · 체크포인트 {map.checkpoints.length}개 ·
          장애물 {map.objects.length}개
        </p>
      </Section>
      <Section
        title={title}
        description={
          selection
            ? "선택한 요소의 위치와 속성을 수정합니다."
            : "캔버스에서 요소를 선택하면 해당 속성이 표시됩니다."
        }
      >
        {selection && p ? (
          <>
            <div className="selection-tag">
              {selection.kind === "road"
                ? "제어점 " + (selection.index + 1)
                : selection.kind === "checkpoint"
                  ? "순서 " + (selection.index + 1)
                  : selection.kind === "object"
                    ? {
                        wall: "벽",
                        platform: "고정 발판",
                        moving: "이동 발판",
                        spike: "가시",
                        spring: "점프대",
                        elastic: "탄성 발판",
                      }[object!.kind]
                    : title}
            </div>
            <NumberField
              label="위치 X"
              value={p.x}
              min={0}
              max={map.width}
              step={10}
              unit="px"
              disabled={disabled}
              onChange={(n) => setPosition("x", n)}
            />
            <NumberField
              label="위치 Y"
              value={p.y}
              min={0}
              max={map.height}
              step={10}
              unit="px"
              disabled={disabled}
              onChange={(n) => setPosition("y", n)}
            />
            {selection.kind === "start" && (
              <NumberField
                label="출발 방향 (°)"
                value={Math.round((map.start.angle * 180) / Math.PI)}
                min={-180}
                max={180}
                unit="°"
                disabled={disabled}
                onChange={(n) =>
                  onChange({
                    ...map,
                    start: { ...map.start, angle: (n * Math.PI) / 180 },
                  })
                }
              />
            )}
            {selection.kind === "checkpoint" && (
              <NumberField
                label="통과 순서"
                value={selection.index + 1}
                min={1}
                max={map.checkpoints.length}
                disabled={disabled}
                onChange={(n) => {
                  const target = Math.max(
                      0,
                      Math.min(map.checkpoints.length - 1, Math.round(n) - 1),
                    ),
                    m = structuredClone(map);
                  const [item] = m.checkpoints.splice(selection.index, 1);
                  m.checkpoints.splice(target, 0, item);
                  onChange(m);
                  onSelect({ kind: "checkpoint", index: target });
                }}
              />
            )}
            {object && (
              <>
                {(
                  [
                    ["w", "가로", 10, map.width, 10, "px"],
                    ["h", "세로", 10, map.height, 10, "px"],
                    ...(object.kind === "moving"
                      ? [
                          ["amplitude", "이동 범위", 0, 500, 10, "px"],
                          ["period", "이동 주기", 0.5, 30, 0.5, "초"],
                        ]
                      : []),
                  ] as [string, string, number, number, number, string][]
                ).map(([key, label, min, max, step, unit]) => (
                  <NumberField
                    key={key}
                    label={label}
                    value={
                      object[key as "w" | "h" | "amplitude" | "period"] ?? 0
                    }
                    min={min}
                    max={max}
                    step={step}
                    unit={unit}
                    disabled={disabled}
                    onChange={(n) =>
                      onChange({
                        ...map,
                        objects: map.objects.map((o) =>
                          o.id === object.id ? { ...o, [key]: n } : o,
                        ),
                      })
                    }
                  />
                ))}
              </>
            )}
            {selection.kind === "road" && (
              <p className="helper">
                전체 도로 두께는 캔버스 위에서 조절하세요. 제어점을 드래그하면
                경로가 바뀝니다.
              </p>
            )}
            <div className="property-actions">
              {object && (
                <button
                  className="button"
                  disabled={disabled}
                  onClick={() => {
                    const copy = {
                      ...object,
                      id: crypto.randomUUID(),
                      x: object.x + 20,
                      y: object.y + 20,
                    };
                    onChange({ ...map, objects: [...map.objects, copy] });
                    onSelect({ kind: "object", id: copy.id });
                  }}
                >
                  <Copy size={15} />
                  복제
                </button>
              )}
              <button
                className="button subtle-danger"
                disabled={disabled}
                onClick={() => {
                  onChange(removeSelection(map, selection));
                  onSelect(null);
                }}
              >
                <Trash2 size={15} />
                선택 요소 삭제
              </button>
            </div>
          </>
        ) : (
          <>
            <NumberField
              label="최고 속도"
              value={map.physics.maxSpeed}
              min={10}
              max={800}
              unit="px/s"
              disabled={disabled}
              onChange={(n) =>
                onChange({ ...map, physics: { ...map.physics, maxSpeed: n } })
              }
            />
            {map.mode === "bounce" && (
              <NumberField
                label="중력"
                value={map.physics.gravity}
                min={100}
                max={2500}
                unit="px/s²"
                disabled={disabled}
                onChange={(n) =>
                  onChange({ ...map, physics: { ...map.physics, gravity: n } })
                }
              />
            )}
            <div className="map-dimensions">
              작업 영역{" "}
              <span>
                {map.width} × {map.height} px
              </span>
            </div>
          </>
        )}
        {!!map.draft?.roadBreaks?.length && (
          <button
            className="button full-width"
            disabled={disabled}
            onClick={() =>
              onChange({ ...map, draft: { ...map.draft, roadBreaks: [] } })
            }
          >
            끊어진 도로 구간 연결
          </button>
        )}
      </Section>
      <Section title="편집 도움말">
        <ul className="shortcut-list">
          <li>
            <span>선택한 요소 삭제</span>
            <kbd>Delete</kbd>
          </li>
          <li>
            <span>실행 취소</span>
            <kbd>Ctrl / ⌘ Z</kbd>
          </li>
          <li>
            <span>다시 실행</span>
            <kbd>Ctrl / ⌘ ⇧ Z</kbd>
          </li>
          <li>
            <span>화면 이동</span>
            <kbd>Space + 드래그</kbd>
          </li>
          <li>
            <span>확대 · 축소</span>
            <span>휠 / 두 손가락</span>
          </li>
        </ul>
        <p className="helper">
          지우개는 도로·체크포인트·시작점·결승점·장애물에 모두 적용됩니다. 삭제
          후에는 실행 취소로 복원할 수 있습니다.
        </p>
      </Section>
    </>
  );
}
