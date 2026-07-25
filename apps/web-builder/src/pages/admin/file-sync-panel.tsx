import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { RefreshCw, Cloud, HardDrive } from "lucide-react";
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
// 檔案同步狀態
//
// 讀取「來源管理」中所有 kind === "file" 的 DataSource，交叉比對
// App 設定（/admin/settings）目前已啟用的上傳目的地，記錄每個檔案
// × 目的地 的同步狀態。
//
// 同步狀態直接整合進每一筆 file 資料列的標題列（刪除鈕左側），
// 不再另外畫一個獨立矩陣。尚未實際串接上傳：「同步」僅模擬狀態切換。
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

const SHORT_LABEL: Record<SyncState, string> = {
  unsynced: "未",
  syncing: "…",
  synced: "✓",
  failed: "✗",
};

// 單筆檔案列內的同步狀態叢集：每個已啟用目的地一個小藥丸（點擊模擬同步），
// 加一個「全部同步」鈕。放在資料列刪除鈕的左側。
export function FileRowSyncCluster({
  file,
  destinations,
  syncMap,
  simulateSync,
}: {
  file: FileDataSource;
  destinations: ReturnType<typeof readUploadDestinations>;
  syncMap: FileSyncMap;
  simulateSync: (fileId: string, destId: string) => void;
}) {
  if (destinations.length === 0) {
    return <span style={noDestStyle}>未啟用目的地</span>;
  }

  const syncAll = () => {
    for (const d of destinations) simulateSync(file.id, d.id);
  };

  return (
    <div style={clusterStyle}>
      {destinations.map((d) => {
        const record = syncMap[syncKey(file.id, d.id)];
        const state: SyncState = record?.state ?? "unsynced";
        const tip = `${d.label || d.id}：${SYNC_STATE_LABELS[state]}`;
        return (
          <button
            key={d.id}
            style={{ ...pillStyle, ...stateStyleMap[state] }}
            onClick={() => simulateSync(file.id, d.id)}
            disabled={state === "syncing"}
            title={tip}
            aria-label={tip}
          >
            {d.kind === "s3" ? <Cloud size={11} /> : <HardDrive size={11} />}
            <span>{SHORT_LABEL[state]}</span>
          </button>
        );
      })}
      <button
        style={ghostBtnStyle}
        onClick={syncAll}
        title="同步到所有已啟用的目的地"
      >
        全部同步
      </button>
    </div>
  );
}

const clusterStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  flexShrink: 0,
};

const noDestStyle: CSSProperties = {
  fontSize: 11,
  color: "#e8b64c",
  fontStyle: "italic",
  flexShrink: 0,
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  border: "1px solid #444",
  borderRadius: 999,
  padding: "2px 7px",
  fontSize: 11,
  cursor: "pointer",
  whiteSpace: "nowrap",
  lineHeight: 1,
};

const stateStyleMap: Record<SyncState, CSSProperties> = {
  unsynced: { background: "#222", color: "#999", borderColor: "#444" },
  syncing: { background: "#2a2a12", color: "#e8c64c", borderColor: "#5a4a1f", cursor: "not-allowed" },
  synced: { background: "#18271f", color: "#7fdbca", borderColor: "#2d6a4f" },
  failed: { background: "#2a1414", color: "#e77", borderColor: "#5a2b2b" },
};
