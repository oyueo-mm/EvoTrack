import { useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
export function Section({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"settings-section " + className}>
      <div className="section-heading-small">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}
export function ToolButton({
  icon: Icon,
  label,
  hint,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={"tool-button " + (active ? "selected" : "")}
      aria-label={label}
      aria-pressed={active}
      title={hint ? `${label} · ${hint}` : label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={16} />
      <span>{label}</span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="number-input">
        <input
          type="number"
          aria-label={label}
          value={
            Number.isFinite(value)
              ? Number(
                  value.toFixed(
                    Math.min(12, Math.max(2, Math.ceil(-Math.log10(step)))),
                  ),
                )
              : ""
          }
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value !== "") onChange(Number(e.target.value));
          }}
        />
        {unit && <small>{unit}</small>}
      </span>
    </label>
  );
}
export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  unit = "",
  defaultValue,
  disabled = false,
  numberInput = false,
}: {
  label: string;
  value: number;
  onChange: (value: number, transaction?: string) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  defaultValue?: number;
  disabled?: boolean;
  numberInput?: boolean;
}) {
  const transaction = useRef<string | undefined>(undefined);
  const display = step < 1 ? value.toFixed(1) : Math.round(value).toString();
  return (
    <div className="range-field">
      <div className="range-heading">
        <label htmlFor={"range-" + label}>{label}</label>
        <output htmlFor={"range-" + label} aria-label={label + " 현재 값"}>
          {display}
          <span>{unit}</span>
        </output>
      </div>
      <input
        id={"range-" + label}
        aria-label={label}
        type="range"
        aria-valuetext={display + unit}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onPointerDown={() => {
          transaction.current = crypto.randomUUID();
        }}
        onPointerUp={() => {
          transaction.current = undefined;
        }}
        onPointerCancel={() => {
          transaction.current = undefined;
        }}
        onChange={(e) => onChange(Number(e.target.value), transaction.current)}
      />
      <div className="range-scale">
        <span>
          {min}
          {unit}
        </span>
        {defaultValue !== undefined && (
          <span>
            기본 {defaultValue}
            {unit}
          </span>
        )}
        <span>
          {max}
          {unit}
        </span>
      </div>
      {numberInput && (
        <NumberField
          label={label + " 직접 입력"}
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          disabled={disabled}
          onChange={(n) => onChange(Math.max(min, Math.min(max, n)))}
        />
      )}
    </div>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle" />
    </label>
  );
}
