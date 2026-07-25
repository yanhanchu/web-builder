import { useMemo, useState } from "react";
import {
  InMemoryDataStore,
  resolveValue,
  DataSourceManager,
  type DataSource,
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
import { FileSyncRefreshButton, FileRowSyncCluster, useFileSync } from "./admin/file-sync-panel";
import { usePagesState } from "../lib/pages-store";

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
  // 頁面清單跟「頁面管理」共用同一份 store（同一個 key、同一份預設值），
  // 這裡只讀，不呼叫 setPages，避免兩邊 fallback 初始值不一致。
  const [pages] = usePagesState();
  const fileSync = useFileSync(sources);

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
            fileToolbarExtra={
              <FileSyncRefreshButton onRefresh={fileSync.refresh} />
            }
            fileRowSyncSlot={(file) => (
              <FileRowSyncCluster
                file={file}
                destinations={fileSync.destinations}
                syncMap={fileSync.syncMap}
                simulateSync={fileSync.simulateSync}
              />
            )}
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
