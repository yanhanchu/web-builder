import { useCallback, useMemo, useRef, useState } from "react";
import { Trash2, ChevronDown, Plus, X, Search, Type as TypeIcon, Blocks } from "lucide-react";
import { panelTitleStyle, labelStyle, fieldRowStyle, inputStyle, usePersistentState } from "../admin-ui";
import { allComponents, allComponentTypes } from "@workspace/ui/lib/generator/component-registry";
import type { ComponentDoc } from "@workspace/ui/types/generator/component-types";
import {
  InMemoryDataStore,
  typeRegistry,
  componentPropsRegistry,
  FieldEditor,
  createDefaultValueNode,
  permissiveBindingPolicy,
  type DataSource,
  type FieldType,
  type ValueNode,
  type BindingPolicy,
} from "@workspace/ui/lib/data-model";
import type { PageBlock, SlotValue, ClientDirective } from "@/lib/pages-store";
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
//
// 面板本身寬度可由使用者在左邊界拖動調整（做法比照 components-panel.tsx 的
// 「現有組件」面板，預設 320px，可在 MIN/MAX 之間拖動；因為這個面板在畫面
// 右側，拖拉手把放在左邊界，往左拖動時寬度增加，方向與左側面板相反但邏輯
// 對稱）。寬度只存在 component state，不持久化，跟左側面板行為一致。

const PANEL_DEFAULT_WIDTH = 320;
const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 640;

/**
 * 右側面板共用的「左邊界拖拉調整寬度」hook：往左拖動（clientX 變小）寬度增加。
 * export 出去給 properties-panel.tsx（頁面屬性面板）共用，兩個右側面板
 * 用同一套拖拉邏輯，行為一致，不用各自複製一份。
 */
export function useLeftEdgeResizable(defaultWidth: number, minWidth: number, maxWidth: number) {
  const [width, setWidth] = useState(defaultWidth);
  const draggingRef = useRef(false);

  const onDragHandleDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startX = e.clientX;
      const startWidth = width;

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        // 面板在右側，往左拖（clientX 變小）要增加寬度，方向跟右側面板（往右拖增加）相反。
        const next = startWidth + (startX - ev.clientX);
        setWidth(Math.min(maxWidth, Math.max(minWidth, next)));
      };
      const onUp = () => {
        draggingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [width]
  );

  return { width, onDragHandleDown };
}

/**
 * 依 prop 型別字串分類出的欄位種類，決定要渲染哪一種輸入控制項。
 *
 * "bindable" 涵蓋兩種情況，判斷邏輯是同一套（見 classifyField 最後的 catch-all）：
 *   1. string / number / boolean 這類一般值 —— 除了直接輸入純值，還能綁定
 *      「資料管理」頁面維護的 i18n / 路由 / 檔案來源。
 *   2. recursive 的巢狀型別（陣列 / 內嵌匿名 object，例如 hero.tsx 的
 *      primaryCta: { label; to } 或 defaultNavs: { label; to }[]）—— 這種
 *      型別沒有具名 id 可以整包綁 typedData（見下方 "complex"），但底層
 *      FieldType（object/array）本身就是遞迴定義，FieldEditor 也早就支援
 *      遞迴渲染巢狀 object/array（見 field-editor.tsx 的 ObjectFields /
 *      ArrayItems），只要餵給它正確的 FieldType 就能逐層展開、逐一 leaf
 *      欄位個別綁定，不需要為 hero.tsx 這類組件另外刻 UI，也不需要把這些
 *      巢狀值硬塞進 typedData 當成具名資料來源（那是給「使用者想整包複用」
 *      的具名型別準備的，跟這裡「組件實例內建的巢狀結構」是不同情境）。
 *
 * fieldType 一律來自 componentPropsRegistry（packages/ui/src/lib/data-model/
 * from-generated.ts 由生成資料轉出的定義，跟「型別資料管理」用的是同一份），
 * 因此 array/object 這兩種 kind 一樣是遞迴結構，不需要另外處理。
 */
