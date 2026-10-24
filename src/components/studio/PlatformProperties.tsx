import type { MapObject } from "../../core/types";
import { NumberField, Toggle } from "../ui";
export function PlatformProperties({
  object,
  disabled,
  onChange,
}: {
  object: MapObject;
  disabled: boolean;
  onChange: (patch: Partial<MapObject>) => void;
}) {
  return object.kind === "moving" ? (
    <>
      <p className="helper">
        위아래 또는 좌우로 움직이는 발판입니다. 발판에 올라타면 함께 이동할 수
        있습니다.
      </p>
      <label>
        이동 방향
        <select
          aria-label="이동 방향"
          disabled={disabled}
          value={object.moveAxis ?? "horizontal"}
          onChange={(e) =>
            onChange({ moveAxis: e.target.value as MapObject["moveAxis"] })
          }
        >
          <option value="horizontal">가로</option>
          <option value="vertical">세로</option>
          <option value="custom">사용자 지정</option>
        </select>
      </label>
      {object.moveAxis === "custom" && (
        <NumberField
          label="이동 방향 각도"
          min={-360}
          max={360}
          unit="°"
          value={((object.moveAngle ?? 0) * 180) / Math.PI}
          disabled={disabled}
          onChange={(n) => onChange({ moveAngle: (n * Math.PI) / 180 })}
        />
      )}
      <NumberField
        label="시작 위상"
        min={-360}
        max={360}
        unit="°"
        value={((object.phase ?? 0) * 180) / Math.PI}
        disabled={disabled}
        onChange={(n) => onChange({ phase: (n * Math.PI) / 180 })}
      />
      <output aria-label="이동 최대 속도">
        최대 속도{" "}
        {(
          (Math.abs(object.amplitude ?? 60) * 2 * Math.PI) /
          (object.period ?? 3)
        ).toFixed(1)}{" "}
        px/s
      </output>
      <p className="helper">
        사인파 왕복 · 이동 범위는 중심에서 한쪽 끝까지의 진폭입니다. 최대 속도 =
        진폭 × 2π ÷ 주기. 속도는 범위·주기로 결정됩니다.
      </p>
    </>
  ) : object.kind === "crumble" ? (
    <>
      <p className="helper">
        한 번 밟으면 일정 시간 뒤 무너지는 발판입니다. 다음 시도에서 복원됩니다.
      </p>
      <NumberField
        label="붕괴 지연"
        min={0.05}
        max={10}
        step={0.05}
        unit="초"
        value={object.collapseDelay ?? 0.4}
        disabled={disabled}
        onChange={(n) => onChange({ collapseDelay: n })}
      />
      <Toggle
        label="에피소드 중 발판 복원"
        checked={object.regenerate ?? false}
        disabled={disabled}
        onChange={(n) => onChange({ regenerate: n })}
      />
      {object.regenerate && (
        <NumberField
          label="복원 대기 시간"
          min={0.1}
          max={120}
          step={0.1}
          unit="초"
          value={object.restoreDelay ?? 2}
          disabled={disabled}
          onChange={(n) => onChange({ restoreDelay: n })}
        />
      )}
      <p className="helper">
        첫 착지만 발동합니다. 상태는 각 개체 환경에 독립적으로 보관됩니다.
      </p>
    </>
  ) : null;
}
