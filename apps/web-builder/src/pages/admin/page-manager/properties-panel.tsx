import { useEffect, useRef, useState } from "react";
import { Save, Trash2, Undo2, ChevronUp, ChevronDown, X } from "lucide-react";
import {
  panelTitleStyle,
  labelStyle,
  fieldRowStyle,
  inputStyle,
  textareaStyle,
  primaryBtnStyle,
  ghostBtnStyle,
  usePersistentState,
} from "../admin-ui";
import type { SeoData } from "@workspace/ui/lib/data-model";
import { SeoDataTypeId } from "@workspace/ui/lib/data-model/sample-data";
import type { PageItem } from "@/lib/pages-store";
import { SEO_KEY_PREFIX, typeBadgeStyle, iconBtnStyle } from "./shared";
import { STYLE_SHEETS_KEY, INITIAL_SHEETS, type StyleSheet } from "../style-manager";

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
            <h3 style={{ fontSize: 13, color: "#ccc", margin: "0 0 12px" }}>套用樣式表</h3>
            <StyleSheetPicker
              selectedIds={draft.styleSheetIds ?? []}
              onChange={(styleSheetIds) => onUpdateDraft({ styleSheetIds })}
            />
          </div>

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

/**
 * 頁面屬性面板的「套用樣式表」區塊：讀取「樣式管理」頁面維護的樣式表清單
 * （wb.styleSheets，唯讀，這裡不會新增/編輯/刪除樣式表本體，只選擇要套用
 * 哪幾份、以及套用順序），選取結果就是 PageItem.styleSheetIds，只存 id
 * 引用陣列、依陣列順序即套用順序（後面的覆蓋前面同名 CSS 規則），不複製
 * 樣式表內容本身——與 pages-store.ts 對這個欄位的既有註解設計一致。
 *
 * 呈現方式採「下拉觸發 + 浮動面板」的多選選單（樣式比照 component-
 * properties-panel.tsx 的 ReactNodeField「加入組件…」下拉，同一套視覺
 * 語言），而不是把整批已選清單常駐展開在面板裡——樣式表一多，逐列展開會
 * 佔掉右側面板大半空間，收合成一顆按鈕比較節省版面，點開才看到完整清單。
 * 收合狀態的觸發按鈕本身會顯示已選數量與名稱摘要，不用展開也能一眼確認
 * 目前套用了哪些。
 *
 * 浮動面板內仍保留每列的上移/下移／移除，勾選未選取的樣式表則加到清單
 * 最後方——順序調整、移除、加入都收在同一個下拉面板裡完成，不需要在
 * 面板外再另外呈現一份「可加入」清單。
 *
 * 沒有任何樣式表可選（使用者還沒去「樣式管理」建立過任何一份）時觸發
 * 按鈕直接顯示提示文字並停用，不用點開才知道沒東西可選。
 */
function StyleSheetPicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [sheets] = usePersistentState<StyleSheet[]>(STYLE_SHEETS_KEY, INITIAL_SHEETS);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 點下拉面板以外的地方自動收合，避免使用者點了畫面別處，選單還一直
  // 浮在上面。用 mousedown（而非 click）搭配 capture 前的最基本判斷即可，
  // 這裡不需要額外處理拖曳選取文字誤觸關閉之類的邊界情況。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const sheetById = new Map(sheets.map((s) => [s.id, s]));
  // 已套用的樣式表可能引用到已被「樣式管理」刪除的 id（該份樣式表後來被刪
  // 除了），這裡照樣列出、只是找不到名稱時退回顯示提示文字，不靜默丟棄，
  // 避免使用者存檔時被悄悄清空一筆設定卻毫無感知。
  const selectedSheets = selectedIds.map((id) => ({ id, name: sheetById.get(id)?.name ?? null }));

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((existing) => existing !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const summary =
    selectedSheets.length === 0
      ? "未套用樣式表"
      : `已套用 ${selectedSheets.length} 份：${selectedSheets.map((s) => s.name ?? "（已刪除）").join("、")}`;

  if (sheets.length === 0) {
    return (
      <button type="button" disabled style={{ ...inputStyle, color: "#666", cursor: "not-allowed", textAlign: "left" }}>
        尚未建立任何樣式表，請先到「樣式管理」頁面新增
      </button>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        style={{ ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", gap: 8 }}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          style={{
            color: selectedSheets.length === 0 ? "#999" : "#ccc",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {summary}
        </span>
        <ChevronDown size={12} style={{ color: "#777", flexShrink: 0 }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            background: "#171717",
            border: "1px solid #333",
            borderRadius: 6,
            padding: 8,
            maxHeight: 300,
            overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {selectedSheets.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: "#777", padding: "2px 6px 4px" }}>
                已套用（依序疊加，下方覆蓋上方同名規則）
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                {selectedSheets.map((sheet, index) => (
                  <div
                    key={sheet.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      color: "#ccc",
                      padding: "4px 6px",
                      borderRadius: 4,
                      background: "#1c2b23",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <button
                        style={{ ...iconBtnStyle, padding: 0, opacity: index === 0 ? 0.3 : 1 }}
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        title="上移"
                      >
                        <ChevronUp size={11} />
                      </button>
                      <button
                        style={{ ...iconBtnStyle, padding: 0, opacity: index === selectedSheets.length - 1 ? 0.3 : 1 }}
                        onClick={() => move(index, 1)}
                        disabled={index === selectedSheets.length - 1}
                        title="下移"
                      >
                        <ChevronDown size={11} />
                      </button>
                    </div>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sheet.name ?? <em style={{ color: "#e77" }}>（找不到此樣式表，可能已被刪除）</em>}
                    </span>
                    <button style={{ ...iconBtnStyle, color: "#e77" }} onClick={() => toggle(sheet.id)} title="移除套用">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ fontSize: 10, color: "#777", padding: "2px 6px 4px" }}>全部樣式表</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {sheets.map((sheet) => {
              const checked = selectedIds.includes(sheet.id);
              return (
                <label
                  key={sheet.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: checked ? "#8fe" : "#ccc",
                    cursor: "pointer",
                    padding: "5px 6px",
                    borderRadius: 4,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#222")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(sheet.id)} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sheet.name}
                  </span>
                  <code style={{ fontSize: 10, color: "#666" }}>{sheet.id}</code>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
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