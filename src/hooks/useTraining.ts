import { useEffect, useRef, useState } from "react";
import type {
  Algorithm,
  AgentState,
  Command,
  CommandName,
  Config,
  SavedModel,
  Snapshot,
  TrackMap,
  TrainingStats,
  WorkerReply,
} from "../core/types";
interface Handle {
  worker: Worker;
  session: string;
  latestAck: number;
  lastFrame: number;
  startRequest: number;
}
export function useTraining(
  onError: (e: string) => void,
  onSave: (model: SavedModel) => void,
) {
  const handles = useRef<Partial<Record<Algorithm, Handle>>>({}),
    request = useRef(0);
  const [checkpointPending, setCheckpointPending] = useState<
    Partial<Record<Algorithm, boolean>>
  >({});
  const [snapshots, setSnapshots] = useState<
      Partial<Record<Algorithm, Snapshot>>
    >({}),
    [histories, setHistories] = useState<
      Partial<Record<Algorithm, TrainingStats[]>>
    >({}),
    [statuses, setStatuses] = useState<Partial<Record<Algorithm, string>>>({}),
    [ghosts, setGhosts] = useState<Partial<Record<Algorithm, AgentState>>>({});
  const bestSnapshots = useRef<Partial<Record<Algorithm, Snapshot>>>({});
  const errorRef = useRef(onError),
    saveRef = useRef(onSave);
  errorRef.current = onError;
  saveRef.current = onSave;
  useEffect(
    () => () =>
      Object.values(handles.current).forEach((h) => h?.worker.terminate()),
    [],
  );
  function start(
    map: TrackMap,
    config: Config,
    algorithms: Algorithm[],
    model?: SavedModel,
  ) {
    Object.values(handles.current).forEach((h) => h?.worker.terminate());
    handles.current = {};
    bestSnapshots.current = {};
    setGhosts({});
    setCheckpointPending({});
    setSnapshots({});
    setHistories({});
    setStatuses(Object.fromEntries(algorithms.map((a) => [a, "starting"])));
    for (const algorithm of algorithms) {
      const worker = new Worker(
          new URL("../workers/trainer.worker.ts", import.meta.url),
          { type: "module" },
        ),
        session = crypto.randomUUID();
      const handle: Handle = {
        worker,
        session,
        latestAck: 0,
        lastFrame: 0,
        startRequest: request.current + 1,
      };
      handles.current[algorithm] = handle;
      worker.onmessage = (e: MessageEvent<WorkerReply>) => {
        const r = e.data;
        if (r.session !== handles.current[algorithm]?.session) return;
        if (r.type === "ERROR") {
          setCheckpointPending((p) => ({ ...p, [algorithm]: false }));
          errorRef.current(r.error ?? "Worker 오류");
          if (r.requestId === 0 || r.requestId === handle.startRequest)
            setStatuses((s) => ({ ...s, [algorithm]: "error" }));
          return;
        }
        if (r.type === "ACK" && r.requestId >= handle.latestAck) {
          handle.latestAck = r.requestId;
          setStatuses((s) => ({ ...s, [algorithm]: r.status! }));
        }
        if (r.type === "SNAPSHOT" && r.snapshot) {
          const previous = bestSnapshots.current[algorithm];
          if (!previous || r.snapshot.stats.best > previous.stats.best) {
            if (previous)
              setGhosts((g) => ({ ...g, [algorithm]: previous.state }));
            bestSnapshots.current[algorithm] = r.snapshot;
          }
          setSnapshots((s) => ({ ...s, [algorithm]: r.snapshot! }));
          if (
            (!r.snapshot.live || r.snapshot.live.boundary) &&
            (!r.snapshot.runtime || r.snapshot.runtime.phase === "READY")
          )
            setHistories((h) => ({
              ...h,
              [algorithm]: [
                ...(h[algorithm] ?? []).filter(
                  (s) => s.iteration !== r.snapshot!.stats.iteration,
                ),
                r.snapshot!.stats,
              ].slice(-300),
            }));
        }
        if (r.type === "CHECKPOINT" && r.model) {
          setCheckpointPending((p) => ({ ...p, [algorithm]: false }));
          saveRef.current(r.model);
        }
      };
      worker.onerror = (e) => {
        errorRef.current(e.message);
        setStatuses((s) => ({ ...s, [algorithm]: "error" }));
      };
      const cmd: Command = {
        type: model ? "LOAD_CHECKPOINT" : "START",
        session,
        requestId: ++request.current,
        algorithm,
        map,
        config,
        model,
        debug:
          import.meta.env.DEV ||
          new URLSearchParams(location.search).has("debug"),
      };
      worker.postMessage(cmd);
    }
  }
  function send(type: CommandName, config?: Config, only?: Algorithm) {
    for (const [algorithm, h] of Object.entries(handles.current)) {
      if (only && algorithm !== only) continue;
      if (type === "SAVE_CHECKPOINT")
        setCheckpointPending((p) => ({ ...p, [algorithm]: true }));
      if (type === "STOP" || type === "RESET")
        setCheckpointPending((p) => ({ ...p, [algorithm]: false }));
      if (h)
        h.worker.postMessage({
          type,
          session: h.session,
          requestId: ++request.current,
          algorithm: algorithm as Algorithm,
          config,
        } satisfies Command);
    }
  }
  function presentFrame(
    algorithm: Algorithm,
    sequence: number,
    selectedAgent?: number,
    session?: string,
  ) {
    const h = handles.current[algorithm];
    if (!h || session !== h.session || sequence <= h.lastFrame) return;
    h.lastFrame = sequence;
    h.worker.postMessage({
      selectedAgent,
      type: "FRAME_ACK",
      session: h.session,
      requestId: 0,
      algorithm,
      sequence,
    } satisfies Command);
  }
  function clear() {
    Object.values(handles.current).forEach((h) => h?.worker.terminate());
    handles.current = {};
    bestSnapshots.current = {};
    setSnapshots({});
    setHistories({});
    setStatuses({});
    setCheckpointPending({});
    setGhosts({});
  }
  return {
    start,
    send,
    presentFrame,
    clear,
    ghosts,
    snapshots,
    histories,
    checkpointPending,
    statuses,
    active: Object.values(statuses).some(
      (s) => s === "running" || s === "starting",
    ),
    paused: Object.values(statuses).some((s) => s === "paused"),
  };
}
