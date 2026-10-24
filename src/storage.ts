import { validateMap } from "./core/maps";
import {
  SCHEMAS,
  schemasFor,
  observationSizeFor,
  type Config,
  type SavedModel,
  type TrackMap,
} from "./core/types";
import { validatePolicy } from "./learning/evaluate";
export type Store = "maps" | "models" | "experiments";
export interface Experiment {
  id: string;
  name: string;
  createdAt: string;
  mapId: string;
  mapName: string;
  algorithm: string;
  result: unknown;
}
export function validateConfig(c: Config) {
  if (
    !c ||
    Object.entries(c).some(
      ([key, v]) =>
        !["trainingMode", "curriculum"].includes(key) && !Number.isFinite(v),
    )
  )
    throw Error("학습 설정이 손상되었습니다.");
  const range = (v: number, a: number, b: number, integer = false) =>
    v >= a && v <= b && (!integer || Number.isInteger(v));
  if (
    !range(c.seed, 0, 4294967295, true) ||
    !range(c.population, 4, 256, true) ||
    !range(c.elite, 0.01, 0.5) ||
    !range(c.crossover, 0, 1) ||
    !range(c.mutation, 0, 1) ||
    !range(c.sigma, 0, 2) ||
    !range(c.horizon, 30, 10000, true) ||
    !range(c.rollout, 16, 4096, true) ||
    !range(c.epochs, 1, 20, true) ||
    !range(c.minibatch, 8, 512, true) ||
    !range(c.learningRate, 0.000001, 0.1) ||
    !range(c.gamma, 0, 1) ||
    !range(c.lambda, 0, 1) ||
    !range(c.clip, 0.01, 0.5) ||
    !range(c.entropy, 0, 1) ||
    (c.trainingMode !== undefined &&
      !["observe", "fast"].includes(c.trainingMode)) ||
    (c.curriculum !== undefined && typeof c.curriculum !== "boolean") ||
    (c.targetKL !== undefined && !range(c.targetKL, 0.001, 0.2)) ||
    !range(c.speed, 0.5, 10)
  )
    throw Error("학습 설정의 허용 범위를 벗어났습니다.");
  return c;
}
function validPolicySummary(s: any, algorithm: string) {
  return (
    s &&
    s.algorithm === algorithm &&
    ["generation", "evaluation"].includes(s.source) &&
    Number.isInteger(s.iteration) &&
    s.iteration >= 0 &&
    [s.fitness, s.progress, s.successRate].every(Number.isFinite) &&
    s.progress >= 0 &&
    s.progress <= 1 &&
    s.successRate >= 0 &&
    s.successRate <= 1 &&
    Number.isInteger(s.horizon) &&
    s.horizon >= 1 &&
    s.horizon <= 10000 &&
    (s.seeds === undefined ||
      (Array.isArray(s.seeds) &&
        s.seeds.length > 0 &&
        s.seeds.length <= 10 &&
        s.seeds.every(
          (n: any) => Number.isInteger(n) && n >= 0 && n <= 4294967295,
        ))) &&
    (s.phase === undefined ||
      (typeof s.phase === "string" && s.phase.length <= 500))
  );
}
export function validateModel(value: unknown): SavedModel {
  if (!value || typeof value !== "object")
    throw Error("모델 파일이 올바르지 않습니다.");
  const m = value as SavedModel;
  if (
    typeof m.id !== "string" ||
    typeof m.name !== "string" ||
    !m.name.trim() ||
    !["GA", "PPO"].includes(m.algorithm) ||
    !["inference", "checkpoint"].includes(m.kind) ||
    !["racing", "bounce"].includes(m.mode) ||
    typeof m.mapId !== "string" ||
    typeof m.createdAt !== "string" ||
    !m.schemas ||
    ![1, 2, 3, 4, 5].includes(m.schemas.environment) ||
    ![1, 2].includes(m.schemas.observation) ||
    m.schemas.action !== 1
  )
    throw Error("모델 메타데이터 또는 스키마가 호환되지 않습니다.");
  const trainingMap = validateMap(m.trainingMap);
  if (trainingMap.id !== m.mapId || trainingMap.mode !== m.mode)
    throw Error("학습 맵 정보가 일치하지 않습니다.");
  if (m.schemas.environment !== schemasFor(trainingMap).environment)
    throw Error("모델과 학습 맵의 환경 버전이 다릅니다.");
  if (m.schemas.observation !== schemasFor(trainingMap).observation)
    throw Error("관측 스키마가 다릅니다.");
  const input = observationSizeFor(trainingMap);
  validatePolicy(m.policy, m.mode === "racing" ? 5 : 6, input);
  if (m.policySelection && !validPolicySummary(m.policySelection, m.algorithm))
    throw Error("정책 선정 정보가 손상되었습니다.");
  if (m.bestPolicy) {
    if (!validPolicySummary(m.bestPolicy, m.algorithm))
      throw Error("최고 정책 정보가 손상되었습니다.");
    validatePolicy(m.bestPolicy.policy, m.policy.output, input);
  }

  if (m.curriculumState) {
    const c = m.curriculumState;
    const target = validateMap(c.target);
    if (
      m.algorithm !== "PPO" ||
      target.mode !== "bounce" ||
      target.environmentVersion !== 5 ||
      !Number.isInteger(c.stage) ||
      c.stage < 0 ||
      c.stage > 7 ||
      !Number.isInteger(c.passes) ||
      c.passes < 0 ||
      c.passes > 2
    )
      throw Error("커리큘럼 상태가 손상되었습니다.");
  }
  validateConfig(m.config);
  const numericStats = [
    "iteration",
    "steps",
    "episodes",
    "elapsed",
    "best",
    "mean",
    "successRate",
    "collisions",
    "progress",
    "policyLoss",
    "valueLoss",
    "entropy",
    "kl",
    "tensors",
    "bytes",
    "stepsPerSecond",
  ] as const;
  if (
    !m.stats ||
    m.stats.algorithm !== m.algorithm ||
    numericStats.some((k) => !Number.isFinite(m.stats[k])) ||
    !Array.isArray(m.stats.fitness) ||
    m.stats.fitness.length > 256 ||
    !m.stats.fitness.every(Number.isFinite) ||
    (m.stats.completionTime !== null &&
      !Number.isFinite(m.stats.completionTime))
  )
    throw Error("학습 기록이 유효하지 않습니다.");
  if (m.kind === "checkpoint") {
    const c = m.checkpoint as Record<string, any>;
    if (!c || !Number.isInteger(c.rng) || c.rng < 0 || c.rng > 4294967295)
      throw Error("체크포인트 난수 상태가 손상되었습니다.");
    if (m.algorithm === "GA") {
      if (
        (c.boundary !== undefined && c.boundary !== "generation") ||
        !Array.isArray(c.population) ||
        c.population.length !== m.config.population ||
        !Number.isInteger(c.generation) ||
        c.generation < 0 ||
        !Number.isFinite(c.bestScore)
      )
        throw Error("GA 체크포인트가 유효하지 않습니다.");
      if (
        c.bestGeneration !== undefined &&
        (!Number.isInteger(c.bestGeneration) ||
          c.bestGeneration < 0 ||
          c.bestGeneration > c.generation)
      )
        throw Error("최고 정책 세대 정보가 손상되었습니다.");
      if (
        c.bestState &&
        (![
          "x",
          "y",
          "angle",
          "vx",
          "vy",
          "speed",
          "reward",
          "progress",
          "steps",
        ].every((k) => Number.isFinite(c.bestState[k])) ||
          !["done", "success", "collision", "grounded"].every(
            (k) => typeof c.bestState[k] === "boolean",
          ) ||
          !Array.isArray(c.bestState.trail) ||
          c.bestState.trail.length > 200 ||
          c.bestState.trail.some(
            (p: any) => !Number.isFinite(p.x) || !Number.isFinite(p.y),
          ))
      )
        throw Error("최고 정책 상태가 손상되었습니다.");
      c.population.forEach((p: any) =>
        validatePolicy(p, m.policy.output, input),
      );
      if (c.best) validatePolicy(c.best, m.policy.output, input);
    } else {
      if (
        [c.episodeSerial, c.totalSamples].some(
          (v) => v !== undefined && (!Number.isSafeInteger(v) || v < 0),
        )
      )
        throw Error("PPO 경험 수집 상태가 손상되었습니다.");
      validatePolicy(c.actor, m.policy.output, input);
      validatePolicy(c.critic, 1, input);
      if (c.environment) {
        const e = c.environment;
        if (
          ![
            e.state?.angle,
            e.state?.speed,
            e.state?.progress,
            e.state?.checkpoint,
          ].every(Number.isFinite) ||
          !["grounded", "done", "success", "collision"].every(
            (k) => typeof e.state?.[k] === "boolean",
          ) ||
          ![e.rewardInside, e.rewardFired].every(
            (a) =>
              Array.isArray(a) &&
              a.length <= 1000 &&
              a.every((v) => typeof v === "string"),
          ) ||
          !Array.isArray(e.rewardLast) ||
          e.rewardLast.length > 1000 ||
          e.rewardLast.some(
            (v: any) =>
              !Array.isArray(v) ||
              typeof v[0] !== "string" ||
              !Number.isFinite(v[1]),
          )
        )
          throw Error("PPO 환경 상태가 손상되었습니다.");
        if (
          e.state.platforms &&
          Object.entries(e.state.platforms).some(
            ([id, v]: [string, any]) =>
              !trainingMap.objects.some(
                (o) => o.id === id && o.kind === "crumble",
              ) ||
              !Number.isFinite(v?.triggeredAt) ||
              v.triggeredAt < 0 ||
              (v.collapsedAt !== undefined &&
                (!Number.isFinite(v.collapsedAt) ||
                  v.collapsedAt < v.triggeredAt)),
          )
        )
          throw Error("발판 실행 상태가 손상되었습니다.");
        if (
          !e.state ||
          ![
            e.seed,
            e.bestX,
            e.arc,
            e.bestArc,
            e.segment,
            e.state.steps,
            e.state.x,
            e.state.y,
            e.state.vx,
            e.state.vy,
            e.state.reward,
          ].every(Number.isFinite) ||
          e.state.steps < 0 ||
          e.state.steps > m.config.horizon ||
          !Array.isArray(e.state.trail) ||
          e.state.trail.length > 200 ||
          ![e.rewardInside, e.rewardFired, e.rewardLast].every(Array.isArray)
        )
          throw Error("PPO 환경 상태가 손상되었습니다.");
      }
      const slotShapes = [
        [],
        ...Array.from({ length: 2 }, () => [
          [input, 24],
          [24],
          [24, m.policy.output],
          [m.policy.output],
          [input, 24],
          [24],
          [24, 1],
          [1],
        ]).flat(),
      ];
      if (
        !Number.isInteger(c.updates) ||
        c.updates < 0 ||
        !Array.isArray(c.optimizer) ||
        c.optimizer.length !== 17 ||
        !c.optimizer.every(
          (t: any, index: number) =>
            typeof t.name === "string" &&
            Array.isArray(t.shape) &&
            t.shape.length <= 2 &&
            JSON.stringify(t.shape) === JSON.stringify(slotShapes[index]) &&
            t.shape.every(
              (n: any) => Number.isInteger(n) && n > 0 && n <= 1024,
            ) &&
            Array.isArray(t.values) &&
            t.values.length ===
              t.shape.reduce((a: number, b: number) => a * b, 1) &&
            t.values.every(Number.isFinite),
        )
      )
        throw Error("PPO 옵티마이저 상태가 유효하지 않습니다.");
    }
  }
  return structuredClone(m);
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("evotrack", 1);
    req.onupgradeneeded = () => {
      for (const name of ["maps", "models", "experiments"])
        if (!req.result.objectStoreNames.contains(name))
          req.result.createObjectStore(name, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(Error("브라우저 저장소를 열 수 없습니다."));
  });
}
export async function list<T>(store: Store): Promise<T[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store),
      req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function put(
  store: Store,
  value: TrackMap | SavedModel | Experiment,
) {
  if (store === "maps") validateMap(value);
  if (store === "models") validateModel(value);
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(Error("저장 실패: 브라우저 저장 공간과 권한을 확인하세요."));
    };
  });
}
export async function remove(store: Store, id: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(Error("삭제하지 못했습니다."));
    };
  });
}
export function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readJSON(file: File, limitMB = 20) {
  if (file.size > limitMB * 1024 * 1024)
    throw Error(`${limitMB} MB 이하의 JSON 파일만 가져올 수 있습니다.`);
  try {
    return JSON.parse(await file.text());
  } catch {
    throw Error("JSON 파일을 읽을 수 없습니다.");
  }
}

