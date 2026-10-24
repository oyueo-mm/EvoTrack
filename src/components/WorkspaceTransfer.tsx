import { useEffect, useRef, useState } from "react";
import { Download, Upload, X } from "lucide-react";
import {
  download,
  exportWorkspace,
  readJSON,
  restoreWorkspace,
  validateWorkspace,
  workspaceSummary,
  type Workspace,
} from "../storage";

export function WorkspaceTransfer({
  onClose,
  onRestored,
  onError,
}: {
  onClose: () => void;
  onRestored: () => void;
  onError: (s: string) => void;
}) {
  const [incoming, setIncoming] = useState<Workspace | null>(null);
  const [existing, setExisting] = useState<Workspace | null>(null);
  const [conflict, setConflict] = useState<"skip" | "overwrite">("skip");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  const summary =
    incoming && existing ? workspaceSummary(incoming, existing) : [];
  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <section
        ref={ref}
        tabIndex={-1}
        className="modal transfer-modal"
        role="dialog"
        aria-modal="true"
        aria-label="작업 공간 이전"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
          if (e.key === "Tab") {
            const nodes = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
              ),
            ];
            const first = nodes[0],
              last = nodes.at(-1);
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last?.focus();
            }
            if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="card-heading">
          <h2>작업 공간 이전</h2>
          <button
            className="icon-btn"
            aria-label="이전 창 닫기"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="muted">
          저장된 맵, 모델, 실험 기록을 하나의 파일로 옮깁니다. 편집 중인 맵은
          먼저 저장하세요.
        </p>
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              download(await exportWorkspace(), "evotrack-workspace");
            } catch (e) {
              onError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={16} />
          전체 JSON 내보내기
        </button>
        <label className="stack-field transfer-file">
          <span>
            <Upload size={16} />
            전체 작업 공간 가져오기
          </span>
          <input
            aria-label="작업 공간 JSON 파일"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setIncoming(null);
              setExisting(null);
              if (!file) return;
              setBusy(true);
              try {
                const w = validateWorkspace(await readJSON(file, 200));
                const old = await exportWorkspace();
                setIncoming(w);
                setExisting(old);
              } catch (err) {
                onError(String(err));
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        {!!summary.length && (
          <>
            <h3>가져오기 전 확인</h3>
            <table className="transfer-table">
              <thead>
                <tr>
                  <th>자료</th>
                  <th>기존</th>
                  <th>파일</th>
                  <th>중복 ID</th>
                  <th>복원</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.store}>
                    <th>
                      {
                        { maps: "맵", models: "모델", experiments: "실험" }[
                          s.store
                        ]
                      }
                    </th>
                    <td>{existing![s.store].length}</td>
                    <td>{s.count}</td>
                    <td>{s.conflicts}</td>
                    <td>{s.count - (conflict === "skip" ? s.conflicts : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label className="stack-field">
              중복 ID 처리
              <select
                aria-label="중복 ID 처리"
                value={conflict}
                onChange={(e) => setConflict(e.target.value as typeof conflict)}
                disabled={busy}
              >
                <option value="skip">기존 자료 유지 · 중복 건너뛰기</option>
                <option value="overwrite">파일의 자료로 덮어쓰기</option>
              </select>
            </label>
            <p className="helper">
              파일에 없는 기존 자료는 유지됩니다. 검증과 저장은 전체 자료를 한
              번에 처리합니다.
            </p>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await restoreWorkspace(incoming, conflict, existing!);
                  onRestored();
                } catch (e) {
                  onError(String(e));
                  setIncoming(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "가져오는 중…" : "확인한 자료 가져오기"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
