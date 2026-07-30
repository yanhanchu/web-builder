import type { CSSProperties, ReactNode } from "react";
import {
  usePersistentState,
  panelStyle,
  panelTitleStyle,
  labelStyle,
  fieldRowStyle,
  inputStyle,
  textareaStyle,
} from "@/pages/admin/admin-ui";
import type { SeoData } from "@/lib/data-model";

// ------------------------------------------------------------
// 後台表單常用的共用元件，原本各自在 app-settings.tsx /
// page-manager/properties-panel.tsx 重複定義（Field、SEO 欄位表單）
// 或只在單一檔案定義但其實泛用（CollapsibleSection、TypeBadge），
// 抽到這裡讓兩處（以及之後任何後台頁面）共用同一份。
// ------------------------------------------------------------

/** 單一欄位標籤 + 輸入框的排版包裝。 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={fieldRowStyle}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

/** 型別資料徽章（例如 typedData:seo:default），顯示型別 id 的 # 後半段。 */
export function TypeBadge({ typeId }: { typeId: string }) {
  return (
    <span style={typeBadgeStyle} title={typeId}>
      {typeId.split("#")[1] ?? typeId}
    </span>
  );
}

export const typeBadgeStyle: CSSProperties = {
  fontSize: 11,
  color: "#7fdbca",
  border: "1px solid #2d6a4f",
  background: "#173029",
  borderRadius: 4,
  padding: "1px 6px",
  fontFamily: "monospace",
};

export const countBadgeStyle: CSSProperties = {
  fontSize: 11,
  color: "#aaa",
  border: "1px solid #444",
  background: "#222",
  borderRadius: 999,
  padding: "1px 8px",
};

/**
 * 可收合區塊：包住 <section style={panelStyle}> 的標題列 + 內容，標題列
 * 點擊切換展開／收合。展開狀態用 usePersistentState 記在 localStorage
 * （key 由呼叫端傳入、每個區塊各自獨立），重新整理頁面後維持使用者上次
 * 收合／展開的狀態。
 *
 * 原本只在 app-settings.tsx 內部定義，但屬於通用的版面模式，抽出來讓
 * 之後任何有「欄位很多、想分區塊收合」需求的後台頁面都能重用。
 */
export function CollapsibleSection({
  storageKey,
  defaultExpanded = true,
  title,
  titleExtra,
  headerExtra,
  description,
  children,
}: {
  /** localStorage key，決定這個區塊的展開狀態要記在哪裡；同一頁面內每個區塊要用不同的 key。 */
  storageKey: string;
  /** 第一次造訪（localStorage 裡還沒有值）時的預設展開狀態。 */
  defaultExpanded?: boolean;
  /** 標題列文字。 */
  title: string;
  /** 緊接在標題文字後方的小型內容（例如 TypeBadge），跟標題同一行、同樣可點擊觸發收合。 */
  titleExtra?: ReactNode;
  /** 標題列最右側的內容（例如「已啟用數量」徽章），不觸發收合，可放獨立的互動元素。 */
  headerExtra?: ReactNode;
  /** 標題列下方的說明文字，只在展開時顯示。 */
  description?: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = usePersistentState<boolean>(storageKey, defaultExpanded);

  return (
    <section style={panelStyle}>
      <div style={collapsibleHeaderRowStyle}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={collapsibleTitleBtnStyle}
          aria-expanded={expanded}
          title={expanded ? "收合" : "展開"}
        >
          <span
            style={{
              ...collapsibleChevronStyle,
              transform: expanded ? "rotate(90deg)" : "none",
            }}
          >
            ▶
          </span>
          <h2 style={{ ...panelTitleStyle, margin: 0 }}>{title}</h2>
          {titleExtra}
        </button>
        {headerExtra}
      </div>
      {expanded && (
        <>
          {description}
          {children}
        </>
      )}
    </section>
  );
}

const collapsibleHeaderRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const collapsibleTitleBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "transparent",
  border: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  color: "inherit",
  textAlign: "left",
};

const collapsibleChevronStyle: CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  color: "#888",
  transition: "transform 120ms",
  flexShrink: 0,
};

/**
 * SeoData 的欄位表單本體。原本在 app-settings.tsx（綁定
 * typedData:seo:default 全站預設）與 page-manager/properties-panel.tsx
 * （綁定每頁各自的 typedData:seo:page:{id}）各自重複貼了一份幾乎一模
 * 一樣的欄位清單，只有 onChange 接的 setter 不同——抽成同一個受控元件，
 * 兩處都改成傳自己的 seo 值與 onChange 即可。
 */
export function SeoFields({
  seo,
  onChange,
}: {
  seo: SeoData;
  onChange: (patch: Partial<SeoData>) => void;
}) {
  return (
    <>
      <Field label="預設標題（title）">
        <input style={inputStyle} value={seo.title} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label="標題模板（titleTemplate，%s 替換為頁面標題）">
        <input
          style={inputStyle}
          value={seo.titleTemplate}
          onChange={(e) => onChange({ titleTemplate: e.target.value })}
        />
      </Field>
      <Field label="預設描述（description）">
        <textarea
          style={textareaStyle}
          value={seo.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
      <Field label="預設關鍵字（keywords，逗號分隔）">
        <input style={inputStyle} value={seo.keywords} onChange={(e) => onChange({ keywords: e.target.value })} />
      </Field>
      <Field label="預設 OG 分享圖（ogImage）">
        <input style={inputStyle} value={seo.ogImage} onChange={(e) => onChange({ ogImage: e.target.value })} />
      </Field>
      <Field label="OG 類型（ogType）">
        <select
          style={inputStyle}
          value={seo.ogType}
          onChange={(e) => onChange({ ogType: e.target.value as SeoData["ogType"] })}
        >
          <option value="website">website</option>
          <option value="article">article</option>
        </select>
      </Field>
      <Field label="Twitter 卡片類型（twitterCard）">
        <input style={inputStyle} value={seo.twitterCard} onChange={(e) => onChange({ twitterCard: e.target.value })} />
      </Field>
      <Field label="Twitter 網站帳號（twitterSite）">
        <input style={inputStyle} value={seo.twitterSite} onChange={(e) => onChange({ twitterSite: e.target.value })} />
      </Field>
      <Field label="標準網址（canonicalUrl）">
        <input style={inputStyle} value={seo.canonicalUrl} onChange={(e) => onChange({ canonicalUrl: e.target.value })} />
      </Field>
      <Field label="Robots 指令（robots）">
        <input style={inputStyle} value={seo.robots} onChange={(e) => onChange({ robots: e.target.value })} />
      </Field>
    </>
  );
}
