import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { RefreshCw, Cloud, HardDrive, TriangleAlert as AlertTriangle } from "lucide-react";
import type { DataSource, FileDataSource } from "@workspace/ui/lib/data-model";
import { ghostBtnStyle } from "./admin-ui";
import { readUploadDestinations } from "../../lib/upload-destinations";
import {
  readFileSyncMap,
  writeFileSyncMap,
  syncKey,
  SYNC_STATE_LABELS,
  type FileSyncMap,
  type SyncState,
} from "../../lib/file-sync-status";

// ------------------------------------------------------------
// 檔案同步狀態區塊
//
// 讀取「來源管理」中所有 kind === "file" 的 DataSource，交叉比對
// App 設定（/admin/settings）目前已啟用的上傳目的地，畫出一個
// 檔案 × 目的地 的矩陣，記錄各自的同步狀態。
//
// 先不做實際上傳：「模擬同步」按鈕只是把狀態切成 syncing，
// 短暫延遲後隨機切成 synced / failed，方便之後接上真正的上傳
// API 時，只需要替換掉 simulateSync 內部的邏輯即可。
// ------------------------------------------------------------

export function FileSyncRefreshButton({ onRefresh }: { onRefresh: () => void }) {
  return (
    <button
      style={ghostBtnStyle}
      onClick={onRefresh}
      title="重新讀取上傳目的地設定"
    >
      <RefreshCw size={13} />
      重新整理目的地
    </button>
  );
}

export function useFileSync(sources: Record<string, DataSource>) {
  const files = useMemo(
    () =>
      Object.values(sources).filter(
        (s): s is FileDataSource => s.kind === "file",
      ),
    [sources],
  );

  const [refreshTick, setRefreshTick] = useState(0);
  const destinations = useMemo(
    () => readUploadDestinations().filter((d) => d.enabled),
    [refreshTick],
  );

  const [syncMap, setSyncMap] = useState<FileSyncMap>(() => readFileSyncMap());

  useEffect(() => {
    setSyncMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const f of files) {
        for (const d of destinations) {
          const k = syncKey(f.id, d.id);
          if (!next[k]) {
            next[k] = {
              fileId: f.id,
              destId: d.id,
              state: "unsynced",
              updatedAt: new Date().toISOString(),
            };
            changed = true;
          }
        }
      }
      if (changed) writeFileSyncMap(next);
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, destinations]);

  const updateRecord = (fileId: string, destId: string, state: SyncState, errorMessage?: string) => {
    setSyncMap((prev) => {
      const k = syncKey(fileId, destId);
      const next: FileSyncMap = {
        ...prev,
        [k]: {
          fileId,
          destId,
          state,
          updatedAt: new Date().toISOString(),
          errorMessage,
        },
      };
      writeFileSyncMap(next);
      return next;
    });
  };

  const simulateSync = (fileId: string, destId: string) => {
    updateRecord(fileId, destId, "syncing");
    window.setTimeout(() => {
      const ok = Math.random() > 0.2;
      updateRecord(
        fileId,
        destId,
        ok ? "synced" : "failed",
        ok ? undefined : "模擬失敗（尚未串接實際上傳）",
      );
    }, 700);
  };

  const refresh = () => setRefreshTick((n) => n + 1);

  return { files, destinations, syncMap, simulateSync, refresh };
}

export function FileSyncMatrix({
  files,
  destinations,
  syncMap,
  simulateSync,
}: {
  files: FileDataSource[];
  destinations: ReturnType<typeof readUploadDestinations>;
  syncMap: FileSyncMap;
  simulateSync: (fileId: string, destId: string) => void;
}) {
  const syncAllForFile = (fileId: string) => {
    for (const d of destinations) simulateSync(fileId, d.id);
  };

  return (
    <>
      <p style={{ fontSize: 12, color: "#888", marginTop: 0, marginBottom: 12 }}>
        列出所有「檔案」來源與目前在 App 設定已啟用的上傳目的地，記錄兩兩之間的同步狀態。尚未實際串接上傳，「同步」按鈕僅模擬狀態切換。
      </p>

      {files.length === 0 ? (
        <div style={emptyStyle}>尚無檔案來源，請先在上方新增 File 類型的資料。</div>
      ) : destinations.length === 0 ? (
        <div style={emptyStyle}>
          <AlertTriangle size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />
          尚未啟用任何上傳目的地，請先到「App 設定」啟用至少一個。
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>檔案</th>
                {destinations.map((d) => (
                  <th key={d.id} style={thStyle}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {d.kind === "s3" ? <Cloud size={12} /> : <HardDrive size={12} />}
                      {d.label || d.id}
                    </span>
                  </th>
                ))}
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td style={tdFileStyle}>
                    <div style={{ fontSize: 12, color: "#eee" }}>{f.label || f.id}</div>
                    <code style={{ fontSize: 11, color: "#7aa2f7" }}>{f.id}</code>
                    {f.url && (
                      <div style={{ fontSize: 11, color: "#777", marginTop: 2 }} title={f.url}>
                        {f.url}
                      </div>
                    )}
                  </td>
                  {destinations.map((d) => {
                    const record = syncMap[syncKey(f.id, d.id)];
                    const state: SyncState = record?.state ?? "unsynced";
                    return (
                      <td key={d.id} style={tdStyle}>
                        <button
                          style={{ ...statusBtnStyle, ...stateStyleMap[state] }}
                          onClick={() => simulateSync(f.id, d.id)}
                          disabled={state === "syncing"}
                          title={
                            record?.state === "failed" && record.errorMessage
                              ? record.errorMessage
                              : "點擊模擬同步一次"
                          }
                        >
                          {SYNC_STATE_LABELS[state]}
                        </button>
                      </td>
                    );
                  })}
                  <td style={tdStyle}>
                    <button
                      style={ghostBtnStyle}
                      onClick={() => syncAllForFile(f.id)}
                      title="同步到所有已啟用的目的地"
                    >
                      全部同步
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const emptyStyle: CSSProperties = {
  fontSize: 12,
  color: "#777",
  fontStyle: "italic",
  padding: "10px 2px",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  borderBottom: "1px solid #333",
  color: "#999",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #262626",
  verticalAlign: "middle",
};

const tdFileStyle: CSSProperties = {
  ...tdStyle,
  minWidth: 180,
};

const statusBtnStyle: CSSProperties = {
  border: "1px solid #444",
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 11,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const stateStyleMap: Record<SyncState, CSSProperties> = {
  unsynced: { background: "#222", color: "#999", borderColor: "#444" },
  syncing: { background: "#2a2a12", color: "#e8c64c", borderColor: "#5a4a1f", cursor: "not-allowed" },
  synced: { background: "#18271f", color: "#7fdbca", borderColor: "#2d6a4f" },
  failed: { background: "#2a1414", color: "#e77", borderColor: "#5a2b2b" },
};
