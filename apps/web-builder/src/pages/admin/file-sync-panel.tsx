import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { RefreshCw, Cloud, HardDrive, UploadCloud, RotateCw } from "lucide-react";
import { toast } from "sonner";
import type { DataSource, FileDataSource } from "@/lib/data-model";
import { readUploadDestinations } from "../../lib/upload-destinations";
import {
  syncFileToDestination,
  uploadFileToAllEnabledDests,
  DEFAULT_APP_NAME,
  type DestUploadOutcome,
} from "../../lib/upload-client";
import {
  readFileSyncMap,
  writeFileSyncMap,
  syncKey,
  SYNC_STATE_LABELS,
  type FileSyncMap,
  type SyncState,
} from "../../lib/file-sync-status";

// ------------------------------------------------------------
// 檔案同步狀態 + 拖拉上傳
//
// 讀取「來源管理」中所有 kind === "file" 的 DataSource，交叉比對
// App 設定（/admin/settings）目前已啟用的上傳目的地，記錄每個檔案
// × 目的地 的同步狀態。
//
// 同步狀態直接整合進每一筆 file 資料列的標題列（刪除鈕左側），
// 不再另外畫一個獨立矩陣。
//
// 選檔／拖檔上傳時，會自動送到「每一個」目前已啟用的目的地（見
// upload-client.ts 的 uploadFileToAllEnabledDests）。這裡的「同步」
// 只是備援機制：只有自動上傳當下失敗的目的地，才需要使用者手動點同步
// 鈕重試；成功的目的地一開始就會被標成 synced，不需要使用者再多做
// 一次動作。
//
// 實際同步：呼叫 upload-client.ts 的 syncFileToDestination()，整個
// 讀取＋寫入流程都在「前端」完成（OPFS 讀取 / fetch 來源網址 +
// 寫回 OPFS 或用 presigned PUT 直接上傳），不再透過 dev server 的
// /sync 路由（該路由已移除）。同步成功後，該檔案在這個目的地的
// url 會記錄在 syncMap 對應紀錄的 syncedUrl 欄位。
// ------------------------------------------------------------

export function FileSyncRefreshButton({ onRefresh }: { onRefresh: () => void }) {
  return (
    <button
      style={iconBtnStyle}
      onClick={onRefresh}
      title="重新整理目的地：重新讀取上傳目的地設定"
      aria-label="重新整理目的地"
    >
      <RefreshCw size={13} />
    </button>
  );
}

/** 依現有 sources，找一個不會撞名的 "file:upload-<n>" id。 */
function makeFileSourceId(sources: Record<string, DataSource>): string {
  let n = 1;
  let id = `file:upload-${n}`;
  while (sources[id]) id = `file:upload-${++n}`;
  return id;
}

