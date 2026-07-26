import { Save, Trash2, Undo2 } from "lucide-react";
import {
  panelTitleStyle,
  labelStyle,
  fieldRowStyle,
  inputStyle,
  textareaStyle,
  primaryBtnStyle,
  ghostBtnStyle,
} from "../admin-ui";
import type { SeoData } from "@workspace/ui/lib/data-model";
import { SeoDataTypeId } from "@workspace/ui/lib/data-model/sample-data";
import type { PageItem } from "@/lib/pages-store";
import { SEO_KEY_PREFIX, typeBadgeStyle, iconBtnStyle } from "./shared";

// 右側「頁面屬性」：頁面名稱 / 狀態 / SEO 設定。
// 對應目前選中的頁面草稿。

export function PropertiesPanel({
  draft,
  dirty,
  onUpdateDraft,
  onUpdateSeoDraft,
  onSave,
  onDiscard,
  onDelete,
}: {
  draft: PageItem | null;
  dirty: boolean;
  onUpdateDraft: (patch: Partial<PageItem>) => void;
  onUpdateSeoDraft: (patch: Partial<SeoData>) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDelete?: () => void;
}) {
  return (
    <section
      style={{
        width: 320,
        minWidth: 320,
        flexShrink: 0,
        borderLeft: "1px solid #2a2a2a",
        background: "#171717",
        overflowY: "auto",
        padding: 14,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2 style={{ ...panelTitleStyle, margin: 0 }}>頁面屬性</h2>
        {draft && (
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            {dirty && (
              <>
                <button style={{ ...iconBtnStyle, color: "#aaa" }} onClick={onDiscard} title="放棄變更">
                  <Undo2 size={14} />
                </button>
                <button style={{ ...iconBtnStyle, color: "#2d9c74" }} onClick={onSave} title="儲存此頁">
                  <Save size={14} />
                </button>
              </>
            )}
            {onDelete && (
              <button style={{ ...iconBtnStyle, color: "#e75454" }} onClick={onDelete} title="刪除此頁">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {!draft ? (
        <p style={{ color: "#777", fontSize: 13 }}>請先從上方工具列選擇頁面。</p>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <span style={typeBadgeStyle} title={SeoDataTypeId}>
              SeoData
            </span>
          </div>

          <div style={fieldRowStyle}>
            <label style={labelStyle}>頁面名稱</label>
            <input
              style={inputStyle}
              value={draft.name}
              onChange={(e) => onUpdateDraft({ name: e.target.value })}
            />
          </div>

          <div style={fieldRowStyle}>
            <label style={labelStyle}>狀態</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["draft", "published"] as const).map((s) => (
                <button
                  key={s}
                  style={draft.status === s ? primaryBtnStyle : ghostBtnStyle}
                  onClick={() => onUpdateDraft({ status: s })}
                >
                  {s === "published" ? "已發布" : "草稿"}
                </button>
              ))}
            </div>
          </div>

          <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>
            頁面路徑與 noindex 由「資料管理 → 路由」設定。此頁綁定型別資料：
            <code> {SEO_KEY_PREFIX}{draft.id} </code>
            <br />
            內容組件組合在中間「視圖」管理（目前 {draft.blocks.length} 個）。
          </p>

          <div
            style={{
              borderTop: "1px solid #333",
              margin: "8px 0 14px",
              paddingTop: 12,
            }}
          >
            <h3 style={{ fontSize: 13, color: "#ccc", margin: "0 0 12px" }}>
              SEO 設定（綁定 SeoData）
            </h3>
            <SeoFields seo={draft.seo} onChange={onUpdateSeoDraft} />
          </div>
        </>
      )}
    </section>
  );
}

function SeoFields({
  seo,
  onChange,
}: {
  seo: SeoData;
  onChange: (patch: Partial<SeoData>) => void;
}) {
  return (
    <>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>SEO 標題（title）</label>
        <input style={inputStyle} value={seo.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>標題模板（titleTemplate，%s = 頁面標題）</label>
        <input style={inputStyle} value={seo.titleTemplate} onChange={(e) => onChange({ titleTemplate: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>SEO 描述（description）</label>
        <textarea style={textareaStyle} value={seo.description} onChange={(e) => onChange({ description: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>關鍵字（keywords，逗號分隔）</label>
        <input style={inputStyle} value={seo.keywords} onChange={(e) => onChange({ keywords: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>OG 分享圖（ogImage）</label>
        <input style={inputStyle} value={seo.ogImage} onChange={(e) => onChange({ ogImage: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>OG 類型（ogType）</label>
        <select style={inputStyle} value={seo.ogType} onChange={(e) => onChange({ ogType: e.target.value as SeoData["ogType"] })}>
          <option value="website">website</option>
          <option value="article">article</option>
        </select>
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>Twitter 卡片類型（twitterCard）</label>
        <input style={inputStyle} value={seo.twitterCard} onChange={(e) => onChange({ twitterCard: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>Twitter 網站帳號（twitterSite）</label>
        <input style={inputStyle} value={seo.twitterSite} onChange={(e) => onChange({ twitterSite: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>標準網址（canonicalUrl）</label>
        <input style={inputStyle} value={seo.canonicalUrl} onChange={(e) => onChange({ canonicalUrl: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>Robots 指令（robots）</label>
        <input style={inputStyle} value={seo.robots} onChange={(e) => onChange({ robots: e.target.value })} />
      </div>
    </>
  );
}