const STORES: Store[] = ["maps", "models", "experiments"];
export interface Workspace {
  format?: "evotrack-workspace";
  version?: 1;
  schemas?: typeof SCHEMAS;
  maps: TrackMap[];
  models: SavedModel[];
  experiments: Experiment[];
}
export function validateWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== "object")
    throw Error("작업 공간 파일이 아닙니다.");
  const w = value as Workspace;
  // Unversioned exports from v0.1 remain supported.
  const versioned = "format" in w || "version" in w || "schemas" in w;
  if (
    versioned &&
    (w.format !== "evotrack-workspace" ||
      w.version !== 1 ||
      !w.schemas ||
      ![1, 2, 3, 4, 5].includes(w.schemas.environment) ||
      w.schemas.observation !== 1 ||
      w.schemas.action !== 1)
  )
    throw Error("지원하지 않는 작업 공간 버전 또는 스키마입니다.");
  for (const store of STORES) {
    if (!Array.isArray(w[store]) || w[store].length > 10000)
      throw Error("작업 공간 목록이 올바르지 않습니다: " + store);
    const ids = new Set<string>();
    for (const item of w[store]) {
      if (
        !item ||
        typeof item.id !== "string" ||
        !item.id.trim() ||
        ids.has(item.id)
      )
        throw Error("파일 안에 잘못되거나 중복된 ID가 있습니다: " + store);
      ids.add(item.id);
      if (store === "maps") validateMap(item);
      if (store === "models") validateModel(item);
      if (store === "experiments") {
        const e = item as Experiment;
        if (
          ![e.name, e.createdAt, e.mapId, e.mapName, e.algorithm].every(
            (v) => typeof v === "string",
          ) ||
          !Number.isFinite(Date.parse(e.createdAt)) ||
          !["GA", "PPO", "both"].includes(e.algorithm) ||
          e.result === undefined
        )
          throw Error("실험 기록이 올바르지 않습니다.");
      }
    }
  }
  return structuredClone(w);
}
export async function exportWorkspace(): Promise<Workspace> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, "readonly");
    const w: Workspace = {
      format: "evotrack-workspace",
      version: 1,
      schemas: SCHEMAS,
      maps: [],
      models: [],
      experiments: [],
    };
    for (const store of STORES) {
      const r = tx.objectStore(store).getAll();
      r.onsuccess = () => {
        (w[store] as unknown[]) = r.result;
      };
    }
    tx.oncomplete = () => {
      db.close();
      resolve(w);
    };
    tx.onabort = () => {
      db.close();
      reject(Error("작업 공간을 읽지 못했습니다."));
    };
  });
}
export function workspaceSummary(incoming: Workspace, existing: Workspace) {
  return STORES.map((store) => {
    const ids = new Set(existing[store].map((item) => item.id));
    return {
      store,
      count: incoming[store].length,
      conflicts: incoming[store].filter((item) => ids.has(item.id)).length,
    };
  });
}
export async function restoreWorkspace(
  value: unknown,
  conflict: "skip" | "overwrite",
  reviewed: Workspace,
) {
  const incoming = validateWorkspace(value);
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES, "readwrite");
    let failure = "가져오기에 실패했습니다. 기존 데이터는 보존되었습니다.";
    let remaining = STORES.length;
    const current: Workspace = { maps: [], models: [], experiments: [] };
    for (const store of STORES) {
      const r = tx.objectStore(store).getAll();
      r.onsuccess = () => {
        (current[store] as unknown[]) = r.result;
        if (--remaining) return;
        try {
          if (
            STORES.some(
              (s) => JSON.stringify(current[s]) !== JSON.stringify(reviewed[s]),
            )
          ) {
            failure =
              "저장소가 변경되었습니다. 파일을 다시 선택해 개수를 확인하세요.";
            tx.abort();
            return;
          }
          for (const s of STORES) {
            const ids = new Set(current[s].map((item) => item.id));
            for (const item of incoming[s]) {
              if (conflict === "skip" && ids.has(item.id)) continue;
              tx.objectStore(s).put(item);
            }
          }
        } catch {
          tx.abort();
        }
      };
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => {
      db.close();
      reject(Error(failure));
    };
  });
}
