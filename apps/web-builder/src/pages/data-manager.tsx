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
import { AdminLayout, panelStyle, panelTitleStyle } from "./admin/admin-ui";
import { FileSyncPanel } from "./admin/file-sync-panel";

export default function DataManagerPage() {
  // DataSource 全部收在頁面 state，DataSourceManager 是純受控元件
  const [sources, setSources] = useState<Record<string, DataSource>>(initialSources);
  const [locales, setLocales] = useState<string[]>(["zh-TW", "en"]);
  const [previewLocale, setPreviewLocale] = useState<string>("zh-TW");

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
            onChangeSources={setSources}
            onChangeLocales={setLocales}
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

      <FileSyncPanel sources={sources} />
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