type FieldKind =
  | { kind: "reactNode" }
  | { kind: "boolean" }
  | { kind: "number" }
  | { kind: "enum"; options: string[] }
  | { kind: "complex"; typeId: string; isArray: boolean }
  | { kind: "bindable"; fieldType: FieldType }
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
 * 從 componentPropsRegistry（packages/ui/src/lib/data-model/from-generated.ts
 * 由生成資料轉出的 FieldType 對照表，跟「型別資料管理」的 typed-data-fields.tsx
 * 用的是同一份）反查某個 prop 對應的 FieldType，供一般值欄位交給 FieldEditor
 * 判斷可綁定哪些種類的資料來源。找不到就回傳 null，呼叫端會退回純字串輸入。
 */
function lookupPropFieldType(componentId: string, propName: string): FieldType | null {
  const entry = componentPropsRegistry[componentId];
  if (!entry) return null;
  return entry.propsType.kind === "object" ? entry.propsType.fields[propName] ?? null : null;
}

/**
 * 依 prop 的型別字串（可能是裸型別名稱、聯集字面量、陣列、內嵌匿名 object、
 * 或 ReactNode）分類，決定屬性面板該渲染哪一種控制項。componentId 用來在
 * 型別名稱是具名別名（例如 "FlexAlign"）時，透過 relatedTypeNames 反查它在
 * allComponentTypes 裡的完整定義（union 字面量 / object 欄位），藉此判斷是
 * enum 還是「具名」複雜物件型別（走 typedData 整包綁定，見 "complex"）。
 * propName 則用來查 componentPropsRegistry，取得這個 prop 對應的 FieldType。
 *
 * 判斷順序：
 *   1. ReactNode → 插槽
 *   2. 內嵌 union literal（'"a"|"b"'）→ enum 下拉選單
 *   3. 陣列型別（"T[]"）先檢查 item 是不是「具名型別」：
 *      - item 是具名型別（NavItem[] / ThemeOption[] / Section[] …）→ 沿用
 *        原本的 complex + isArray: true，這種「一組具名資料」的情境使用者
 *        原本就能整包換成「資料管理」裡別的同型別 typedData，保留這個彈性。
 *      - item 不是具名型別（string[] / number[] / boolean[] / 內嵌匿名
 *        object 的陣列，例如 defaultNavs: { label; to }[]）→ falls through
 *        到第 5 步的 "bindable"，交給 FieldEditor 遞迴渲染陣列 + 巢狀欄位。
 *   4. 非陣列的具名型別參照（BrandData / FlexAlign / HeaderProps…）→
 *      沿用原本邏輯，union 別名走 enum，object 型別走 complex。
 *   5. 其餘所有查得到 FieldType 的 prop（primitive、上面 falls through 下來
 *      的陣列、內嵌匿名 object）一律歸類為 "bindable"，交給 FieldEditor
 *      依 FieldType 遞迴渲染 —— FieldType 的 object/array 本身就是遞迴定義，
 *      ObjectFields/ArrayItems 也已經支援任意深度巢狀。
 *   6. 查不到 FieldType（理論上不會發生，componentPropsRegistry 用同一份
 *      生成資料轉換）才退回原本簡單控制項，行為跟修改前一致，不會卡住。
 */