export function useFileSync(
  sources: Record<string, DataSource>,
  onChangeSources: (next: Record<string, DataSource>) => void,
  appName: string = DEFAULT_APP_NAME,
) {
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

  const updateRecord = (
    fileId: string,
    destId: string,
    state: SyncState,
    extra?: { errorMessage?: string; syncedUrl?: string },
  ) => {
    setSyncMap((prev) => {
      const k = syncKey(fileId, destId);
      const next: FileSyncMap = {
        ...prev,
        [k]: {
          fileId,
          destId,
          state,
          updatedAt: new Date().toISOString(),
          errorMessage: extra?.errorMessage,
          // 還沒有新的同步結果時，沿用前一次成功同步過的 url，
          // 避免一次「同步中」的中繼狀態把之前的紀錄洗掉。
          syncedUrl: extra?.syncedUrl ?? prev[k]?.syncedUrl,
        },
      };
      writeFileSyncMap(next);
      return next;
    });
  };

  /** 把「自動上傳到所有目的地」的逐一結果，直接寫進 syncMap（成功 -> synced，失敗 -> failed，保留給使用者手動重試）。 */
  const seedSyncMapFromUploadOutcomes = (
    fileId: string,
    outcomes: DestUploadOutcome[],
  ) => {
    for (const outcome of outcomes) {
      if (outcome.ok) {
        updateRecord(fileId, outcome.destId, "synced", { syncedUrl: outcome.url });
      } else {
        updateRecord(fileId, outcome.destId, "failed", {
          errorMessage: outcome.errorMessage,
        });
      }
    }
  };

  /**
   * 真正的同步（備援用）：呼叫 upload-client.ts 的
   * syncFileToDestination()，整個讀取＋寫入流程都在瀏覽器端完成
   * （見該函式註解），把 file.url 目前指向的內容讀出來，寫一份到
   * destId 對應的目的地。一般情況下不需要手動觸發，因為選檔／拖檔
   * 上傳當下就已經自動送到所有已啟用目的地；只有在那次自動上傳失敗、
   * 或事後才啟用新目的地時，才需要用這個補救。
   */
  const performSync = async (fileId: string, destId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    if (!file.url) {
      updateRecord(fileId, destId, "failed", {
        errorMessage: "此檔案尚未設定 url，請先上傳或填入來源網址",
      });
      return;
    }
    const dest = destinations.find((d) => d.id === destId);
    if (!dest) {
      updateRecord(fileId, destId, "failed", {
        errorMessage: "找不到目標目的地設定",
      });
      return;
    }

    updateRecord(fileId, destId, "syncing");
    try {
      const result = await syncFileToDestination({
        sourceUrl: file.url,
        destId,
        destKind: dest.kind,
        // 優先用上傳當下記錄的原始檔名（含副檔名）；只有很舊、上傳時還沒
        // 存 fileName 的資料才會退回 label／id（此時本來就沒有副檔名可保留）。
        fileName: file.fileName || file.label || file.id,
        mimeType: file.mimeType,
        appName,
      });
      updateRecord(fileId, destId, "synced", { syncedUrl: result.url });
    } catch (err) {
      updateRecord(fileId, destId, "failed", {
        errorMessage: err instanceof Error ? err.message : "同步失敗",
      });
    }
  };

  /**
   * 拖拉 / 選檔上傳的入口：每個檔案各自呼叫
   * uploadFileToAllEnabledDests()（存 OPFS + 自動送到所有已啟用目的地），
   * 然後新增一筆對應的 FileDataSource（url 用「主要」結果，也就是本機
   * 優先、其次 S3、都沒有就退回 OPFS 網址），並把每個目的地的上傳結果
   * 直接寫進 syncMap（同步狀態叢集因此一開始就會顯示正確的成敗，不用
   * 使用者再手動點一次）。
   *
   * 回傳每個檔案的處理結果，方便呼叫端（例如 drop zone）顯示錯誤。
   */
  const uploadFiles = async (
    incoming: File[],
  ): Promise<{ file: File; ok: boolean; errorMessage?: string }[]> => {
    const results: { file: File; ok: boolean; errorMessage?: string }[] = [];
    // 逐一處理而非 Promise.all，避免多檔同時新增時，makeFileSourceId
    // 依賴的「當下 sources 快照」互相踩到彼此還沒 commit 的新 id。
    let workingSources = sources;
    for (const file of incoming) {
      try {
        const uploadResult = await uploadFileToAllEnabledDests(file, appName);
        const id = makeFileSourceId(workingSources);
        const newSource: FileDataSource = {
          id,
          kind: "file",
          label: file.name,
          url: uploadResult.primary.url,
          mimeType: uploadResult.primary.mimeType || file.type || undefined,
          size: uploadResult.primary.size ?? file.size,
          fileName: uploadResult.primary.fileName || file.name,
        };
        workingSources = { ...workingSources, [id]: newSource };
        onChangeSources(workingSources);
        seedSyncMapFromUploadOutcomes(id, uploadResult.perDestination);
        results.push({ file, ok: true });
      } catch (err) {
        results.push({
          file,
          ok: false,
          errorMessage: err instanceof Error ? err.message : "上傳失敗",
        });
      }
    }
    return results;
  };

  /**
   * 「更新既有檔案」的入口：用在單筆 file 卡片展開後的預覽框，使用者點擊或
   * 拖放新檔案取代目前的內容。跟 uploadFiles（新增）走同一條
   * uploadFileToAllEnabledDests，一樣會自動送到「每一個」已啟用目的地、
   * 一樣把逐一結果直接寫進 syncMap；差別只在於這裡是覆蓋既有的
   * FileDataSource（保留原本的 id / label / caption / description），
   * 而不是新增一筆。
   *
   * fileName 一律用這次上傳的原始檔名（含副檔名），並寫回
   * FileDataSource.fileName，讓之後任何「備援同步」（performSync /
   * 全部同步）都能沿用同一個保留副檔名的檔名，不會因為改用 label／id
   * 當檔名而在 S3 相容節點上遺失副檔名。
   *
   * 這裡會讀既有這筆 FileDataSource 上的 preferredDestId（使用者在
   * PreferredDestSelect 下拉選單設定過的「偏好目的地」），傳給
   * uploadFileToAllEnabledDests 決定這次上傳完 url 該對齊哪個目的地；
   * 新增檔案（uploadFiles）時還沒有既有的 FileDataSource、自然也就沒有
   * 這個偏好可套用，維持原本「本機優先、其次 S3」的預設規則。
   */
  const updateExistingFile = async (
    fileId: string,
    file: File,
  ): Promise<{ url: string; mimeType?: string; size?: number; fileName?: string }> => {
    const existing = sources[fileId] as FileDataSource | undefined;
    const uploadResult = await uploadFileToAllEnabledDests(
      file,
      appName,
      existing?.preferredDestId,
    );
    const updatedSource: FileDataSource = {
      ...(existing as FileDataSource),
      id: fileId,
      kind: "file",
      url: uploadResult.primary.url,
      mimeType: uploadResult.primary.mimeType || file.type || undefined,
      size: uploadResult.primary.size ?? file.size,
      uploadedAt: new Date().toISOString(),
      fileName: uploadResult.primary.fileName || file.name,
    };
    onChangeSources({ ...sources, [fileId]: updatedSource });
    seedSyncMapFromUploadOutcomes(fileId, uploadResult.perDestination);
    return {
      url: updatedSource.url,
      mimeType: updatedSource.mimeType,
      size: updatedSource.size,
      fileName: updatedSource.fileName,
    };
  };

  const refresh = () => setRefreshTick((n) => n + 1);

  return { files, destinations, syncMap, performSync, uploadFiles, updateExistingFile, refresh };
}

