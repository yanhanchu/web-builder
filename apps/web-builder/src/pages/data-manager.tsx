import { useEffect, useMemo, useState } from "react";
import { Download, FolderOutput } from "lucide-react";
import {
  InMemoryDataStore,
  resolveValue,
  DataSourceManager,
  type DataSource,
  type DataSourceKind,
} from "@workspace/ui/lib/data-model";
import {
  sources as initialSources,
  typeRegistry,
  headerPropsType,
  footerPropsType,
  initialHeaderProps,
  initialFooterProps,
} from "@workspace/ui/lib/data-model/sample-data";
import { AdminLayout, panelStyle, panelTitleStyle, usePersistentState } from "./admin/admin-ui";
import {
  FileSyncRefreshButton,
  FileRowSyncCluster,
  FileDetailSyncList,
  FileDropZone,
  useFileSync,
} from "./admin/file-sync-panel";
import { usePagesState } from "../lib/pages-store";
import { DEFAULT_APP_NAME } from "../lib/upload-client";
import { resolveOpfsUrlToObjectUrl, isOpfsUrl } from "../lib/opfs";
import { STYLE_SHEETS_KEY, INITIAL_SHEETS, type StyleSheet } from "./admin/style-manager";
import { buildFlatDataFiles } from "../lib/export-flat-data";
import { downloadFlatDataZip } from "../lib/download-flat-data-zip";
import { exportFlatDataToServer } from "../lib/export-flat-data-to-server";

// 目前 DataSourceManager 支援的四種分頁，順序跟元件內部 KIND_ORDER 一致，
// 用來驗證從 URL hash 讀回來的值是不是合法的 kind（避免手動改網址帶入亂字串）。
const DATA_SOURCE_KINDS: DataSourceKind[] = ["i18n", "route", "file", "typedData"];

function isDataSourceKind(value: string): value is DataSourceKind {
  return (DATA_SOURCE_KINDS as string[]).includes(value);
}

/**
 * 把「目前分頁」同步進 URL hash（例如 #tab=file），重新整理頁面或分享網址
 * 都能還原到離開前的分頁。用 hash 而不是 search param，是因為分頁切換純粹
 * 是前端 UI 狀態，不需要觸發任何路由變化或伺服器請求。
 */
