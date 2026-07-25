import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  AdminLayout,
  usePersistentState,
  useSavedFlash,
  panelStyle,
  panelTitleStyle,
  labelStyle,
  fieldRowStyle,
  inputStyle,
  textareaStyle,
  primaryBtnStyle,
  ghostBtnStyle,
  dangerBtnStyle,
  savedFlashStyle,
} from "./admin-ui";
import { defaultSeo, type SeoData } from "@workspace/ui/lib/data-model";
import { SeoDataTypeId } from "@workspace/ui/lib/data-model/sample-data";

// 頁面管理：頁面本身的新增 / 刪除 / 編輯，以及每頁的 SEO 設定。
//
// 變更重點：
//  - 每頁的 SEO 綁定到單一型別資料記錄（SeoData），不再各自重複定義欄位。
//  - 頁面路徑（path）移除，改由路由管理（data-manager 的 route 來源）選擇。
//  - noindex 同樣由路由管理設定，不在頁面這裡處理。

interface PageItem {
  id: string;
  name: string;
  status: "draft" | "published";
  /** 每頁綁定一筆 SeoData 型別資料（value 即 SEO 內容）。 */
  seo: SeoData;
}

const SEO_KEY_PREFIX = "wb.typedData.seo:page:";

const INITIAL_PAGES: PageItem[] = [
  {
    id: "home",
    name: "首頁",
    status: "published",
    seo: { ...defaultSeo, title: "首頁", description: "網站首頁" },
  },
  {
    id: "about",
    name: "關於我們",
    status: "published",
    seo: { ...defaultSeo, title: "關於我們" },
  },
];

function makeId() {
  return "page_" + Math.random().toString(36).slice(2, 8);
}

export default function PageManagerPage() {
  const [pages, setPages] = usePersistentState<PageItem[]>("wb.pages", INITIAL_PAGES);
  const [selectedId, setSelectedId] = useState<string | null>(
    INITIAL_PAGES[0]?.id ?? null
  );
  const [saved, flashSaved] = useSavedFlash();

  const selected = pages.find((p) => p.id === selectedId) ?? null;

  const addPage = () => {
    const id = makeId();
    const next: PageItem = {
      id,
      name: "新頁面",
      status: "draft",
      seo: { ...defaultSeo },
    };
    setPages([...pages, next]);
    setSelectedId(id);
  };

  const deletePage = (id: string) => {
    const next = pages.filter((p) => p.id !== id);
    setPages(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const updateSelected = (patch: Partial<PageItem>) => {
    if (!selected) return;
    setPages(pages.map((p) => (p.id === selected.id ? { ...p, ...patch } : p)));
    flashSaved();
  };

  const updateSeo = (patch: Partial<SeoData>) => {
    if (!selected) return;
    updateSelected({ seo: { ...selected.seo, ...patch } });
  };

  return (
    <AdminLayout
      title="頁面管理"
      description="新增、編輯、刪除網站頁面，並設定每一頁的 SEO。頁面路徑與 noindex 由「路由管理」設定。"
      actions={
        <>
          {saved && <span style={savedFlashStyle}>已儲存 ✓</span>}
          <button style={primaryBtnStyle} onClick={addPage} title="新增頁面">
            <Plus size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
            新增頁面
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* 左：頁面清單 */}
        <section style={{ ...panelStyle, flex: 1, minWidth: 280, marginBottom: 0 }}>
          <h2 style={panelTitleStyle}>頁面清單（{pages.length}）</h2>
          {pages.length === 0 && (
            <p style={{ color: "#777", fontSize: 13 }}>尚無頁面，點右上角新增。</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pages.map((p) => {
              const active = p.id === selectedId;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    border: active ? "1px solid #2d9c74" : "1px solid #333",
                    background: active ? "#18271f" : "#151515",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{p.id}</div>
                  </div>
                  <span style={statusBadge(p.status)}>
                    {p.status === "published" ? "已發布" : "草稿"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 右：編輯區 */}
        <section style={{ ...panelStyle, flex: 2, minWidth: 340, marginBottom: 0 }}>
          {!selected ? (
            <p style={{ color: "#777", fontSize: 13 }}>選擇左側頁面以編輯，或新增一個頁面。</p>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ ...panelTitleStyle, margin: 0 }}>編輯頁面</h2>
                  <span style={typeBadgeStyle} title={SeoDataTypeId}>
                    SeoData
                  </span>
                </div>
                <button style={dangerBtnStyle} onClick={() => deletePage(selected.id)} title="刪除此頁">
                  <Trash2 size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  刪除此頁
                </button>
              </div>

              <div style={fieldRowStyle}>
                <label style={labelStyle}>頁面名稱</label>
                <input
                  style={inputStyle}
                  value={selected.name}
                  onChange={(e) => updateSelected({ name: e.target.value })}
                />
              </div>

              <div style={fieldRowStyle}>
                <label style={labelStyle}>狀態</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["draft", "published"] as const).map((s) => (
                    <button
                      key={s}
                      style={selected.status === s ? primaryBtnStyle : ghostBtnStyle}
                      onClick={() => updateSelected({ status: s })}
                    >
                      {s === "published" ? "已發布" : "草稿"}
                    </button>
                  ))}
                </div>
              </div>

              <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>
                頁面路徑與 noindex 由「資料管理 → 路由」設定。此頁綁定型別資料：
                <code> {SEO_KEY_PREFIX}{selected.id} </code>
              </p>

              <div
                style={{
                  borderTop: "1px solid #333",
                  margin: "8px 0 16px",
                  paddingTop: 16,
                }}
              >
                <h3 style={{ fontSize: 13, color: "#ccc", margin: "0 0 12px" }}>
                  SEO 設定（綁定 SeoData）
                </h3>
                <SeoFields seo={selected.seo} onChange={updateSeo} />
              </div>
            </>
          )}
        </section>
      </div>
    </AdminLayout>
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

function statusBadge(status: PageItem["status"]): React.CSSProperties {
  const published = status === "published";
  return {
    flexShrink: 0,
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    color: published ? "#8fe" : "#eb9",
    background: published ? "#173029" : "#2b2417",
    border: `1px solid ${published ? "#2d9c74" : "#6b5a2a"}`,
  };
}

const typeBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#7fdbca",
  border: "1px solid #2d6a4f",
  background: "#173029",
  borderRadius: 4,
  padding: "1px 6px",
  fontFamily: "monospace",
};