const SHORT_LABEL: Record<SyncState, string> = {
  unsynced: "未",
  syncing: "…",
  synced: "✓",
  failed: "✗",
};

// 單筆檔案列內的同步狀態叢集：每個已啟用目的地一個小藥丸（點擊觸發真正的同步），
// 加一個「全部同步」鈕。放在資料列刪除鈕的左側。
export function FileRowSyncCluster({
  file,
  destinations,
  syncMap,
  performSync,
}: {
  file: FileDataSource;
  destinations: ReturnType<typeof readUploadDestinations>;
  syncMap: FileSyncMap;
  performSync: (fileId: string, destId: string) => void;
}) {
  if (destinations.length === 0) {
    return <span style={noDestStyle}>未啟用目的地</span>;
  }

  const syncAll = () => {
    for (const d of destinations) performSync(file.id, d.id);
  };

  return (
    <div style={clusterStyle}>
      {destinations.map((d) => {
        const record = syncMap[syncKey(file.id, d.id)];
        const state: SyncState = record?.state ?? "unsynced";
        const tip = [
          `${d.label || d.id}：${SYNC_STATE_LABELS[state]}`,
          state === "failed" && record?.errorMessage ? `（${record.errorMessage}）` : "",
          state === "synced" && record?.syncedUrl ? `\n${record.syncedUrl}` : "",
        ]
          .filter(Boolean)
          .join("");
        return (
          <button
            key={d.id}
            style={{ ...pillStyle, ...stateStyleMap[state] }}
            onClick={() => performSync(file.id, d.id)}
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
        style={syncAllBtnStyle}
        onClick={syncAll}
        title="全部同步：同步到所有已啟用的目的地（備援：一般上傳當下已自動同步過一次）"
        aria-label="全部同步"
      >
        <RotateCw size={11} />
      </button>
    </div>
  );
}

/**
 * 拖拉上傳區：接受拖放檔案（也可點擊改用傳統選檔），交給
 * useFileSync 回傳的 uploadFiles() 處理——每個檔案存進 OPFS，並自動
 * 送到所有已啟用的上傳目的地，成功後新增一筆對應的 FileDataSource。
 *
 * 放在「檔案 File」tab 工具列旁（fileToolbarExtra），跟「重新整理
 * 目的地」鈕並列。
 */
export function FileDropZone({
  uploadFiles,
  destinationCount,
}: {
  uploadFiles: (files: File[]) => Promise<{ file: File; ok: boolean; errorMessage?: string }[]>;
  destinationCount: number;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const results = await uploadFiles(Array.from(fileList));
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        toast.error(
          failed.length === 1 ? `${failed[0].file.name} 上傳失敗` : `${failed.length} 個檔案上傳失敗`,
          {
            description: failed
              .map((f) => `${f.file.name}：${f.errorMessage ?? "上傳失敗"}`)
              .join("；"),
          },
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    // 一定要 preventDefault，瀏覽器才會允許 drop（否則會被當成一般連結開啟）
    e.preventDefault();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        onDrop={onDrop}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        title={
          destinationCount > 0
            ? `拖放檔案到這裡上傳，會自動同步到全部 ${destinationCount} 個已啟用目的地`
            : "拖放檔案到這裡上傳（目前沒有已啟用的上傳目的地，檔案只會存進瀏覽器 OPFS）"
        }
        style={{
          ...dropZoneStyle,
          ...(isDragging ? dropZoneActiveStyle : null),
          ...(uploading ? { opacity: 0.6, cursor: "wait" } : null),
        }}
      >
        <UploadCloud size={13} />
        <span>{uploading ? "上傳中…" : "拖放檔案到這裡，或點擊選檔"}</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/**
 * 展開的 file 卡片詳細資訊區塊使用：列出這個檔案在每一個「已啟用」目的地
 * 的完整同步狀態與 url（已同步才顯示 url，其餘狀態顯示對應說明文字）。
 * 跟標題列的 FileRowSyncCluster 不同，這裡不是精簡的小藥丸，而是完整的
 * 一行一個節點，方便直接複製 url。
 */
export function FileDetailSyncList({
  file,
  destinations,
  syncMap,
}: {
  file: FileDataSource;
  destinations: ReturnType<typeof readUploadDestinations>;
  syncMap: FileSyncMap;
}) {
  if (destinations.length === 0) {
    return <span style={noDestStyle}>未啟用任何上傳目的地</span>;
  }

  return (
    <div style={detailListStyle}>
      {destinations.map((d) => {
        const record = syncMap[syncKey(file.id, d.id)];
        const state: SyncState = record?.state ?? "unsynced";
        return (
          <div key={d.id} style={detailRowStyle}>
            <span style={detailDestLabelStyle}>
              {d.kind === "s3" ? <Cloud size={11} /> : <HardDrive size={11} />}
              {d.label || d.id}
            </span>
            <span style={{ ...detailStateStyle, ...detailStateColorMap[state] }}>
              {SYNC_STATE_LABELS[state]}
            </span>
            {state === "synced" && record?.syncedUrl ? (
              <a
                href={record.syncedUrl}
                target="_blank"
                rel="noreferrer"
                style={detailUrlStyle}
                title={record.syncedUrl}
              >
                {record.syncedUrl}
              </a>
            ) : state === "failed" && record?.errorMessage ? (
              <span style={detailErrorStyle} title={record.errorMessage}>
                {record.errorMessage}
              </span>
            ) : (
              <span style={detailEmptyStyle}>—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const clusterStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  flexShrink: 0,
};

/**
 * 統一跟 DataSourceManager 自己的工具列按鈕（ioBtnStyle / addBtnStyle）同一套
 * 尺寸（padding 4px 10px、fontSize 12），避免這裡的按鈕看起來明顯比較大。
 * 純 icon、無文字，配合 title 提供完整說明。
 */
const iconBtnStyle: CSSProperties = {
  background: "#2d2d2d",
  color: "#ccc",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 12,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

/** 「全部同步」：跟其他目的地小藥丸（pillStyle）同高，放在同一列不會忽大忽小。 */
const syncAllBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #444",
  borderRadius: 999,
  padding: "2px 7px",
  background: "#222",
  color: "#7fdbca",
  cursor: "pointer",
  lineHeight: 1,
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

const dropZoneStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "#aaa",
  border: "1px dashed #444",
  borderRadius: 6,
  padding: "5px 12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "border-color 120ms, color 120ms, background 120ms",
};

const dropZoneActiveStyle: CSSProperties = {
  borderColor: "#2d6a4f",
  color: "#7fdbca",
  background: "#132119",
};

const detailListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const detailRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  flexWrap: "wrap",
};

const detailDestLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color: "#ccc",
  flexShrink: 0,
};

const detailStateStyle: CSSProperties = {
  fontSize: 11,
  padding: "1px 6px",
  borderRadius: 999,
  border: "1px solid #444",
  flexShrink: 0,
};

const detailStateColorMap: Record<SyncState, CSSProperties> = {
  unsynced: { background: "#222", color: "#999", borderColor: "#444" },
  syncing: { background: "#2a2a12", color: "#e8c64c", borderColor: "#5a4a1f" },
  synced: { background: "#18271f", color: "#7fdbca", borderColor: "#2d6a4f" },
  failed: { background: "#2a1414", color: "#e77", borderColor: "#5a2b2b" },
};

const detailUrlStyle: CSSProperties = {
  color: "#7aa2f7",
  overflowWrap: "anywhere",
  textDecoration: "none",
};

const detailErrorStyle: CSSProperties = {
  color: "#e77",
  overflowWrap: "anywhere",
};

const detailEmptyStyle: CSSProperties = {
  color: "#666",
};