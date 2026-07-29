import { useMemo, useState } from "react";
import {
  resolveValue,
  FieldEditor,
  type ValueNode,
} from "@/lib/data-model";
import {
  sources,
  typeRegistry,
  headerPropsType,
  footerPropsType,
  headerEntry,
  footerEntry,
  initialHeaderProps,
  initialFooterProps,
  createSampleStore,
} from "@/lib/data-model/sample-data";

export default function DataModelDemoPage() {
  const store = useMemo(() => createSampleStore(), []);
  const [headerProps, setHeaderProps] = useState<ValueNode>(initialHeaderProps);
  const [footerProps, setFooterProps] = useState<ValueNode>(initialFooterProps);
  const [locale, setLocale] = useState<"zh-TW" | "en">("zh-TW");

  const resolvedHeader = useMemo(
    () => resolveValue(headerPropsType, headerProps, store, { locale }),
    [headerProps, store, locale]
  );
  const resolvedFooter = useMemo(
    () => resolveValue(footerPropsType, footerProps, store, { locale }),
    [footerProps, store, locale]
  );

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>資料管理核心 — 示範頁面</h1>
        <p style={{ color: "#888", fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>
          型別直接來自 <code>/data/components.json</code> /{" "}
          <code>component-types.json</code>（generate-docs.mjs 產生，完全不動）。
          <br />
          對照 <code>components/landing1/default.ts</code>：那裡 <code>header</code> 和{" "}
          <code>footer</code> 各自手動填了一份 brandData；這裡兩者的 <code>brand</code>{" "}
          欄位都改成整格綁定同一筆 <code>typedData:brand:main</code>，改一次全部同步。
        </p>
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#aaa" }}>Locale:</span>
          {(["zh-TW", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              style={{
                ...localeBtnStyle,
                background: locale === l ? "#2d6a4f" : "#2d2d2d",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>編輯 · {headerEntry.component.componentName} props</h2>
          <FieldEditor type={headerPropsType} node={headerProps} store={store} onChange={setHeaderProps} />
        </section>

        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>Resolved · Header（實際會傳給 &lt;Header /&gt; 的 props）</h2>
          <pre style={preStyle}>{JSON.stringify(resolvedHeader, null, 2)}</pre>
        </section>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", marginTop: 20 }}>
        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>編輯 · {footerEntry.component.componentName} props</h2>
          <FieldEditor type={footerPropsType} node={footerProps} store={store} onChange={setFooterProps} />
        </section>

        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>Resolved · Footer（實際會傳給 &lt;Footer /&gt; 的 props）</h2>
          <pre style={preStyle}>{JSON.stringify(resolvedFooter, null, 2)}</pre>
        </section>
      </div>

      <section style={{ ...panelStyle, marginTop: 20 }}>
        <h2 style={panelTitleStyle}>
          型別 Registry（由 data/components.json + data/component-types.json 轉換而來）
        </h2>
        <pre style={preStyle}>{JSON.stringify(Object.keys(typeRegistry), null, 2)}</pre>
      </section>

      <section style={{ ...panelStyle, marginTop: 20 }}>
        <h2 style={panelTitleStyle}>DataSource 清單（模擬 i18n / 檔案 / 型別資料 管理系統，已先建好）</h2>
        <pre style={preStyle}>{JSON.stringify(sources, null, 2)}</pre>
      </section>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  background: "#121212",
  color: "#eee",
  minHeight: "100vh",
  fontFamily: "system-ui, sans-serif",
  padding: 24,
  boxSizing: "border-box",
};

const panelStyle: React.CSSProperties = {
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 8,
  padding: 16,
  flex: 1,
  minWidth: 360,
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: 14,
  margin: "0 0 10px 0",
  color: "#ccc",
};

const preStyle: React.CSSProperties = {
  fontSize: 12,
  background: "#0d0d0d",
  padding: 12,
  borderRadius: 6,
  overflowX: "auto",
  maxHeight: 420,
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