function useHashTab(defaultKind: DataSourceKind): [DataSourceKind, (next: DataSourceKind) => void] {
  const readFromHash = (): DataSourceKind => {
    if (typeof window === "undefined") return defaultKind;
    const raw = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(raw);
    const tab = params.get("tab");
    return tab && isDataSourceKind(tab) ? tab : defaultKind;
  };

  const [kind, setKind] = useState<DataSourceKind>(readFromHash);

  // 使用者按瀏覽器上一頁／下一頁時，hash 可能被瀏覽器直接改掉，這裡跟著同步回 state。
  useEffect(() => {
    const onHashChange = () => setKind(readFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeKind = (next: DataSourceKind) => {
    setKind(next);
    // replaceState 而非改 location.hash：避免每次切分頁都在瀏覽器歷史留一筆，
    // 讓「上一頁」還是回到進入資料管理頁之前，而不是卡在分頁切換的中間步驟。
    const url = new URL(window.location.href);
    url.hash = `tab=${next}`;
    window.history.replaceState(null, "", url);
  };

  return [kind, changeKind];
}

export default function DataManagerPage() {
  // DataSource 全部收在 localStorage（key: wb.dataSources），DataSourceManager
  // 是純受控元件。之前這裡只用一般的 useState，按下「儲存」只改了記憶體內的
  // state，重新整理頁面或切到別的後台頁面再回來，資料就消失了 —— 看起來像
  // 「儲存後沒有存」。改用 usePersistentState 讓儲存真的落地。
  const [sources, setSources] = usePersistentState<Record<string, DataSource>>(
    "wb.dataSources",
    initialSources
  );
  const [locales, setLocales] = usePersistentState<string[]>("wb.locales", ["zh-TW", "en"]);
  const [previewLocale, setPreviewLocale] = useState<string>("zh-TW");
  // 目前分頁同步進 URL hash（#tab=file），重新整理頁面不會跳回第一個分頁。
  const [activeKind, setActiveKind] = useHashTab("i18n");
  // 頁面清單跟「頁面管理」共用同一份 store（同一個 key、同一份預設值），
  // 這裡只讀，不呼叫 setPages，避免兩邊 fallback 初始值不一致。
  const [pages] = usePagesState();
  // 樣式表清單同理只讀：跟「樣式管理」共用同一個 key / 初始值
  // （STYLE_SHEETS_KEY / INITIAL_SHEETS 從 style-manager.tsx 匯出，
  // 匯出資料需要 style-sheets.json，這裡只是借用同一份 state，不做任何編輯）。
  const [styleSheets] = usePersistentState<StyleSheet[]>(STYLE_SHEETS_KEY, INITIAL_SHEETS);
  const fileSync = useFileSync(sources, setSources, DEFAULT_APP_NAME);

  const [zipExportState, setZipExportState] = useState<"idle" | "exporting" | "error">("idle");
  const [writeExportState, setWriteExportState] = useState<"idle" | "exporting" | "error">("idle");
  // 寫檔成功後記錄實際寫入的資料夾名稱（例如 "data-07-28"），顯示在按鈕旁邊。
  const [exportedDir, setExportedDir] = useState<string | null>(null);

  // 匯出（下載 zip）：把目前 localStorage 裡的四種資料（sources / locales /
  // pages / styleSheets）轉成 apps/site-generator 讀取的攤平檔案格式，打包成
  // zip 觸發下載。使用者下載後手動解壓縮覆蓋專案的 data/ 目錄即可 —— 不需要
  // dev server 額外提供的寫檔 API，純瀏覽器就能完成，適合不在本機開發環境
  // （例如只在瀏覽器操作、要把資料帶去別的地方）的情境。
  const handleExportZip = async () => {
    setZipExportState("exporting");
    try {
      const files = buildFlatDataFiles({ sources, locales, pages, styleSheets });
      await downloadFlatDataZip(files, "data.zip");
      setZipExportState("idle");
    } catch (err) {
      console.error("匯出攤平資料失敗：", err);
      setZipExportState("error");
    }
  };

  // 回寫到專案：把同一份攤平資料改成呼叫 vite dev server 的
  // /api/data-export，由 server 直接寫檔到專案根目錄的 data-{mm-dd}/
  // （未打包），不需要使用者下載 zip 後手動解壓縮覆蓋。只能在本機
  // dev server 有跑起來時使用（見 server/data-export-dev-plugin.ts）。
  const handleWriteToServer = async () => {
    setWriteExportState("exporting");
    try {
      const files = buildFlatDataFiles({ sources, locales, pages, styleSheets });
      const result = await exportFlatDataToServer(files);
      setExportedDir(result.dir);
      setWriteExportState("idle");
    } catch (err) {
      console.error("回寫攤平資料失敗：", err);
      setWriteExportState("error");
    }
  };

  // 每次 sources 一改就重建 store，讓下方 resolved 預覽即時反映
  const store = useMemo(
    () => new InMemoryDataStore(sources, typeRegistry),
    [sources]
  );

  const resolvedHeader = useMemo(
    () => resolveValue(headerPropsType, initialHeaderProps, store, { locale: previewLocale }),
    [store, previewLocale]
  );
  const resolvedFooter = useMemo(
    () => resolveValue(footerPropsType, initialFooterProps, store, { locale: previewLocale }),
    [store, previewLocale]
  );

  return (
    <AdminLayout
      title="資料管理"
      description="管理 schema.ts 定義的四種「值的來源」：i18n 多語系、路由、檔案、型別資料。新增 / 編輯 / 刪除任何一筆，右側 Header / Footer 的 resolved 結果會即時同步。"
      actions={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#aaa" }}>預覽 locale：</span>
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => setPreviewLocale(l)}
              style={{
                ...localeBtnStyle,
                background: previewLocale === l ? "#2d6a4f" : "#2d2d2d",
              }}
            >
              {l}
            </button>
          ))}
          <button
            onClick={handleExportZip}
            disabled={zipExportState === "exporting"}
            title="把目前的 sources / locales / pages / styleSheets 匯出成 data/ 攤平檔案（zip）"
            style={{
              ...localeBtnStyle,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: zipExportState === "error" ? "#7a2d2d" : "#2d2d2d",
              cursor: zipExportState === "exporting" ? "wait" : "pointer",
            }}
          >
            <Download size={14} />
            {zipExportState === "exporting"
              ? "匯出中…"
              : zipExportState === "error"
                ? "匯出失敗，重試"
                : "匯出 data.zip"}
          </button>
          <button
            onClick={handleWriteToServer}
            disabled={writeExportState === "exporting"}
            title="把目前的 sources / locales / pages / styleSheets 寫到專案的 data-{mm-dd}/ 目錄（未打包，需 dev server 執行中）"
            style={{
              ...localeBtnStyle,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: writeExportState === "error" ? "#7a2d2d" : "#2d2d2d",
              cursor: writeExportState === "exporting" ? "wait" : "pointer",
            }}
          >
            <FolderOutput size={14} />
            {writeExportState === "exporting"
              ? "回寫中…"
              : writeExportState === "error"
                ? "回寫失敗，重試"
                : "回寫到 data-{mm-dd}/"}
          </button>
          {exportedDir && writeExportState === "idle" && (
            <span style={{ fontSize: 12, color: "#8fbf8f" }}>已寫入 {exportedDir}/</span>
          )}
        </div>
      }
    >
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <section style={{ ...panelStyle, flex: 2, minWidth: 360, marginBottom: 0 }}>
          <h2 style={panelTitleStyle}>來源管理</h2>
          <DataSourceManager
            sources={sources}
            types={typeRegistry}
            locales={locales}
            pages={pages}
            onChangeSources={setSources}
            onChangeLocales={setLocales}
            activeKind={activeKind}
            onChangeActiveKind={setActiveKind}
            fileToolbarExtra={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <FileDropZone
                  uploadFiles={fileSync.uploadFiles}
                  destinationCount={fileSync.destinations.length}
                />
                <FileSyncRefreshButton onRefresh={fileSync.refresh} />
              </div>
            }
            fileRowSyncSlot={(file) => (
              <FileRowSyncCluster
                file={file}
                destinations={fileSync.destinations}
                syncMap={fileSync.syncMap}
                performSync={fileSync.performSync}
              />
            )}
            fileDetailSyncSlot={(file) => (
              <FileDetailSyncList
                file={file}
                destinations={fileSync.destinations}
                syncMap={fileSync.syncMap}
              />
            )}
            resolvePreviewUrl={(url) => (isOpfsUrl(url) ? resolveOpfsUrlToObjectUrl(url) : url)}
            onUploadFile={async (file, source) => {
              // 更新既有檔案（在已展開的卡片上點擊／拖放新檔案取代內容）：
              // 跟新增檔案走同一條「自動送到所有已啟用目的地」的路徑，
              // 並保留這次上傳的原始檔名（含副檔名），確保 S3 相容節點
              // 之後不會因為改用 label／id 當檔名而遺失副檔名。
              return fileSync.updateExistingFile(source.id, file);
            }}
          />
        </section>

        <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 16 }}>
          <section style={panelStyle}>
            <h2 style={panelTitleStyle}>Resolved · Header（{previewLocale}）</h2>
            <pre style={preStyle}>{JSON.stringify(resolvedHeader, null, 2)}</pre>
          </section>
          <section style={panelStyle}>
            <h2 style={panelTitleStyle}>Resolved · Footer（{previewLocale}）</h2>
            <pre style={preStyle}>{JSON.stringify(resolvedFooter, null, 2)}</pre>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}

const preStyle: React.CSSProperties = {
  fontSize: 12,
  background: "#0d0d0d",
  padding: 12,
  borderRadius: 6,
  overflowX: "auto",
  maxHeight: 360,
  overflowY: "auto",
};

const localeBtnStyle: React.CSSProperties = {
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
};