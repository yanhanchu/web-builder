import { useMemo, useState } from "react";
import { Trash2, ChevronDown, Plus, X, Search } from "lucide-react";
import { panelTitleStyle, labelStyle, fieldRowStyle, inputStyle, usePersistentState } from "../admin-ui";
import { allComponents, allComponentTypes } from "@workspace/ui/lib/generator/component-registry";
import type { ComponentDoc } from "@workspace/ui/types/generator/component-types";
import {
  InMemoryDataStore,
  typeRegistry,
  type DataSource,
} from "@workspace/ui/lib/data-model";
import type { PageBlock, SlotValue } from "@/lib/pages-store";
import { isSlotValue, makeSlotValue, makeBlockId } from "@/lib/pages-store";
import { typeBadgeStyle, iconBtnStyle } from "./shared";
import { groupComponents } from "./component-grouping";

// 右側「組件屬性」：對應畫布中目前被選取的單一組件實例。
//
// 這個面板編輯的一律是「這個頁面、這個組件實例」的 props 覆寫（block.props，
// 存在頁面內容資料 PageItem.blocks 裡），透過 onUpdateProp 寫回 —— 不會、也不需要
// 修改組件定義本身（allComponents / allComponentTypes，build time 產生的靜態資料）
// 或資料來源（wb.dataSources，「資料管理」頁面維護的 DataSource 清單）。
// 下方讀取 allComponents / allComponentTypes / dataSources 都只是「唯讀查找」，
// 用來決定要渲染哪一種欄位控制項、以及下拉選單有哪些候選項目，
// 選擇的結果一律透過 onUpdateProp 寫進當前組件實例的 props。

/** 依 prop 型別字串分類出的欄位種類，決定要渲染哪一種輸入控制項。 */
type FieldKind =
  | { kind: "reactNode" }
  | { kind: "boolean" }
  | { kind: "number" }
  | { kind: "enum"; options: string[] }
  | { kind: "complex"; typeId: string; isArray: boolean }
  | { kind: "string" };

const REACT_NODE_TYPES = new Set(["ReactNode", "React.ReactNode", "JSX.Element", "React.JSX.Element"]);

/** 把 `'"a" | "b" | "c"'` 這種 union literal 字串解析成選項陣列；不是這種形狀就回傳 null。 */
function parseUnionLiterals(typeStr: string): string[] | null {
  const trimmed = typeStr.trim();
  if (!trimmed.includes("|")) return null;
  const branches = trimmed
    .split("|")
    .map((b) => b.trim())
    // 多行宣告的 union（例如 FlexJustify 因為換行折成 "| \"start\" | ..."）
    // 開頭會多出一個空字串分支，屬於格式雜訊而非真正的型別分支，過濾掉即可，
    // 不影響其餘分支的字面量判斷。
    .filter((b) => b.length > 0);
  const literals: string[] = [];
  for (const b of branches) {
    const m = b.match(/^"([^"]*)"$/) ?? b.match(/^'([^']*)'$/);
    if (!m) return null; // 只要有一個分支不是字串字面量，就不當作限定選項的 enum
    literals.push(m[1]);
  }
  return literals.length > 0 ? literals : null;
}

/** 依 componentId 找出對應 ComponentDoc，再依 relatedTypeNames 把裸型別名稱解析成複合 id。 */
function resolveTypeId(componentId: string, bareTypeName: string): string | null {
  const component = allComponents.find((c) => c.id === componentId);
  const related = component?.relatedTypeNames ?? [];
  const match = related.find((id) => id === bareTypeName || id.endsWith("#" + bareTypeName));
  return match ?? null;
}

/**
 * 依 prop 的型別字串（可能是裸型別名稱、聯集字面量、陣列、或 ReactNode）分類，
 * 決定屬性面板該渲染哪一種控制項。componentId 用來在型別名稱是具名別名
 * （例如 "FlexAlign"）時，透過 relatedTypeNames 反查它在 allComponentTypes
 * 裡的完整定義（union 字面量 / object 欄位），藉此判斷是 enum 還是複雜物件型別。
 */
