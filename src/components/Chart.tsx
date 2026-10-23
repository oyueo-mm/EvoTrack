import type { TrainingStats } from "../core/types";
export function Chart({
  histories,
  metric = "best",
  height = 140,
}: {
  histories: Partial<Record<"GA" | "PPO", TrainingStats[]>>;
  metric?: "best" | "mean" | "progress";
  height?: number;
}) {
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
      className="chart"
      viewBox={`0 0 700 ${height}`}
      role="img"
      aria-label="환경 스텝 수에 따른 실제 학습 성능 그래프"
      preserveAspectRatio="none"
    >
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line
            x1="42"
            x2="690"
            y1={24 + t * (height - 48)}
            y2={24 + t * (height - 48)}
            stroke="#2a333a"
            strokeDasharray="3 5"
          />
          <text x="0" y={28 + t * (height - 48)} fill="#75828b" fontSize="10">
            {(max - t * (max - min)).toFixed(1)}
          </text>
        </g>
      ))}
      {series.map(([k, ss]) => (
        <polyline
          key={k}
          points={ss!
            .map((s) => `${42 + (s.steps / maxSteps) * 648},${y(s[metric])}`)
            .join(" ")}
          fill="none"
          stroke={k === "GA" ? "#a7e879" : "#9fafff"}
          strokeWidth="2.3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {!series.length && (
        <text
          x="350"
          y={height / 2}
          textAnchor="middle"
          fill="#7c8b94"
          fontSize="12"
        >
          학습을 시작하면 측정값이 표시됩니다
        </text>
      )}
      <text x="42" y={height - 3} fill="#75828b" fontSize="9">
        0
      </text>
      <text x="690" y={height - 3} textAnchor="end" fill="#75828b" fontSize="9">
        {maxSteps === 1
          ? "ENVIRONMENT STEPS"
          : maxSteps.toLocaleString() + " steps"}
      </text>
    </svg>
  );
}
