import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AdminLayout,
  usePersistentState,
  panelStyle,
  panelTitleStyle,
  labelStyle,
  fieldRowStyle,
  inputStyle,
  primaryBtnStyle,
  ghostBtnStyle,
  dangerBtnStyle,
} from "./admin-ui";

// 樣式管理：貼上樣式表並儲存，支援多份樣式表（各有名稱與內容）。
//
// 編輯採「草稿 + 明確儲存」模式（與資料管理、頁面管理一致）：
// 使用者輸入時只改本地草稿，按下「儲存」才寫回 store。
// 儲存按鈕只在有未儲存變更時出現。
//
// StyleSheet / STYLE_SHEETS_KEY / INITIAL_SHEETS 皆 export 出去，供
// page-manager/properties-panel.tsx（頁面屬性面板「套用樣式表」）共用同一份
// 型別與 localStorage key、初始值，避免兩處各自定義而在欄位形狀或 key
// 字串上悄悄不同步。
export const STYLE_SHEETS_KEY = "wb.styleSheets";

export interface StyleSheet {
  id: string;
  name: string;
  css: string;
}

export const INITIAL_SHEETS: StyleSheet[] = [
  {
    id: "global",
    name: "全域樣式",
    css: ":root {\n  --brand: #2d9c74;\n}\n\nbody {\n  font-family: system-ui, sans-serif;\n}",
  },
];

function makeId() {
  return "css_" + Math.random().toString(36).slice(2, 8);
}

export default function StyleManagerPage() {
  const [sheets, setSheets] = usePersistentState<StyleSheet[]>(
    STYLE_SHEETS_KEY,
    INITIAL_SHEETS
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    INITIAL_SHEETS[0]?.id ?? null
  );
  // 草稿：以 sheet id 為 key，存放該樣式表尚未儲存的暫存內容。
  const [drafts, setDrafts] = useState<Record<string, StyleSheet>>({});

  const selected = sheets.find((s) => s.id === selectedId) ?? null;
  const draft = selected ? (drafts[selected.id] ?? selected) : null;
  const dirty = selected ? drafts[selected.id] != null : false;

  const addSheet = () => {
    const id = makeId();
    setSheets([...sheets, { id, name: "新樣式表", css: "" }]);
    setSelectedId(id);
  };

  const deleteSheet = (id: string) => {
    const next = sheets.filter((s) => s.id !== id);
    setSheets(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    setDrafts((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  };

  const updateDraft = (patch: Partial<StyleSheet>) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    setDrafts({ ...drafts, [selected.id]: { ...base, ...patch } });
  };

  const saveSelected = () => {
    if (!selected || !dirty) return;
    const next = drafts[selected.id];
    setSheets(sheets.map((s) => (s.id === selected.id ? next : s)));
    setDrafts((prev) => {
      const { [selected.id]: _drop, ...rest } = prev;
      return rest;
    });
    toast.success("已儲存樣式表");
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
      title="樣式管理"
      description="貼上並儲存自訂 CSS 樣式表。可建立多份。之後可套用到網站頁面。"
      actions={
        <>
          <button style={primaryBtnStyle} onClick={addSheet} title="新增樣式表">
            <Plus size={14} />
            新增樣式表
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* 左：樣式表清單 */}
        <section style={{ ...panelStyle, flex: 1, minWidth: 240, marginBottom: 0 }}>
          <h2 style={panelTitleStyle}>樣式表（{sheets.length}）</h2>
          {sheets.length === 0 && (
            <p style={{ color: "#777", fontSize: 13 }}>尚無樣式表，點右上角新增。</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sheets.map((s) => {
              const active = s.id === selectedId;
              const hasDraft = drafts[s.id] != null;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
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
                      {s.name}
                      {hasDraft && (
                        <span style={{ color: "#e8b64c", marginLeft: 6, fontSize: 11 }}>
                          •
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#888" }}>
                      {s.css.length} 字元
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 右：編輯區 */}
        <section style={{ ...panelStyle, flex: 3, minWidth: 340, marginBottom: 0 }}>
          {!draft ? (
            <p style={{ color: "#777", fontSize: 13 }}>選擇左側樣式表以編輯，或新增一個。</p>
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
                  <h2 style={{ ...panelTitleStyle, margin: 0 }}>編輯樣式表</h2>
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
                      <button style={primaryBtnStyle} onClick={saveSelected} title="儲存此樣式表">
                        <Save size={14} />
                        儲存
                      </button>
                    </>
                  )}
                  <button style={dangerBtnStyle} onClick={() => deleteSheet(draft.id)} title="刪除此樣式表">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div style={fieldRowStyle}>
                <label style={labelStyle}>名稱</label>
                <input
                  style={inputStyle}
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                />
              </div>

              <div style={fieldRowStyle}>
                <label style={labelStyle}>CSS 內容</label>
                <textarea
                  spellCheck={false}
                  style={{
                    ...inputStyle,
                    minHeight: 360,
                    resize: "vertical",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: "pre",
                    overflowWrap: "normal",
                  }}
                  value={draft.css}
                  onChange={(e) => updateDraft({ css: e.target.value })}
                  placeholder="在此貼上 CSS…"
                />
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  style={ghostBtnStyle}
                  onClick={() => navigator.clipboard?.readText().then(
                    (t) => updateDraft({ css: t }),
                    () => {}
                  )}
                >
                  從剪貼簿貼上
                </button>
                <span style={{ fontSize: 12, color: "#777" }}>
                  {dirty ? "有未儲存變更，按「儲存」寫入。" : "已儲存。"}
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}