function classifyField(propType: string, componentId: string): FieldKind {
  const trimmed = propType.trim();

  if (REACT_NODE_TYPES.has(trimmed)) return { kind: "reactNode" };
  if (trimmed === "boolean") return { kind: "boolean" };
  if (trimmed === "number") return { kind: "number" };
  if (trimmed === "string") return { kind: "string" };

  // 內嵌的 union literal，例如 '"sm" | "md" | "lg"'
  const inlineUnion = parseUnionLiterals(trimmed);
  if (inlineUnion) return { kind: "enum", options: inlineUnion };

  // 陣列型別："NavItem[]" / "string[]"
  if (trimmed.endsWith("[]")) {
    const itemType = trimmed.slice(0, -2).trim();
    if (itemType === "string" || itemType === "number" || itemType === "boolean") {
      // 基本型別陣列，暫時當一般字串輸入（逗號分隔），不算複雜型別。
      return { kind: "string" };
    }
    const typeId = resolveTypeId(componentId, itemType);
    if (typeId) return { kind: "complex", typeId, isArray: true };
    return { kind: "string" };
  }

  // 內嵌匿名 object，例如 "{ lead: string; accent: string; }" —— 沒有可查找的具名型別 id，
  // 交給 typed data 篩選時退化不到特定型別，用純文字（JSON）輸入兜底。
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return { kind: "string" };
  }

  // 具名型別參照，可能是 union 別名（FlexAlign）或 object 型別（BrandData / HeaderProps）
  const typeId = resolveTypeId(componentId, trimmed);
  if (typeId) {
    const typeDoc = allComponentTypes.find((t) => t.id === typeId);
    if (typeDoc?.aliasOf) {
      const aliasUnion = parseUnionLiterals(typeDoc.aliasOf);
      if (aliasUnion) return { kind: "enum", options: aliasUnion };
    }
    return { kind: "complex", typeId, isArray: false };
  }

  // 無法辨識，預設當純字串處理
  return { kind: "string" };
}

