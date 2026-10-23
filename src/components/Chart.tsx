import type { TrainingStats } from "../core/types";
import { useEffect, useRef, useState } from "react";
export function Chart({
  histories,
  metric = "best",
  height = 140,
}: {
  histories: Partial<Record<"GA" | "PPO", TrainingStats[]>>;
  metric?: "best" | "mean" | "progress";
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null),
    [width, setWidth] = useState(700);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setWidth(Math.max(280, element.getBoundingClientRect().width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const series = Object.entries(histories).filter(([, v]) => v?.length);
  const values = series.flatMap(([, v]) => v!.map((s) => s[metric]));
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    maxSteps = Math.max(
      1,
      ...series.flatMap(([, v]) => v!.map((s) => s.steps)),
    );
  const y = (v: number) =>
    height - 24 - ((v - min) / (max - min)) * (height - 48);
  return (
    <svg
      ref={ref}
      className="chart"
      style={{ height }}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="환경 스텝 수에 따른 실제 학습 성능 그래프"
      preserveAspectRatio="none"
    >
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line
            x1="42"
            x2={width - 10}
            y1={24 + t * (height - 48)}
            y2={24 + t * (height - 48)}
            stroke="var(--border)"
            strokeDasharray="3 5"
          />
          <text
            x="0"
            y={28 + t * (height - 48)}
            fill="var(--muted)"
            fontSize="11"
          >
            {(max - t * (max - min)).toFixed(1)}
          </text>
        </g>
      ))}
      {series.map(([k, ss]) => (
        <g key={k}>
          <polyline
            points={ss!
              .map(
                (s) =>
                  `${42 + (s.steps / maxSteps) * (width - 52)},${y(s[metric])}`,
              )
              .join(" ")}
            fill="none"
            stroke={k === "GA" ? "var(--accent)" : "var(--series-secondary)"}
            strokeDasharray={k === "PPO" ? "6 4" : undefined}
            strokeWidth="2.3"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={42 + (ss!.at(-1)!.steps / maxSteps) * (width - 52)}
            cy={y(ss!.at(-1)![metric])}
            r={3}
            fill={k === "GA" ? "var(--accent)" : "var(--series-secondary)"}
          >
            <title>
              {k}: {ss!.at(-1)![metric].toFixed(3)} ·{" "}
              {ss!.at(-1)!.steps.toLocaleString()} 스텝
            </title>
          </circle>
        </g>
      ))}
      {!series.length && (
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="12"
        >
          학습을 시작하면 측정값이 표시됩니다
        </text>
      )}
      <text x="42" y={height - 3} fill="var(--muted)" fontSize="10">
        0
      </text>
      <text
        x={width - 10}
        y={height - 3}
        textAnchor="end"
        fill="var(--muted)"
        fontSize="10"
      >
        {maxSteps === 1 ? "환경 스텝" : maxSteps.toLocaleString() + " 스텝"}
      </text>
    </svg>
  );
}