function classifyField(propType: string, componentId: string, propName: string): FieldKind {
  const trimmed = propType.trim();

  if (REACT_NODE_TYPES.has(trimmed)) return { kind: "reactNode" };

  // 內嵌的 union literal，例如 '"sm" | "md" | "lg"'（直接寫在 prop 型別上，
  // 不是具名別名）—— 這種形狀優先判斷，避免被底下的具名型別分支誤判。
  const inlineUnion = parseUnionLiterals(trimmed);
  if (inlineUnion) return { kind: "enum", options: inlineUnion };

  // 陣列型別："NavItem[]" / "string[]" / "{ label; to }[]"。
  // item 是具名型別（查得到 relatedTypeNames）才走 complex + isArray；
  // 其餘（primitive / 內嵌匿名 object）falls through 到底下的 bindable。
  if (trimmed.endsWith("[]")) {
    const itemType = trimmed.slice(0, -2).trim();
    const itemTypeId = resolveTypeId(componentId, itemType);
    if (itemTypeId) {
      return { kind: "complex", typeId: itemTypeId, isArray: true };
    }
  } else if (!trimmed.startsWith("{") && trimmed !== "boolean" && trimmed !== "number" && trimmed !== "string") {
    // 非陣列的具名型別參照，可能是 union 別名（FlexAlign）或 object 型別
    // （BrandData / HeaderProps）。只有「裸型別名稱」才會走到這裡，
    // primitive / 陣列 / 內嵌 object 字面量都已經在上面處理過或明確排除。
    const typeId = resolveTypeId(componentId, trimmed);
    if (typeId) {
      const typeDoc = allComponentTypes.find((t) => t.id === typeId);
      if (typeDoc?.aliasOf) {
        const aliasUnion = parseUnionLiterals(typeDoc.aliasOf);
        if (aliasUnion) return { kind: "enum", options: aliasUnion };
      }
      return { kind: "complex", typeId, isArray: false };
    }
  }

  // 其餘情況（primitive、item 非具名型別的陣列、內嵌匿名 object）：查得到
  // FieldType 就一律走 "bindable"，交給 FieldEditor 依型別遞迴渲染 ——
  // 這一個分支同時涵蓋：
  //   - string/number/boolean：純值輸入 + 綁定 i18n/路由/檔案
  //   - string[]/number[]/boolean[]：陣列，每個 item 是可綁定的 primitive 欄位
  //   - { lead; accent }：內嵌匿名 object，逐欄位展開
  //   - { label; to }[]（defaultNavs）：陣列 + 巢狀 object 的組合，一樣遞迴展開
  const fieldType = lookupPropFieldType(componentId, propName);
  if (fieldType) {
    return { kind: "bindable", fieldType };
  }

  // 查不到對應 FieldType 時的保底行為，維持修改前的簡單控制項。
  if (trimmed === "boolean") return { kind: "boolean" };
  if (trimmed === "number") return { kind: "number" };
  return { kind: "string" };
}

