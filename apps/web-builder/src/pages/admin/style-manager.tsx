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
  primaryBtnStyle,
  ghostBtnStyle,
  dangerBtnStyle,
  savedFlashStyle,
} from "./admin-ui";

// 樣式管理：先只提供一個「貼上樣式表並儲存」的地方。
// 支援多份樣式表（各有名稱與內容），儲存到 localStorage。
interface StyleSheet {
  id: string;
  name: string;
  css: string;
}

const INITIAL_SHEETS: StyleSheet[] = [
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
    "wb.styleSheets",
    INITIAL_SHEETS
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    INITIAL_SHEETS[0]?.id ?? null
  );
  const [saved, flashSaved] = useSavedFlash();

  const selected = sheets.find((s) => s.id === selectedId) ?? null;

  const addSheet = () => {
    const id = makeId();
    setSheets([...sheets, { id, name: "新樣式表", css: "" }]);
    setSelectedId(id);
  };

  const deleteSheet = (id: string) => {
    const next = sheets.filter((s) => s.id !== id);
    setSheets(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const updateSelected = (patch: Partial<StyleSheet>) => {
    if (!selected) return;
    setSheets(sheets.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)));
    flashSaved();
  };

  return (
    <AdminLayout
      title="樣式管理"
      description="貼上並儲存自訂 CSS 樣式表。可建立多份，內容會自動儲存。之後可套用到網站頁面。"
      actions={
        <>
          {saved && <span style={savedFlashStyle}>已儲存 ✓</span>}
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
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
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
          {!selected ? (
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
                <h2 style={{ ...panelTitleStyle, margin: 0 }}>編輯樣式表</h2>
                <button style={dangerBtnStyle} onClick={() => deleteSheet(selected.id)} title="刪除">
                  <Trash2 size={14} />
                </button>
              </div>

              <div style={fieldRowStyle}>
                <label style={labelStyle}>名稱</label>
                <input
                  style={inputStyle}
                  value={selected.name}
                  onChange={(e) => updateSelected({ name: e.target.value })}
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
                  value={selected.css}
                  onChange={(e) => updateSelected({ css: e.target.value })}
                  placeholder="在此貼上 CSS…"
                />
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  style={ghostBtnStyle}
                  onClick={() => navigator.clipboard?.readText().then(
                    (t) => updateSelected({ css: t }),
                    () => {}
                  )}
                >
                  從剪貼簿貼上
                </button>
                <span style={{ fontSize: 12, color: "#777" }}>
                  編輯即自動儲存到瀏覽器。
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
