import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  AdminLayout,
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
import {
  usePagesState,
  makePageId,
  type PageItem,
} from "../../lib/pages-store";

// 頁面管理：頁面本身的新增 / 刪除 / 編輯，以及每頁的 SEO 設定。
//
// 編輯採「草稿 + 明確儲存」模式（與資料管理一致）：
// 使用者輸入時只改本地草稿，按下「儲存」才寫回 store。
// 儲存按鈕只在有未儲存變更時出現。

const SEO_KEY_PREFIX = "wb.typedData.seo:page:";

export default function PageManagerPage() {
  const [pages, setPages] = usePagesState();
  const [selectedId, setSelectedId] = useState<string | null>(
    pages[0]?.id ?? null
  );
  // 草稿：以 page id 為 key，存放該頁尚未儲存的暫存內容。
  const [drafts, setDrafts] = useState<Record<string, PageItem>>({});
  const [saved, flashSaved] = useSavedFlash();

  const selected = pages.find((p) => p.id === selectedId) ?? null;
  const draft = selected ? (drafts[selected.id] ?? selected) : null;
  const dirty = selected ? drafts[selected.id] != null : false;

  const addPage = () => {
    const id = makePageId();
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
    setDrafts((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  };

  const updateDraft = (patch: Partial<PageItem>) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    setDrafts({ ...drafts, [selected.id]: { ...base, ...patch } });
  };

  const updateSeoDraft = (patch: Partial<SeoData>) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    updateDraft({ seo: { ...base.seo, ...patch } });
  };

  const saveSelected = () => {
    if (!selected || !dirty) return;
    const next = drafts[selected.id];
    setPages(pages.map((p) => (p.id === selected.id ? next : p)));
    setDrafts((prev) => {
      const { [selected.id]: _drop, ...rest } = prev;
      return rest;
    });
    flashSaved();
  };

  const discardDraft = () => {
    if (!selected) return;
    setDrafts((prev) => {
      if (!prev[selected.id]) return prev;
      const { [selected.id]: _drop, ...rest } = prev;
      return rest;
    });
  };

  return (
    <AdminLayout
      title="頁面管理"
      description="新增、編輯、刪除網站頁面，並設定每一頁的 SEO。頁面路徑與 noindex 由「路由管理」設定。"
      actions={
        <>
          {saved && <span style={savedFlashStyle}>已儲存 ✓</span>}
          <button style={primaryBtnStyle} onClick={addPage} title="新增頁面">
            <Plus size={14} />
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
              const hasDraft = drafts[p.id] != null;
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
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {p.name}
                      {hasDraft && (
                        <span style={{ color: "#e8b64c", marginLeft: 6, fontSize: 11 }}>
                          •
                        </span>
                      )}
                    </div>
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
          {!draft ? (
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
                  {dirty && (
                    <span style={{ fontSize: 11, color: "#e8b64c" }}>未儲存變更</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {dirty && (
                    <>
                      <button style={ghostBtnStyle} onClick={discardDraft} title="放棄變更">
                        還原
                      </button>
                      <button style={primaryBtnStyle} onClick={saveSelected} title="儲存此頁">
                        <Save size={14} />
                        儲存
                      </button>
                    </>
                  )}
                  <button style={dangerBtnStyle} onClick={() => deletePage(draft.id)} title="刪除此頁">
                    <Trash2 size={14} />
                    刪除此頁
                  </button>
                </div>
              </div>

              <div style={fieldRowStyle}>
                <label style={labelStyle}>頁面名稱</label>
                <input
                  style={inputStyle}
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                />
              </div>

              <div style={fieldRowStyle}>
                <label style={labelStyle}>狀態</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["draft", "published"] as const).map((s) => (
                    <button
                      key={s}
                      style={draft.status === s ? primaryBtnStyle : ghostBtnStyle}
                      onClick={() => updateDraft({ status: s })}
                    >
                      {s === "published" ? "已發布" : "草稿"}
                    </button>
                  ))}
                </div>
              </div>

              <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>
                頁面路徑與 noindex 由「資料管理 → 路由」設定。此頁綁定型別資料：
                <code> {SEO_KEY_PREFIX}{draft.id} </code>
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
                <SeoFields seo={draft.seo} onChange={updateSeoDraft} />
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