export function ComponentPropertiesPanel({
  block,
  onUpdateProp,
  onUpdateClientDirective,
  onRemove,
}: {
  block: PageBlock;
  onUpdateProp: (key: string, value: unknown) => void;
  onUpdateClientDirective: (directive: ClientDirective | undefined) => void;
  onRemove: () => void;
}) {
  const component = allComponents.find((c) => c.id === block.componentId);

  // 唯讀取用「資料管理」頁面維護的 DataSource 清單（key 與 data-manager.tsx 完全一致），
  // 只用來給複雜型別 prop 篩選對應的 typedData 候選項目；這裡不呼叫對應的 setter，
  // 因此永遠不會、也無法從這個面板寫回 wb.dataSources。
  const [dataSources] = usePersistentState<Record<string, DataSource>>("wb.dataSources", {});
  const store = useMemo(() => new InMemoryDataStore(dataSources, typeRegistry), [dataSources]);

  const { width, onDragHandleDown } = useLeftEdgeResizable(
    PANEL_DEFAULT_WIDTH,
    PANEL_MIN_WIDTH,
    PANEL_MAX_WIDTH
  );

  return (
    <section
      style={{
        width,
        minWidth: PANEL_MIN_WIDTH,
        maxWidth: PANEL_MAX_WIDTH,
        flexShrink: 0,
        position: "relative",
        borderLeft: "1px solid #2a2a2a",
        background: "#171717",
        overflowY: "auto",
        padding: 14,
        boxSizing: "border-box",
      }}
    >
      {/* 左邊界拖拉手把：不佔版位（絕對定位疊在邊界上），拖曳調整面板寬度。
          做法比照 components-panel.tsx 的右邊界手把，這裡因為面板在畫面
          右側，手把貼在左邊界上。 */}
      <div
        onMouseDown={onDragHandleDown}
        title="拖動調整面板寬度"
        style={{
          position: "absolute",
          top: 0,
          left: -3,
          width: 6,
          height: "100%",
          cursor: "col-resize",
          zIndex: 10,
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          gap: 6,
        }}
      >
        <h2 style={{ ...panelTitleStyle, margin: 0 }}>組件屬性</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <select
            value={block.clientDirective ?? ""}
            onChange={(e) =>
              onUpdateClientDirective(e.target.value === "" ? undefined : (e.target.value as ClientDirective))
            }
            title="Astro client directive（此組件實例在 Astro 產出時的 hydration 策略；不選則維持純靜態渲染，不會寫入組件 props，只影響 Astro codegen）"
            style={{
              background: "#0d0d0d",
              color: "#eee",
              border: "1px solid #333",
              borderRadius: 4,
              padding: "4px 6px",
              fontSize: 11,
              fontFamily: "monospace",
              boxSizing: "border-box",
            }}
          >
            <option value="">client:（無）</option>
            <option value="only">client:only</option>
            <option value="visible">client:visible</option>
            <option value="idle">client:idle</option>
            <option value="load">client:load</option>
            <option value="media">client:media</option>
          </select>
          <button style={{ ...iconBtnStyle, color: "#e75454" }} onClick={onRemove} title="從此頁移除此組件">
            <Trash2 size={14} />
          </button>
        </div>
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
          const fieldKind = classifyField(prop.type, component.id, prop.name);
          return (
            <div key={prop.name} style={fieldRowStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 6,
                }}
              >
                <label style={{ ...labelStyle, display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span>{prop.name}</span>
                  {prop.required && <span style={{ color: "#e77", fontSize: 10 }}>必填</span>}
                </label>
                <span
                  style={{
                    color: "#555",
                    fontFamily: "monospace",
                    fontSize: 10,
                    whiteSpace: "nowrap",
                    textAlign: "right",
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                  title={prop.type}
                >
                  {prop.type}
                </span>
              </div>

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
      return <ReactNodeField value={value} store={store} onChange={onChange} />;
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
    case "bindable":
      return (
        <BindableField
          fieldType={fieldKind.fieldType}
          value={value}
          defaultValue={defaultValue}
          store={store}
          onChange={onChange}
        />
      );
    case "string":
    default:
      return <StringField value={value} defaultValue={defaultValue} onChange={onChange} />;
  }
}

/** 判斷是否為舊版 ComplexField 寫回的綁定引用格式 { __bound: true, sourceId }，這種形狀不該被 toValueNode 當成裸物件遞迴拆解。 */
function isLegacyComplexBinding(value: unknown): value is { __bound: true; sourceId?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __bound?: unknown }).__bound === true
  );
}

/**
 * 把 block.props[prop.name] 目前存的任意值，轉成 FieldEditor 看得懂的 ValueNode。
 *
 * 這個面板存的一般 prop 值，過去一直是「裸值」，不是 ValueNode，需要相容既有
 * 頁面資料，不能要求使用者的舊資料重存一次：
 *   - 已經是 ValueNode（有合法的 mode 欄位）：直接沿用。
 *   - 裸的 string/number/boolean：包成 literal ValueNode。
 *   - 裸陣列（例如 defaultItems 過去存的 ["a","b"]、defaultNavs 過去存的
 *     [{label,to}, ...]）：遞迴地把每個 item 轉成對應的 ValueNode，包成
 *     ArrayNode —— 不能直接丟給 createDefaultValueNode，那樣會把舊資料裡
 *     已經填的內容整個清空成空陣列。
 *   - 裸物件（例如 primaryCta 過去存的 {label:"...", to:"..."}）：遞迴地
 *     把每個欄位轉成對應的 ValueNode，包成 ObjectNode，理由同上。
 *     但要先排除舊版 ComplexField 寫回的 { __bound: true, sourceId } 綁定
 *     引用格式（那是「具名複雜型別」欄位的產物，跟這裡「巢狀值本身」的
 *     裸物件是不同語意，不該被誤判並遞迴拆解成一堆不存在的欄位）。
 *   - 其餘（undefined、上面排除掉的舊版綁定引用等）：用型別預設值。
 * 寫回一律是 ValueNode（見 BindableField 的 onChange），所以只有「還沒被這個
 * 新版面板碰過」的舊資料才會進到裸值分支，屬於一次性的相容轉換，不影響
 * pages-store.ts 的 PageBlock 型別本身。
 */
function toValueNode(value: unknown, fieldType: FieldType, store: InMemoryDataStore): ValueNode {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { mode?: unknown }).mode === "string" &&
    ["literal", "bound", "array", "object"].includes((value as { mode: string }).mode)
  ) {
    return value as ValueNode;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { mode: "literal", value };
  }

  // 型別若是 ref，先解析成實際型別再繼續判斷（跟 resolveValue/createDefaultValueNode 一致的做法）。
  const resolvedType = fieldType.kind === "ref" ? store.getTypeDef(fieldType.typeId) ?? fieldType : fieldType;

  if (Array.isArray(value) && resolvedType.kind === "array") {
    return {
      mode: "array",
      items: value.map((item) => toValueNode(item, resolvedType.item, store)),
    };
  }

  if (
    value &&
    typeof value === "object" &&
    !isLegacyComplexBinding(value) &&
    resolvedType.kind === "object"
  ) {
    const fields: Record<string, ValueNode> = {};
    for (const key of Object.keys(resolvedType.fields)) {
      fields[key] = toValueNode(
        (value as Record<string, unknown>)[key],
        resolvedType.fields[key],
        store,
      );
    }
    return { mode: "object", fields };
  }

  return createDefaultValueNode(fieldType, store);
}

