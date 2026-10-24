import type { MapObject } from "../../core/types";
import { NumberField } from "../ui";
export function ExtendedProperties({
  object: o,
  disabled,
  onChange,
}: {
  object: MapObject;
  disabled: boolean;
  onChange: (patch: Partial<MapObject>) => void;
}) {
  const number = (
    label: string,
    key: keyof MapObject,
    value: number,
    min: number,
    max: number,
    step = 1,
  ) => (
    <NumberField
      key={key}
      label={label}
      value={Number(o[key] ?? value)}
      min={min}
      max={max}
      step={step}
      unit={
        key === "rewardValue"
          ? undefined
          : key === "cooldown"
            ? "s"
            : key === "beltStrength"
              ? "px/s²"
              : "px/s"
      }
      disabled={disabled}
      onChange={(n) => onChange({ [key]: n })}
    />
  );
  const select = (
    label: string,
    key: keyof MapObject,
    value: string,
    choices: [string, string][],
  ) => (
    <label className="stack-field">
      {label}
      <select
        aria-label={label}
        value={String(o[key] ?? value)}
        disabled={disabled}
        onChange={(e) => onChange({ [key]: e.target.value })}
      >
        {choices.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
  const toggle = (
    label: string,
    key: "visible" | "trainingOnly",
    value: boolean,
  ) => (
    <label className="toggle">
      <input
        type="checkbox"
        checked={o[key] ?? value}
        disabled={disabled}
        onChange={(e) => onChange({ [key]: e.target.checked })}
      />
      {label}
    </label>
  );
  if (o.kind === "elastic")
    return (
      <>
        {number("점프 보조", "liftBoost", 120, 0, 1000)}
        {number(
          "최소 도약 속도",
          "minLaunchSpeed",
          260,
          0,
          o.maxLaunchSpeed ?? 900,
        )}
        {number(
          "최대 도약 속도",
          "maxLaunchSpeed",
          900,
          o.minLaunchSpeed ?? 260,
          1400,
        )}
        {number("접선 방향 보조", "tangentBoost", 0, -1000, 1000)}
      </>
    );
  if (o.kind === "belt")
    return (
      <>
        {select("벨트 타입", "beltType", "boost", [
          ["boost", "가속"],
          ["brake", "감속"],
        ])}
        {number("벨트 세기", "beltStrength", 300, 0, 2000)}
        {select("방향 기준", "beltDirection", "velocity", [
          ["velocity", "현재 속도 방향"],
          ["beltOrientation", "벨트 방향"],
        ])}
        {number("최대 영향 속도", "maxInfluenceSpeed", 480, 10, 1400)}
      </>
    );
  if (o.kind !== "reward") return null;
  return (
    <>
      <label className="stack-field">
        보상 이름
        <input
          aria-label="보상 이름"
          value={o.name ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      <label className="stack-field">
        보상 설명
        <textarea
          aria-label="보상 설명"
          value={o.description ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </label>
      {select("보상 형태", "rewardShape", "zone", [
        ["zone", "직사각형 영역"],
        ["gate", "통과 게이트"],
      ])}
      {number("보상값", "rewardValue", 1, -100, 100, 0.1)}
      {select("발동 방식", "activation", "once", [
        ["once", "에피소드당 1회"],
        ["repeat", "매번"],
        ["cooldown", "쿨다운 후 재발동"],
      ])}
      {select(
        "트리거 조건",
        "trigger",
        o.rewardShape === "gate" ? "cross" : "enter",
        [
          ["enter", "진입 시"],
          ["cross", "중심선 통과 시"],
          ["stay", "머무는 동안"],
        ],
      )}
      {o.activation === "cooldown" &&
        number("재발동 대기", "cooldown", 1, 0.05, 120, 0.05)}
      {select("사용 환경", "rewardMode", "both", [
        ["both", "Racing / Bounce"],
        ["racing", "Racing"],
        ["bounce", "Bounce"],
      ])}
      {toggle("시각 표시", "visible", true)}
      {toggle("학습에만 적용", "trainingOnly", false)}
      <p className="helper">
        머무는 동안 + 매번은 초당 보상입니다. 나머지는 발동당 보상이며 쿨다운은
        시뮬레이션 시간 기준입니다.
      </p>
    </>
  );
}