export function ComponentPropertiesPanel({
  block,
  onUpdateProp,
  onRemove,
}: {
  block: PageBlock;
  onUpdateProp: (key: string, value: unknown) => void;
  onRemove: () => void;
}) {
  const component = allComponents.find((c) => c.id === block.componentId);

  // 唯讀取用「資料管理」頁面維護的 DataSource 清單（key 與 data-manager.tsx 完全一致），
  // 只用來給複雜型別 prop 篩選對應的 typedData 候選項目；這裡不呼叫對應的 setter，
  // 因此永遠不會、也無法從這個面板寫回 wb.dataSources。
  const [dataSources] = usePersistentState<Record<string, DataSource>>("wb.dataSources", {});
  const store = useMemo(() => new InMemoryDataStore(dataSources, typeRegistry), [dataSources]);

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
        }}
      >
        <h2 style={{ ...panelTitleStyle, margin: 0 }}>組件屬性</h2>
        <button style={{ ...iconBtnStyle, color: "#e75454" }} onClick={onRemove} title="從此頁移除此組件">
          <Trash2 size={14} />
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <span style={typeBadgeStyle} title={block.componentId}>
          {block.componentName}
        </span>
      </div>

      {!component ? (
        <p style={{ color: "#e77", fontSize: 12 }}>
          找不到此組件定義（{block.componentId}），可能已移除。
        </p>
      ) : component.props.length === 0 ? (
        <p style={{ color: "#777", fontSize: 13 }}>此組件無可設定 props。</p>
      ) : (
        component.props.map((prop) => {
          const fieldKind = classifyField(prop.type, component.id);
          return (
            <div key={prop.name} style={fieldRowStyle}>
              <label
                style={{
                  ...labelStyle,
                  display: "flex",
                  gap: 6,
                  alignItems: "baseline",
                }}
              >
                <span>{prop.name}</span>
                <span style={{ color: "#555", fontFamily: "monospace", fontSize: 10 }}>{prop.type}</span>
                {prop.required && <span style={{ color: "#e77", fontSize: 10 }}>必填</span>}
              </label>

              <PropFieldControl
                fieldKind={fieldKind}
                value={block.props[prop.name]}
                defaultValue={prop.defaultValue}
                store={store}
                onChange={(value) => onUpdateProp(prop.name, value)}
              />

              {prop.description && (
                <p style={{ fontSize: 11, color: "#888", margin: "4px 0 0" }}>{prop.description}</p>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}

/** 依 FieldKind 分派到對應的輸入控制項；所有變更一律透過 onChange 往上交給 onUpdateProp。 */
function PropFieldControl({
  fieldKind,
  value,
  defaultValue,
  store,
  onChange,
}: {
  fieldKind: FieldKind;
  value: unknown;
  defaultValue: string | null;
  store: InMemoryDataStore;
  onChange: (value: unknown) => void;
}) {
  switch (fieldKind.kind) {
    case "boolean":
      return <BooleanField value={value} onChange={onChange} />;
    case "number":
      return <NumberField value={value} defaultValue={defaultValue} onChange={onChange} />;
    case "enum":
      return <EnumField options={fieldKind.options} value={value} defaultValue={defaultValue} onChange={onChange} />;
    case "reactNode":
      return <ReactNodeField value={value} onChange={onChange} />;
    case "complex":
      return (
        <ComplexField
          typeId={fieldKind.typeId}
          isArray={fieldKind.isArray}
          value={value}
          store={store}
          onChange={onChange}
        />
      );
    case "string":
    default:
      return <StringField value={value} defaultValue={defaultValue} onChange={onChange} />;
  }
}

/** string => 預設的單行文字輸入。 */
function StringField({
  value,
  defaultValue,
  onChange,
}: {
  value: unknown;
  defaultValue: string | null;
  onChange: (value: unknown) => void;
}) {
  return (
    <input
      style={inputStyle}
      value={String(value ?? "")}
      placeholder={defaultValue != null ? `預設: ${defaultValue}` : "未設定"}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** number => number input。 */
function NumberField({
  value,
  defaultValue,
  onChange,
}: {
  value: unknown;
  defaultValue: string | null;
  onChange: (value: unknown) => void;
}) {
  return (
    <input
      type="number"
      style={inputStyle}
      value={typeof value === "number" ? value : ""}
      placeholder={defaultValue != null ? `預設: ${defaultValue}` : "未設定"}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? undefined : Number(raw));
      }}
    />
  );
}

/** boolean => switch button（沿用面板既有的深色配色，不依賴外部元件庫）。 */
function BooleanField({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const checked = Boolean(value);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        border: "1px solid " + (checked ? "#2d9c74" : "#444"),
        background: checked ? "#1f5c45" : "#0d0d0d",
        position: "relative",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
      title={checked ? "true" : "false"}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: checked ? "#7fdbca" : "#666",
          transition: "left 0.12s ease",
        }}
      />
    </button>
  );
}

/** 有限定輸入的型別（union literal，如 "a"|"b"|"c"）=> 下拉選單。 */
function EnumField({
  options,
  value,
  defaultValue,
  onChange,
}: {
  options: string[];
  value: unknown;
  defaultValue: string | null;
  onChange: (value: unknown) => void;
}) {
  const currentValue = typeof value === "string" && options.includes(value) ? value : "";
  return (
    <select
      style={inputStyle}
      value={currentValue}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    >
      <option value="">{defaultValue != null ? `（預設: ${defaultValue}）` : "（未設定）"}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

/**
 * reactNode => 組件可篩選下拉選單（可以有多個）。
 * 值以 SlotValue（{ __slot: true, blocks: PageBlock[] }）存在 block.props 裡，
 * 跟「組件樹狀結構」面板讀取 slot 的方式一致。新增的每個組件實例都是全新的
 * PageBlock（props 空物件，走組件自身預設值），只會寫進目前這個實例的 props，
 * 不會動到 allComponents 的組件定義本身。
 */
function ReactNodeField({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const slot: SlotValue = isSlotValue(value) ? value : makeSlotValue([]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = !q
      ? allComponents
      : allComponents.filter(
          (c) => c.componentName.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
        );
    return groupComponents(source);
  }, [query]);

  const addComponent = (c: ComponentDoc) => {
    const newBlock: PageBlock = {
      instanceId: makeBlockId(),
      componentId: c.id,
      componentName: c.componentName,
      props: {},
    };
    onChange(makeSlotValue([...slot.blocks, newBlock]));
    setPickerOpen(false);
    setQuery("");
  };

  const removeAt = (index: number) => {
    const next = slot.blocks.filter((_, i) => i !== index);
    onChange(makeSlotValue(next));
  };

  return (
    <div>
      {slot.blocks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
          {slot.blocks.map((b, i) => (
            <div
              key={b.instanceId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
                border: "1px solid #333",
                borderRadius: 4,
                padding: "4px 8px",
                background: "#0d0d0d",
              }}
            >
              <span style={{ fontSize: 12, color: "#ccc" }}>{b.componentName}</span>
              <button
                style={{ ...iconBtnStyle, color: "#e77" }}
                onClick={() => removeAt(i)}
                title="從此插槽移除"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <button
          type="button"
          style={{ ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          onClick={() => setPickerOpen((v) => !v)}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#999" }}>
            <Plus size={12} />
            加入組件…
          </span>
          <ChevronDown size={12} style={{ color: "#777" }} />
        </button>

        {pickerOpen && (
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
              maxHeight: 260,
              overflowY: "auto",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ position: "relative", marginBottom: 6 }}>
              <Search size={12} style={{ position: "absolute", left: 8, top: 8, color: "#777" }} />
              <input
                autoFocus
                style={{ ...inputStyle, paddingLeft: 26, fontSize: 12 }}
                placeholder="篩選組件名稱或描述…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {filteredGroups.length === 0 ? (
              <p style={{ fontSize: 12, color: "#777", margin: 4 }}>找不到符合的組件。</p>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.label} style={{ marginBottom: 4 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#999",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      fontFamily: "monospace",
                      padding: "6px 6px 2px",
                    }}
                  >
                    {group.label}
                  </div>
                  {group.components.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => addComponent(c)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        color: "#ccc",
                        fontSize: 12,
                        padding: "6px 6px",
                        cursor: "pointer",
                        borderRadius: 4,
                      }}
                      title={c.description}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#222")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {c.componentName}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 複雜型別 => typed data 篩選出對應型別的可篩選下拉選單。
 * 候選清單來自「資料管理」頁面維護的 typedData 來源（唯讀），依 typeId /
 * 陣列慣例（"<typeId>[]"）篩出符合此 prop 型別的資料。選擇結果只是把
 * { __bound: true, sourceId } 這樣的引用寫進目前組件實例的 props，
 * 並不會複製或修改資料來源本身的內容。
 */
function ComplexField({
  typeId,
  isArray,
  value,
  store,
  onChange,
}: {
  typeId: string;
  isArray: boolean;
  value: unknown;
  store: InMemoryDataStore;
  onChange: (value: unknown) => void;
}) {
  const wantedTypeId = isArray ? `${typeId}[]` : typeId;
  const [query, setQuery] = useState("");

  const candidates = useMemo(() => {
    return store
      .listSourcesByKind("typedData")
      .filter((s) => s.kind === "typedData" && s.typeId === wantedTypeId);
  }, [store, wantedTypeId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((s) => (s.label ?? s.id).toLowerCase().includes(q));
  }, [candidates, query]);

  const boundSourceId =
    typeof value === "object" && value !== null && (value as { __bound?: unknown }).__bound === true
      ? (value as { sourceId?: string }).sourceId ?? ""
      : "";

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 4 }}>
        <Search size={12} style={{ position: "absolute", left: 8, top: 9, color: "#777" }} />
        <input
          style={{ ...inputStyle, paddingLeft: 26, fontSize: 12 }}
          placeholder="篩選型別資料…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <select
        style={inputStyle}
        value={boundSourceId}
        onChange={(e) => {
          const sourceId = e.target.value;
          onChange(sourceId === "" ? undefined : { __bound: true, sourceId });
        }}
      >
        <option value="">（未綁定，共 {filtered.length} 筆符合「{typeId}」的型別資料）</option>
        {filtered.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label ?? s.id}
          </option>
        ))}
      </select>
      {candidates.length === 0 && (
        <p style={{ fontSize: 11, color: "#8a8a8a", margin: "4px 0 0" }}>
          「資料管理」頁面中尚無符合此型別（{typeId}）的資料，可先到那裡新增。
        </p>
      )}
    </div>
  );
}