/**
 * bindable 分支專用的 BindingPolicy：在 permissiveBindingPolicy 之上加一條限制 ——
 * 「裸型別」（object / array 這種沒有具名 typeId、無法整包對應到某一筆 typedData
 * 的巢狀容器層，例如 hero.tsx 的 primaryCta、defaultNavs）不開放綁定 typedData。
 *
 * 背景：schema.ts 的 matchesRefType 對 `type.kind === 'object'` 目前是「暫不精準
 * 過濾，一律允許」（見該檔案註解），這對「型別資料管理」頁面本來是合理的預設；
 * 但在這個面板的 bindable 分支裡，物件/陣列容器層本身沒有具名 id，允許使用者
 * 綁一筆 typedData 上去只會出現「型別根本對不上、選了也沒有意義」的候選清單。
 * 這裡不去動共用的 schema.ts / field-editor.tsx（那會影響型別資料管理頁面的
 * 既有行為），而是只在這個面板呼叫 FieldEditor 時換一顆限縮過的 policy：
 *   - primitive（string/number/boolean）：完全沿用 permissiveBindingPolicy，
 *     leaf 欄位依舊能綁 i18n / 路由 / 檔案。
 *   - object / array：getBindableKinds 回傳空陣列，容器層本身不出現綁定按鈕；
 *     裡面每個欄位各自遞迴下去，是 primitive 的一樣能綁。
 * ref 型別理論上不會出現在這裡（會被 classifyField 分類成 "complex"），但為了
 * 保險，ref 一律比照 permissiveBindingPolicy（畢竟它有 typeId，語意上等同具名）。
 */
const namedTypeOnlyBindingPolicy: BindingPolicy = {
  getBindableKinds(type) {
    if (type.kind === "object" || type.kind === "array") return [];
    return permissiveBindingPolicy.getBindableKinds(type);
  },
  matchesSource(type, source) {
    return permissiveBindingPolicy.matchesSource?.(type, source) ?? true;
  },
};

