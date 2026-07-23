import { useState } from "react";
import {
  AdminLayout,
  usePersistentState,
  panelStyle,
  panelTitleStyle,
  labelStyle,
  fieldRowStyle,
  inputStyle,
  textareaStyle,
  primaryBtnStyle,
  ghostBtnStyle,
  dangerBtnStyle,
} from "./admin-ui";

// 頁面管理：頁面本身的新增 / 刪除 / 編輯，以及每頁的 SEO 設定。
interface PageSeo {
  title: string;
  description: string;
  keywords: string;
  ogImage: string;
  noindex: boolean;
}

interface PageItem {
  id: string;
  name: string;
  path: string;
  status: "draft" | "published";
  seo: PageSeo;
}

const emptySeo = (): PageSeo => ({
  title: "",
  description: "",
  keywords: "",
  ogImage: "",
  noindex: false,
});

const INITIAL_PAGES: PageItem[] = [
  {
    id: "home",
    name: "首頁",
    path: "/",
    status: "published",
    seo: {
      title: "首頁",
      description: "網站首頁",
      keywords: "home",
      ogImage: "",
      noindex: false,
    },
  },
  {
    id: "about",
    name: "關於我們",
    path: "/about",
    status: "published",
    seo: { ...emptySeo(), title: "關於我們" },
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

  const selected = pages.find((p) => p.id === selectedId) ?? null;

  const addPage = () => {
    const id = makeId();
    const next: PageItem = {
      id,
      name: "新頁面",
      path: "/new-page",
      status: "draft",
      seo: emptySeo(),
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
  };

  const updateSeo = (patch: Partial<PageSeo>) => {
    if (!selected) return;
    updateSelected({ seo: { ...selected.seo, ...patch } });
  };

  return (
    <AdminLayout
      title="頁面管理"
      description="新增、編輯、刪除網站頁面，並設定每一頁的 SEO。變更會自動儲存。"
      actions={
        <button style={primaryBtnStyle} onClick={addPage}>
          + 新增頁面
        </button>
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
                    <div style={{ fontSize: 11, color: "#888" }}>{p.path}</div>
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
                <h2 style={{ ...panelTitleStyle, margin: 0 }}>編輯頁面</h2>
                <button style={dangerBtnStyle} onClick={() => deletePage(selected.id)}>
                  刪除此頁
                </button>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ ...fieldRowStyle, flex: 1, minWidth: 160 }}>
                  <label style={labelStyle}>頁面名稱</label>
                  <input
                    style={inputStyle}
                    value={selected.name}
                    onChange={(e) => updateSelected({ name: e.target.value })}
                  />
                </div>
                <div style={{ ...fieldRowStyle, flex: 1, minWidth: 160 }}>
                  <label style={labelStyle}>路徑（Path）</label>
                  <input
                    style={inputStyle}
                    value={selected.path}
                    onChange={(e) => updateSelected({ path: e.target.value })}
                  />
                </div>
              </div>

              <div style={fieldRowStyle}>
                <label style={labelStyle}>狀態</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["draft", "published"] as const).map((s) => (
                    <button
                      key={s}
                      style={
                        selected.status === s
                          ? primaryBtnStyle
                          : ghostBtnStyle
                      }
                      onClick={() => updateSelected({ status: s })}
                    >
                      {s === "published" ? "已發布" : "草稿"}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  borderTop: "1px solid #333",
                  margin: "8px 0 16px",
                  paddingTop: 16,
                }}
              >
                <h3 style={{ fontSize: 13, color: "#ccc", margin: "0 0 12px" }}>
                  SEO 設定
                </h3>
                <div style={fieldRowStyle}>
                  <label style={labelStyle}>SEO 標題</label>
                  <input
                    style={inputStyle}
                    value={selected.seo.title}
                    onChange={(e) => updateSeo({ title: e.target.value })}
                  />
                </div>
                <div style={fieldRowStyle}>
                  <label style={labelStyle}>SEO 描述</label>
                  <textarea
                    style={textareaStyle}
                    value={selected.seo.description}
                    onChange={(e) => updateSeo({ description: e.target.value })}
                  />
                </div>
                <div style={fieldRowStyle}>
                  <label style={labelStyle}>關鍵字（逗號分隔）</label>
                  <input
                    style={inputStyle}
                    value={selected.seo.keywords}
                    onChange={(e) => updateSeo({ keywords: e.target.value })}
                  />
                </div>
                <div style={fieldRowStyle}>
                  <label style={labelStyle}>OG 分享圖</label>
                  <input
                    style={inputStyle}
                    value={selected.seo.ogImage}
                    onChange={(e) => updateSeo({ ogImage: e.target.value })}
                  />
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: "#ccc",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.seo.noindex}
                    onChange={(e) => updateSeo({ noindex: e.target.checked })}
                  />
                  禁止搜尋引擎索引（noindex）
                </label>
              </div>
            </>
          )}
        </section>
      </div>
    </AdminLayout>
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
