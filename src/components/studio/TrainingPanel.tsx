import {
  GitBranch,
  BrainCircuit,
  Columns2,
  RotateCcw,
  FolderOpen,
} from "lucide-react";
import { DEFAULT_CONFIG, type Config } from "../../core/types";
import { NumberField, RangeField, Section, Toggle } from "../ui";
export function TrainingPanel({
  config,
  onConfig,
  method,
  onMethod,
  locked,
  onModels,
  curriculumAllowed = false,
}: {
  config: Config;
  onConfig: (c: Config) => void;
  method: "GA" | "PPO" | "both";
  onMethod: (m: "GA" | "PPO" | "both") => void;
  locked: boolean;
  curriculumAllowed?: boolean;
  onModels: () => void;
}) {
  const field = (key: keyof Config, n: number) =>
    onConfig({ ...config, [key]: n });
  return (
    <>
      <Section title="알고리즘 선택">
        <div className="algorithm-choices">
          {(
            [
              {
                value: "GA",
                label: "GA",
                description: "유전 알고리즘으로 신경망 진화",
                Icon: GitBranch,
              },
              {
                value: "PPO",
                label: "PPO",
                description: "강화학습으로 정책 최적화",
                Icon: BrainCircuit,
              },
              {
                value: "both",
                label: "GA + PPO",
                description: "동시에 학습하고 성능 비교",
                Icon: Columns2,
              },
            ] as const
          ).map(({ value, label, description, Icon }) => (
            <button
              type="button"
              key={value}
              aria-pressed={method === value}
              aria-label={
                value === "GA"
                  ? "Genetic Algorithm · " + description
                  : value === "PPO"
                    ? "Proximal Policy Opt. · " + description
                    : "GA + PPO · " + description
              }
              onClick={() => onMethod(value)}
              className={method === value ? "chosen" : ""}
            >
              <Icon size={18} />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <span className="radio" />
            </button>
          ))}
        </div>
      </Section>
      <Section
        title="시뮬레이션 속도"
        description="고정 1/60초 물리 tick의 요청 진행 속도입니다. 실제 배속은 화면에 별도로 표시합니다."
      >
        <RangeField
          label="학습 배속"
          value={config.speed}
          min={0.5}
          max={10}
          step={0.1}
          defaultValue={DEFAULT_CONFIG.speed}
          unit="×"
          onChange={(n) => field("speed", n)}
        />
        <div className="speed-presets">
          {[1, 2, 5].map((n) => (
            <button
              type="button"
              key={n}
              aria-label={n + "배속 프리셋"}
              aria-pressed={config.speed === n}
              onClick={() => field("speed", n)}
            >
              {n}×{n === 2 && <span>기본</span>}
            </button>
          ))}
        </div>
        <p className="helper">
          기기 성능에 따라 최대 처리 속도가 달라집니다. 물리 시간 간격은
          동일하게 유지됩니다.
        </p>
      </Section>
      <Section
        title="하이퍼파라미터"
        description={
          locked
            ? "새 학습 설정은 중지 후 변경할 수 있습니다."
            : "설정은 다음 학습을 시작할 때 적용됩니다."
        }
      >
        {method !== "PPO" && (
          <>
            <NumberField
              label="개체군 크기"
              value={config.population}
              min={4}
              max={256}
              disabled={locked}
              onChange={(n) => field("population", n)}
            />
            <NumberField
              label="돌연변이 확률"
              value={config.mutation}
              min={0}
              max={1}
              step={0.01}
              disabled={locked}
              onChange={(n) => field("mutation", n)}
            />
          </>
        )}
        {method !== "GA" && (
          <NumberField
            label="학습률 (PPO)"
            value={config.learningRate}
            min={0.000001}
            max={0.1}
            step={0.0001}
            disabled={locked}
            onChange={(n) => field("learningRate", n)}
          />
        )}
        <NumberField
          label="에피소드 최대 스텝"
          value={config.horizon}
          min={30}
          max={10000}
          step={30}
          disabled={locked}
          onChange={(n) => field("horizon", n)}
        />
        <NumberField
          label="랜덤 시드"
          value={config.seed}
          min={0}
          max={4294967295}
          disabled={locked}
          onChange={(n) => field("seed", n)}
        />
        {method !== "GA" && (
          <>
            <Toggle
              label="PPO 커리큘럼 (v5 Bounce)"
              checked={config.curriculum ?? false}
              disabled={locked || !curriculumAllowed}
              onChange={(curriculum) => onConfig({ ...config, curriculum })}
            />
            <p className="helper">
              v5 Bounce 전용 · 쉬운 단계부터 같은 정책으로 학습합니다. 고정 평가
              완주율 2/3 이상·진행도 90% 이상을 연속 2회 달성하면 다음 단계로
              넘어갑니다.
            </p>
            <NumberField
              label="Target KL"
              value={config.targetKL ?? 0.03}
              min={0.001}
              max={0.2}
              step={0.001}
              disabled={locked}
              onChange={(n) => field("targetKL", n)}
            />
          </>
        )}
        <details className="disclosure">
          <summary>고급 설정</summary>
          {(
            [
              ["elite", "엘리트 비율", 0.01, 0.5, 0.01, "GA"],
              ["crossover", "교차 확률", 0, 1, 0.05, "GA"],
              ["sigma", "변이 강도", 0, 2, 0.05, "GA"],
              ["rollout", "Rollout 길이", 16, 4096, 16, "PPO"],
              ["epochs", "Epochs", 1, 20, 1, "PPO"],
              ["minibatch", "Minibatch", 8, 512, 8, "PPO"],
              ["gamma", "Gamma", 0, 1, 0.01, "PPO"],
              ["lambda", "GAE lambda", 0, 1, 0.01, "PPO"],
              ["clip", "PPO clip", 0.01, 0.5, 0.01, "PPO"],
              ["entropy", "Entropy bonus", 0, 1, 0.001, "PPO"],
            ] as const
          )
            .filter(([, , , , , a]) => method === "both" || method === a)
            .map(([key, label, min, max, step]) => (
              <NumberField
                key={key}
                label={label}
                value={config[key]}
                min={min}
                max={max}
                step={step}
                disabled={locked}
                onChange={(n) => field(key, n)}
              />
            ))}
        </details>
        <button
          className="button full-width"
          disabled={locked}
          onClick={() => {
            onConfig({ ...DEFAULT_CONFIG });
            onMethod("both");
          }}
        >
          <RotateCcw size={15} />
          설정 기본값 복원
        </button>
        <p className="helper">
          입력값만 기본값으로 바꿉니다. 저장된 모델과 실험 기록은 유지됩니다.
        </p>
      </Section>
      <Section title="모델 불러오기">
        <button className="button full-width" onClick={onModels}>
          <FolderOpen size={16} />
          모델 라이브러리 열기
        </button>
      </Section>
    </>
  );
}