/**
 * bindable => 依 FieldType 交給 FieldEditor 渲染，現在涵蓋兩層意思：
 *   1. 一般值（string/number/boolean）：除了直接輸入純值，也可以綁定
 *      「資料管理」頁面維護的 i18n / 路由 / 檔案來源。
 *   2. 巢狀的陣列 / 內嵌匿名 object（例如 hero.tsx 的 primaryCta、
 *      defaultNavs）：FieldEditor 本身是遞迴元件（ObjectFields / ArrayItems
 *      內部會再呼叫一次 <FieldEditor>），會依 FieldType 自動逐層展開成對應
 *      的子欄位／可新增刪除的陣列項目，每個 leaf 一樣能各自選擇填純值或綁定
 *      i18n / 路由 / 檔案 —— 這裡不需要因為型別是 object/array 就另外分派到
 *      別的元件，同一顆 FieldEditor 就處理完整棵樹。
 *
 * 直接沿用 packages/ui/src/components/data-model/fields/typed-data-fields.tsx
 * 綁定 value 時走的同一顆 FieldEditor：候選來源清單、bound 顯示、綁定/解除
 * 綁定的操作，都跟型別資料頁面完全一致，不用另外刻一套。候選來源是否符合
 * 這個 prop 的實際型別（例如 number 不該列出 valueType 是 string 的 i18n
 * 詞條，route/file 只對 string 適用）由 permissiveBindingPolicy.matchesSource
 * 判斷（見 schema.ts），這裡完全不寫死型別比對規則，之後要調整比對邏輯
 * 只需要換一顆 policy 或覆寫 matchesSource，不用改這個檔案。
 * 這裡只負責把 block.props 既有存放「裸值 / 裸陣列 / 裸物件」的慣例，轉接成
 * FieldEditor 要求的 ValueNode（見 toValueNode，含遞迴轉換邏輯），選擇綁定
 * 後寫回的 { mode: 'bound', sourceId }、以及巢狀 array/object 節點，一律只是
 * 寫進 onUpdateProp → 這個組件實例（block.props）本身，不會、也不需要動到
 * wb.dataSources（「資料管理」頁面維護的 DataSource 清單）——這裡讀 store
 * 全程只是唯讀查找可綁定的候選來源，從未呼叫任何寫入 dataSources 的 setter。
 */
function BindableField({
  fieldType,
  value,
  defaultValue,
  store,
  onChange,
}: {
  fieldType: FieldType;
  value: unknown;
  defaultValue: string | null;
  store: InMemoryDataStore;
  onChange: (value: unknown) => void;
}) {
  const node = useMemo(() => toValueNode(value, fieldType, store), [value, fieldType, store]);

  return (
    <div>
      <FieldEditor
        type={fieldType}
        node={node}
        store={store}
        onChange={onChange}
        showTypeBadge={false}
        policy={namedTypeOnlyBindingPolicy}
      />
      {node.mode === "literal" && defaultValue != null && (node.value === "" || node.value == null) && (
        <p style={{ fontSize: 11, color: "#8a8a8a", margin: "4px 0 0" }}>預設: {defaultValue}</p>
      )}
    </div>
  );
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

/** ReactNode（slot）prop 目前值所屬的編輯模式：放子組件，或直接填一個純值（可綁定）。 */
type SlotFieldMode = "components" | "value";

/** 依目前存的值判斷該用哪種模式：SlotValue → 組件；ValueNode（literal/bound）→ 純值；
 *  其餘（undefined、尚未設定過）預設沿用組件模式，維持既有行為不強迫使用者重新選擇。 */
function detectSlotFieldMode(value: unknown): SlotFieldMode {
  if (isValueNodeLike(value)) return "value";
  return "components";
}

/** 判斷一個值是不是 ValueNode 形狀（{ mode: 'literal' | 'bound' | ... }），
 *  跟 toValueNode 開頭的判斷同一套規則，這裡獨立成小函式方便 ReactNodeField 沿用。 */
function isValueNodeLike(value: unknown): value is ValueNode {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { mode?: unknown }).mode === "string" &&
    ["literal", "bound", "array", "object"].includes((value as { mode: string }).mode)
  );
}

/**
 * reactNode（slot）prop 的編輯控制項，支援兩種模式：
 *
 *   1. "components"（原本唯一支援的模式）：放一組子組件實例，值存
 *      SlotValue（{ __slot: true, blocks: PageBlock[] }），跟「組件樹狀結構」
 *      面板讀取 slot 的方式一致。新增的每個組件實例都是全新的 PageBlock
 *      （props 空物件，走組件自身預設值），只會寫進目前這個實例的 props，
 *      不會動到 allComponents 的組件定義本身。
 *
 *   2. "value"（新增）：很多情境下 ReactNode 型別的 prop（例如 children、
 *      label）實際上只是想放一段文字或數字，不需要真的插入一個子組件。
 *      這個模式直接沿用其他 bindable 欄位（見 BindableField）同一套
 *      FieldEditor + ValueNode 機制：選「文字」或「數字」子模式後，值存
 *      成 { mode: 'literal', value } 或 { mode: 'bound', sourceId }，
 *      跟一般 string/number prop 完全同格式，也因此一樣能綁定「資料管理」
 *      頁面維護的 i18n / 路由 / 檔案來源，不是只能填死值。
 *
 * 兩種模式互斥（畫布渲染端 splitSlotProps 只認 SlotValue 是「組件」，其餘
 * 一律當純值直接傳給組件，兩者在 block.props 裡是同一個 key、不同形狀的
 * 值，不需要另外新增欄位存「目前是哪個模式」——模式本身可以直接從值的
 * 形狀反推，見 detectSlotFieldMode）。切換模式時會清空成該模式的初始值，
 * 避免殘留另一種模式的資料形狀造成混淆或誤判。
 *
 * 這個设計刻意不去動 pages-store.ts 的 SlotValue / PageBlock 定義，也不用
 * 新增任何新的核心資料型別：純值模式寫回的 ValueNode 走的是既有 bindable
 * 欄位那條路（component-properties-panel.tsx 的 toValueNode + BindableField，
 * canvas-panel.tsx 渲染時的 resolvePlainPropValue 已經會處理），組件模式
 * 完全不變；影響範圍只有這個檔案。
 */
function ReactNodeField({
  value,
  store,
  onChange,
}: {
  value: unknown;
  store: InMemoryDataStore;
  onChange: (value: unknown) => void;
}) {
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const mode = detectSlotFieldMode(value);
  const slot: SlotValue = isSlotValue(value) ? value : makeSlotValue([]);

  // 純值模式底下再分「文字」或「數字」子模式，決定 BindableField 用哪個
  // FieldType 渲染（純粹影響輸入框種類與綁定候選是否含數值型 i18n 詞條，
  // 不影響上面 SlotFieldMode 的判斷邏輯）。已存在的 literal 值依實際型別
  // 判斷；bound 值或尚未填值時預設當文字處理。
  const valueSubMode: "string" | "number" =
    isValueNodeLike(value) && value.mode === "literal" && typeof value.value === "number" ? "number" : "string";

  const switchToComponents = () => {
    if (mode === "components") return;
    onChange(makeSlotValue([]));
  };

  const switchToValue = (subMode: "string" | "number") => {
    if (mode === "value" && valueSubMode === subMode) return;
    onChange({ mode: "literal", value: subMode === "number" ? 0 : "" });
  };

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

  const modeSwitcherStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 4,
    border: "1px solid " + (active ? "#2d9c74" : "#333"),
    background: active ? "#18271f" : "transparent",
    color: active ? "#8fe" : "#999",
    cursor: "pointer",
  });

  return (
    <div>
      {/* 模式切換：放子組件，或直接填一個可綁定的純值（文字/數字）。 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        <button type="button" style={modeSwitcherStyle(mode === "components")} onClick={switchToComponents} title="放入子組件">
          <Blocks size={11} />
          組件
        </button>
        <button
          type="button"
          style={modeSwitcherStyle(mode === "value" && valueSubMode === "string")}
          onClick={() => switchToValue("string")}
          title="直接填一段文字，可綁定 i18n / 路由 / 檔案來源"
        >
          <TypeIcon size={11} />
          文字
        </button>
        <button
          type="button"
          style={modeSwitcherStyle(mode === "value" && valueSubMode === "number")}
          onClick={() => switchToValue("number")}
          title="直接填一個數字"
        >
          <TypeIcon size={11} />
          數字
        </button>
      </div>

      {mode === "value" ? (
        <BindableField
          fieldType={{ kind: "primitive", type: valueSubMode }}
          value={value}
          defaultValue={null}
          store={store}
          onChange={onChange}
        />
      ) : (
        <>
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
        </>
      )}
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