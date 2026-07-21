import type { DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  allComponents,
  getComponentById,
} from "@workspace/ui/lib/generator/component-registry";
import type {
  PageDef,
  PageNode,
  ComponentNode,
  PagesData,
} from "@/types/pages-types";
import { pagesData as initialPagesData } from "@/lib/data";
import {
  loadLocalPagesData,
  saveLocalPagesData,
  resolveInitialAppPages,
} from "@/store/pages-storage";
import {
  writePagesToDisk as writePagesToDiskApi,
  readPagesFromDisk,
} from "@/lib/pages-disk-api";
import { loadI18nData } from "@/store/i18n-storage";
import { collectAllKeys, type FlatDict } from "@/utils/i18n-utils";
import { editorStyles as styles } from "@/styles/page-editor-styles";
import { cn } from "@workspace/ui/utils/utils";
import { useApp } from "@/hooks/context";
import {
  StringLikeValueTypeSelect,
  ValueTypeField,
  isStringLikeValueType,
  type StringLikeValueType,
} from "@/components/value-type-input";
import { PropMetaBadges } from "@/components/component-prop-meta";

/**
 * data/pages.json 的編輯器。
 *
 * 跟 `/i18n` 頁面同一種模式：所有編輯動作即時同步到瀏覽器 `localStorage`
 * （key: `pages-editor:data`，見 `storage.ts`），只有「寫入檔案系統」「從檔案
 * 系統讀取（覆蓋）」這兩個明確按鈕才會跟檔案系統互動 —— 不再是單純的
 * 「瀏覽器記憶體編輯、重整就消失」，改成「瀏覽器 localStorage 是持續存在的
 * 工作副本，檔案系統是另一份需要手動同步的資料」。
 *
 * 初始化順序：優先讀 localStorage（`resolveInitialAppPages`）；只有該
 * app 在 localStorage 裡完全沒有紀錄時，才 fallback 到 build 時用
 * `import.meta.glob` 靜態讀進來的磁碟內容（`initialPagesData`）。
 *
 * 節點樹（PageNode = string | ComponentNode）可以任意深度巢狀，
 * 這裡用同一個 <NodeEditor> 元件遞迴渲染自己來編輯每一層。
 *
 * data/pages.json 以 app 做區隔（{ [app]: PageDef[] }），所有頁面
 * 編輯操作都限定在「目前 app」之下 —— 目前 app 統一取自最外層
 * layout 的切換 dropdown（見 `useApp`），這裡的路由不再帶 `:app`
 * 參數。app 本身（新增 / 刪除 / 重新命名 / 專屬設定）統一在最外層的
 * 「Admin 設定頁」（`/admin`，見 `src/pages/settings.tsx`）
 * 管理，這裡不提供 app 的 CRUD 或選擇 UI，只負責在目前 app 底下
 * 編輯頁面內容。
 */

/** id 只允許英數字、底線、連字號（與後端 write-pages.mjs 的 isSafeId 一致） */
export const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

let idCounter = 0;
function nextKey() {
  idCounter += 1;
  return `k${idCounter}`;
}

// 編輯器內部用的節點型態：在每個 PageNode 外面包一層穩定的 key，
// 方便 React 列表渲染 / 增刪節點時不會錯亂，輸出時再剝掉。
//
// i18n 綁定（不更改 PageNode / ComponentNode 型別本身）：
//   - 文字節點：`i18nKey` 有值時，代表這個文字節點的內容改成「顯示時查
//     i18n key 動態換值」，而不是寫死的字面字串（`value` 仍會保留最後一次
//     手動輸入或字典裡的值，當作「找不到 key / fallback」時的顯示內容）。
//   - component 節點：`i18nPropBindings` 是 `{ propName: i18nKey }`，
//     代表哪些 string props 改成動態取 i18n 值，其餘 props 不受影響。
// 這兩份綁定資訊都只存在編輯器內部與下方定義的 sidecar
// （`PageDef.i18nBindings`），並不會出現在 `PageNode`/`ComponentNode` 裡，
// 對 generate-pages.mjs、DynamicRenderer 既有邏輯完全透明。
export type EditableNode =
  | {
      key: string;
      kind: "text";
      value: string;
      i18nKey?: string;
      valueType?: StringLikeValueType;
    }
  | {
      key: string;
      kind: "component";
      component: string;
      props: Record<string, unknown>;
      children: EditableNode[];
      i18nPropBindings?: Record<string, string>;
      /**
       * `string` 型別的 props，除了純文字，也可能代表 email/url/phone/color/markdown 等
       * 更具體的輸入類型（沿用 i18n 管理頁的 `ValueType` 定義，見
       * `@/components/value-type-input.tsx` 的 `STRING_LIKE_VALUE_TYPES`）。這份 map
       * 只決定「用哪種輸入元件呈現」，不影響 `props[name]` 本身仍是純字串這件事，
       * 因此輸出（`toPageNode`）時完全不用特別處理，跟 `nodeProps`/`i18nPropBindings`
       * 一樣是平行的 sidecar，對 generate-pages.mjs、DynamicRenderer 完全透明。
       * 未設定的 prop 預設視為 `'string'`（一般文字 input）。
       */
      propValueTypes?: Record<string, StringLikeValueType>;
      /**
       * `ReactNode` 型別的 props 除了可以是純文字/JSON，也可以「放入另一棵節點樹」
       * （例如 `icon={<SomeIcon />}` 這種需要塞組件的 prop）。跟 `i18nPropBindings`
       * 一樣是平行的 sidecar map（`propName -> EditableNode[]`），不影響 `props`
       * 本身的型別；輸出（`toPageNode`）時，若某個 prop 有對應的 nodeProps 項目，
       * 會改成輸出一個小型節點樹（單一節點時直接輸出該節點、多節點時輸出陣列），
       * 而不是 `props[name]` 裡的原始值。
       */
      nodeProps?: Record<string, EditableNode[]>;
    };

/**
 * `PageDef` 的 sidecar 型別，額外攜帶 i18n 綁定資訊，跟 `nodes` 本身
 * 結構平行、以「路徑」對應到樹上的節點，藉此完全不用更動
 * `PageNode` / `ComponentNode` 型別，也不用在 JSON 節點裡混入
 * 任何 marker 欄位。
 *
 * 路徑格式：以 `.` 串接一路往下的 children 索引，例如
 * `"0"`（第 0 個 top-level 節點）、`"0.2"`（第 0 個節點的第 2 個
 * child）。路徑僅描述樹狀「位置」，因此新增/刪除/搬移節點時都必須
 * 連帶更新 `i18nBindings` 裡的路徑，這件事統一在
 * `toPageDef`（往下寫出時，路徑用當下的 nodes 順序重新計算）完成，
 * 呼叫端不需要自己維護路徑字串。
 *
 * - `text` 分支：整個路徑對應的節點是文字節點，值是它綁定的 i18n key。
 * - `props` 分支：路徑對應的節點是 component 節點，值是
 *   `{ propName: i18nKey }`，可以同時綁定多個 props。
 */
export interface I18nPathBindings {
  text?: Record<string /* path */, string /* i18n key */>;
  props?: Record<
    string /* path */,
    Record<string /* propName */, string /* i18n key */>
  >;
}

function nodePath(prefix: string, index: number): string {
  return prefix ? `${prefix}.${index}` : String(index);
}

/** 依 "0.2.1" 這種路徑字串，從 EditableNode[] 樹中找出對應節點。找不到回傳 undefined。 */
export function findNodeByPath(
  nodes: EditableNode[],
  path: string,
): EditableNode | undefined {
  const parts = path.split(".").map(Number);
  let list = nodes;
  let node: EditableNode | undefined;
  for (const idx of parts) {
    node = list[idx];
    if (!node) return undefined;
    list = node.kind === "component" ? node.children : [];
  }
  return node;
}

/**
 * 依路徑把 nodes 樹中對應節點換成 updater(node) 的結果，回傳一棵新樹
 * （沿路每一層都是新陣列/新物件，維持 React 的不可變更新慣例）。
 * 找不到路徑時原樣回傳（理論上不應發生，selectedPath 只會來自目前樹上存在的節點）。
 */
export function replaceNodeByPath(
  nodes: EditableNode[],
  path: string,
  updater: (node: EditableNode) => EditableNode,
): EditableNode[] {
  const parts = path.split(".").map(Number);
  function recur(list: EditableNode[], depth: number): EditableNode[] {
    const idx = parts[depth];
    const node = list[idx];
    if (!node) return list;
    const isLast = depth === parts.length - 1;
    const nextNode: EditableNode = isLast
      ? updater(node)
      : node.kind === "component"
        ? { ...node, children: recur(node.children, depth + 1) }
        : node;
    const copy = list.slice();
    copy[idx] = nextNode;
    return copy;
  }
  return recur(nodes, 0);
}

/** 依路徑從 nodes 樹中刪除對應節點，回傳一棵新樹。 */
export function removeNodeByPath(
  nodes: EditableNode[],
  path: string,
): EditableNode[] {
  const parts = path.split(".").map(Number);
  function recur(list: EditableNode[], depth: number): EditableNode[] {
    const idx = parts[depth];
    const isLast = depth === parts.length - 1;
    if (isLast) {
      const copy = list.slice();
      copy.splice(idx, 1);
      return copy;
    }
    const node = list[idx];
    if (!node || node.kind !== "component") return list;
    const copy = list.slice();
    copy[idx] = { ...node, children: recur(node.children, depth + 1) };
    return copy;
  }
  return recur(nodes, 0);
}

/**
 * 判斷某個已存的 prop 原始值是否「看起來像」節點樹（曾經被存成 PageNode /
 * PageNode[]），用來在讀回資料時自動還原成 `nodeProps`，讓使用者不需要手動
 * 重新綁定。只做寬鬆判斷（字串、或帶有 `component` 欄位的物件、或這些的陣列），
 * 誤判也無妨——UI 上一樣能繼續編輯，只是「當成節點樹」而非「當成純文字」。
 */
function looksLikePageNode(value: unknown): value is PageNode {
  if (typeof value === "string") return true;
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { component?: unknown }).component === "string"
  );
}

function toEditable(
  node: PageNode,
  path: string,
  bindings: I18nPathBindings | undefined,
): EditableNode {
  if (typeof node === "string") {
    const i18nKey = bindings?.text?.[path];
    return {
      key: nextKey(),
      kind: "text",
      value: node,
      ...(i18nKey ? { i18nKey } : {}),
    };
  }
  const propBindings = bindings?.props?.[path];
  const rawProps = { ...(node.props ?? {}) };
  // 防呆：若來源資料（舊資料、手動編輯過的 JSON）的 props 裡混入了
  // "children" 欄位，直接在讀入時就丟掉，避免它繼續當成一般 prop 被顯示
  // /編輯，最後又寫回 props.children（跟節點自己的 children 陣列衝突，
  // generate-pages.mjs 也會直接拒絕這種資料）。
  delete rawProps.children;
  const meta = getComponentById(node.component);
  const nodeProps: Record<string, EditableNode[]> = {};
  if (meta) {
    for (const p of meta.props) {
      if (p.type !== "ReactNode") continue;
      // "children" 這個 prop 名稱跟節點自己的 `children` 陣列意義重疊，且
      // 從不被 dynamic-renderer.tsx / generate-pages.mjs 拿來渲染，所以不
      // 特別解析成 nodeProps（否則會在編輯器多長出一塊沒有作用的重複區塊）。
      if (p.name === "children") continue;
      const raw = rawProps[p.name];
      if (raw === undefined) continue;
      const asArray = Array.isArray(raw) ? raw : [raw];
      if (!asArray.every(looksLikePageNode)) continue;
      nodeProps[p.name] = asArray.map((child, i) =>
        toEditable(child as PageNode, `${path}#${p.name}.${i}`, undefined),
      );
      delete rawProps[p.name];
    }
  }
  return {
    key: nextKey(),
    kind: "component",
    component: node.component,
    props: rawProps,
    children: (node.children ?? []).map((child, i) =>
      toEditable(child, nodePath(path, i), bindings),
    ),
    ...(propBindings && Object.keys(propBindings).length > 0
      ? { i18nPropBindings: { ...propBindings } }
      : {}),
    ...(Object.keys(nodeProps).length > 0 ? { nodeProps } : {}),
  };
}

/**
 * 把 EditableNode 樹寫回 PageNode 樹，同時把沿路遇到的 i18n 綁定收集進
 * `outBindings`（呼叫端傳入一個空物件，這個函式會就地把它填滿）。
 * `path` 是目前節點在樹上的位置（見 `I18nPathBindings` 的路徑格式說明）。
 */
function toPageNode(
  node: EditableNode,
  path: string,
  outBindings: I18nPathBindings,
): PageNode {
  if (node.kind === "text") {
    if (node.i18nKey) {
      outBindings.text ??= {};
      outBindings.text[path] = node.i18nKey;
    }
    return node.value;
  }
  const mergedProps: Record<string, unknown> = { ...node.props };
  if (node.nodeProps) {
    for (const [propName, children] of Object.entries(node.nodeProps)) {
      // 單一節點時直接輸出該節點本身（一般 ReactNode 用法），多個節點時輸出陣列
      // （呼叫端組件若把該 prop 當 `ReactNode[]` 用也能吃得下）。
      mergedProps[propName] =
        children.length === 1
          ? toPageNode(children[0], `${path}#${propName}.0`, {})
          : children.map((child, i) =>
              toPageNode(child, `${path}#${propName}.${i}`, {}),
            );
    }
  }
  const out: ComponentNode = { component: node.component };
  if (Object.keys(mergedProps).length > 0) out.props = mergedProps;
  if (node.children.length > 0) {
    out.children = node.children.map((child, i) =>
      toPageNode(child, nodePath(path, i), outBindings),
    );
  }
  if (node.i18nPropBindings && Object.keys(node.i18nPropBindings).length > 0) {
    outBindings.props ??= {};
    outBindings.props[path] = { ...node.i18nPropBindings };
  }
  return out;
}

export function makeNewTextNode(): EditableNode {
  return { key: nextKey(), kind: "text", value: "新文字節點" };
}

export function makeNewComponentNode(componentId: string): EditableNode {
  const meta = getComponentById(componentId);
  const props: Record<string, unknown> = {};
  if (meta) {
    for (const p of meta.props) {
      if (p.required && p.defaultValue == null) {
        props[p.name] = defaultValueForType(p.type);
      }
    }
  }
  return {
    key: nextKey(),
    kind: "component",
    component: componentId,
    props,
    children: [],
  };
}

function defaultValueForType(type: string): unknown {
  if (type === "boolean") return false;
  if (type === "number") return 0;
  if (type === "ReactNode") return "";
  return "";
}

function parsePropValue(raw: string, type: string): unknown {
  if (type === "boolean") return raw === "true";
  if (type === "number") {
    const n = Number(raw);
    return Number.isNaN(n) ? 0 : n;
  }
  // string / string literal union / ReactNode / 其他：盡量嘗試 JSON 解析，
  // 讓使用者也能輸入物件/陣列這類複雜值；失敗就當純字串處理。
  if (raw.trim().startsWith("{") || raw.trim().startsWith("[")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function propValueToInputString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// 寫入 / 讀取檔案系統（僅限 `npm run dev`）
//
// 比照專案既有的 writeBackPlugin（PropsTable 把編輯過的 prop 寫回 .tsx）與
// `/i18n` 頁面（writeI18nPlugin）的模式：實際 fetch 邏輯收在 `disk-api.ts`
// （`writePagesToDisk` / `readPagesFromDisk`），這裡只包一層轉成 UI 訊息文字。
// 這兩支 API 只在 vite dev server 的 configureServer middleware 中掛載，
// build 產物不含這支路由，正式站不會意外暴露讀寫檔端點。
//
// 寫入成功後直接覆蓋 data/{app}/pages.json；該檔案的變動會被 Vite 既有
// 的 HMR 機制偵測到，dynamic-page.tsx 的 import.meta.hot.accept() 會接手更新，
// 讓 `/live` 系列頁面立即反映最新內容，不需要整頁刷新。
//
// 讀取（從檔案系統讀取覆蓋）則是反向操作：把磁碟上目前的內容整批覆蓋
// localStorage 中「目前 app」的編輯狀態，跟 `/i18n` 頁面的語意一致。
// ---------------------------------------------------------------------------

type WriteBackState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

async function postPagesToDisk(
  pagesData: PagesData,
): Promise<{ ok: boolean; message: string }> {
  const result = await writePagesToDiskApi(pagesData);
  if (!result.ok) {
    return { ok: false, message: `寫入失敗：${result.error}` };
  }
  return {
    ok: true,
    message: `✓ 已寫入 ${result.writtenFiles.join(", ")}（共 ${result.appCount} 個 app、${result.pageCount} 個頁面）`,
  };
}

/**
 * 從磁碟讀回整份 pagesData，並回傳「該 app 讀到的頁面陣列」+ 訊息文字。
 * 呼叫端負責決定要怎麼用這份資料覆蓋 localStorage / 目前的編輯 state。
 */
async function fetchAppPagesFromDisk(
  app: string,
): Promise<
  | { ok: true; pages: PageDef[]; message: string }
  | { ok: false; message: string }
> {
  const result = await readPagesFromDisk();
  if (!result.ok) {
    return { ok: false, message: `讀取失敗：${result.error}` };
  }
  const pages = result.pagesData[app] ?? [];
  return {
    ok: true,
    pages,
    message: `✓ 已從磁碟讀取並覆蓋（data/${app}/pages.json，共 ${pages.length} 個頁面）`,
  };
}

/** 顯示寫回狀態訊息的小元件 */
function WriteBackStatus({ state }: { state: WriteBackState }) {
  if (state.status === "idle" || state.status === "saving") return null;
  return (
    <p
      className={cn(
        styles.writeStatus,
        state.status === "success"
          ? styles.writeStatusSuccess
          : styles.writeStatusError,
      )}
    >
      {state.message}
    </p>
  );
}

/**
 * 讀取「目前 app」底下所有語系聯集出的 i18n key 清單，供節點編輯器的
 * 「綁定 i18n key」下拉選單使用。跟 `/i18n` 頁面一樣直接讀
 * localStorage（`loadI18nData()`），不特別做即時訂閱更新——切換頁面或
 * 重新整理即可看到最新 key 清單，避免這裡為了一個下拉選單多接一套
 * subscribe 機制。
 *
 * 除了 key 清單本身，也一併回傳「該 app 第一個語系」的完整字典
 * （`previewDict`），供 `I18nKeyPicker` 在下拉選單裡顯示每個 key 目前綁定
 * 的翻譯內容當作預覽，不需要每個呼叫端各自重新讀一次 localStorage。
 */
export function useI18nKeys(app: string | undefined): {
  keys: string[];
  previewDict: FlatDict;
} {
  return useMemo(() => {
    if (!app) return { keys: [], previewDict: {} };
    const data = loadI18nData();
    const nsData = data[app];
    if (!nsData) return { keys: [], previewDict: {} };
    const firstLocale = Object.keys(nsData).sort()[0];
    return {
      keys: collectAllKeys(nsData),
      previewDict: firstLocale ? nsData[firstLocale] : {},
    };
  }, [app]);
}

/**
 * 「綁定 i18n key」的下拉選單，文字節點與 string 型別的 props 共用。
 * `value` 是目前綁定的 key（未綁定為 undefined/空字串）；選擇「不綁定」
 * 會呼叫 `onChange(undefined)`，讓呼叫端把對應的綁定欄位整個移除。
 *
 * 跟原本的原生 `<select>`比起來，多了兩個功能：
 *   - 上方一個簡易 filter 輸入框，key 數量一多可以快速縮小範圍（不分大小寫，
 *     比對 key 字串本身）。
 *   - 每個 key 選項旁邊會顯示一小段目前語系（`previewDict`）的翻譯內容預覽，
 *     方便在不切到 `/i18n` 頁面的情況下，大致確認選到的是不是對的 key。
 * 用原生 `<select>` 做不到「選項旁邊放預覽文字＋上方放搜尋框」，因此改用
 * `<details>/<summary>` + 純 HTML 清單自己刻一個小型下拉選單，維持零額外
 * 套件依賴、鍵盤 Esc/點外側收合都用原生行為（`<details>` 內建）。
 */
function I18nKeyPicker({
  value,
  keys,
  previewDict,
  onChange,
}: {
  value: string | undefined;
  keys: string[];
  previewDict: FlatDict;
  onChange: (key: string | undefined) => void;
}) {
  const [filter, setFilter] = useState("");
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const filteredKeys = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k) => k.toLowerCase().includes(q));
  }, [keys, filter]);

  function choose(key: string | undefined) {
    onChange(key);
    setFilter("");
    if (detailsRef.current) detailsRef.current.open = false;
  }

  const currentPreview = value ? previewDict[value] : undefined;

  return (
    <details
      ref={detailsRef}
      className="group relative w-9 shrink-0"
      onToggle={(e) => {
        // 展開時把 filter 輸入框聚焦，收合時清掉 filter 字串（下次打開重新開始篩選）。
        const el = e.currentTarget;
        if (el.open) {
          requestAnimationFrame(() => {
            el.querySelector<HTMLInputElement>(
              "input[data-i18n-filter]",
            )?.focus();
          });
        } else {
          setFilter("");
        }
      }}
    >
      <summary
        className={cn(
          styles.select,
          "flex h-9 w-9 cursor-pointer list-none items-center justify-center px-0 [&::-webkit-details-marker]:hidden",
          value ? "border-primary/40 text-primary" : "text-muted-foreground",
        )}
        title={
          value
            ? `已綁定 i18n key「${value}」${currentPreview ? `：${currentPreview}` : ""}（點擊變更或解除）`
            : "綁定 i18n key（顯示時動態換值）"
        }
      >
        🔗
      </summary>

      <div className="absolute right-0 z-10 mt-1 w-[280px] rounded-md border border-border bg-card p-2 shadow-lg">
        <input
          data-i18n-filter
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="篩選 key…"
          className={cn(styles.textFieldInput, "mb-2 normal-case")}
        />
        <div className="max-h-[240px] overflow-y-auto">
          <button
            type="button"
            className="block w-full cursor-pointer rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-secondary"
            onClick={() => choose(undefined)}
          >
            不綁定 i18n
          </button>

          {filteredKeys.length === 0 && (
            <p className="px-2 py-1.5 text-[0.75rem] text-muted-foreground/70 italic">
              （找不到符合的 key）
            </p>
          )}

          {filteredKeys.map((k) => {
            const preview = previewDict[k];
            return (
              <button
                key={k}
                type="button"
                className={cn(
                  "block w-full cursor-pointer rounded px-2 py-1.5 text-left text-xs hover:bg-secondary",
                  k === value
                    ? "bg-primary/10 text-primary"
                    : "text-foreground",
                )}
                onClick={() => choose(k)}
              >
                <div className="truncate font-mono">{k}</div>
                {/* 目前語系（第一個語系）的內容預覽：截斷避免撐開下拉選單，找不到值時提示「無內容」 */}
                <div className="truncate text-[0.6875rem] text-muted-foreground/70">
                  {preview ? preview : "（此語系尚無內容）"}
                </div>
              </button>
            );
          })}

          {/* 綁定的 key 若因為刪除等原因已不在目前 key 清單中，仍保留原本的值可見、可解除 */}
          {value && !keys.includes(value) && (
            <button
              type="button"
              className="block w-full cursor-pointer rounded bg-destructive/10 px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/20"
              onClick={() => choose(value)}
            >
              <div className="truncate font-mono">{value}</div>
              <div className="truncate text-[0.6875rem]">
                （找不到此 key，點擊維持選取或改選其他 key）
              </div>
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

/**
 * 顯示「已綁定 i18n key」狀態的小徽章，帶一個內嵌的 ✕ 按鈕可以直接解除綁定，
 * 不需要重新打開 `I18nKeyPicker` 下拉選單找「不綁定 i18n」選項。
 * 文字節點（`i18nKey`）與 component 字串 prop（`i18nPropBindings[name]`）共用。
 */
function I18nBoundBadge({
  i18nKey,
  onUnbind,
}: {
  i18nKey: string;
  onUnbind: () => void;
}) {
  return (
    <span className={styles.i18nStatus}>
      <span
        className="truncate"
        title={`已綁定 i18n key「${i18nKey}」，畫面顯示改用該 key 目前語系的翻譯內容`}
      >
        🔗 {i18nKey}
      </span>
      <button
        type="button"
        className={styles.i18nStatusRemove}
        onClick={onUnbind}
        title="解除 i18n 綁定"
      >
        ✕
      </button>
    </span>
  );
}

export interface NodeEditorProps {
  node: EditableNode;
  depth: number;
  onChange: (next: EditableNode) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** 拖拉排序：由外層（父層的 nodes/children 陣列）提供，把自己從 from 移到 to。 */
  dragProps?: NodeDragProps;
  /** 目前 app 底下可選的 i18n key 清單，供「綁定 i18n key」下拉選單使用。 */
  i18nKeys: string[];
  /** 目前語系（第一個語系）的 key -> 內容，供下拉選單顯示每個 key 的預覽文字。 */
  i18nPreview: FlatDict;
  /** 是否要遞迴渲染 children（單一節點編輯面板只想編輯這一個節點本身時可關閉）。預設 true。 */
  showChildren?: boolean;
}

/**
 * 一組節點清單（PageDefEditor 的 page.nodes，或 NodeEditor 的 node.children）
 * 共用的拖拉排序 state + handler，抽成 hook 避免兩處各寫一份。
 *
 * 用原生 HTML5 drag & drop（draggable + onDragStart/Over/Drop），不引入
 * 額外套件；只有標題列左側的「⠿」把手可拖曳（draggable 掛在把手上，
 * 但 dragstart/dragover 監聽在整個節點卡片，因為 dataTransfer 需要拿得到
 * 完整的拖曳目標範圍）。
 */
function useNodeDragReorder(
  count: number,
  onReorder: (from: number, to: number) => void,
) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function makeDragProps(index: number): NodeDragProps {
    return {
      draggable: true,
      isDragging: dragIndex === index,
      dropPosition:
        overIndex === index && dragIndex !== null && dragIndex !== index
          ? index > dragIndex
            ? "after"
            : "before"
          : null,
      onDragStart: (e) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = "move";
        // Firefox 需要至少設定一次 data 才會啟動拖曳。
        e.dataTransfer.setData("text/plain", String(index));
      },
      onDragEnter: (e) => {
        e.preventDefault();
        if (dragIndex === null || dragIndex === index) return;
        setOverIndex(index);
      },
      onDragOver: (e) => {
        // 一定要 preventDefault 瀏覽器才允許 drop。
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragEnd: () => {
        setDragIndex(null);
        setOverIndex(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const from = dragIndex;
        setDragIndex(null);
        setOverIndex(null);
        if (from === null || from === index || from < 0 || from >= count)
          return;
        onReorder(from, index);
      },
    };
  }

  return makeDragProps;
}

interface NodeDragProps {
  draggable: true;
  isDragging: boolean;
  dropPosition: "before" | "after" | null;
  onDragStart: (e: DragEvent) => void;
  onDragEnter: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: DragEvent) => void;
}

/**
 * `ReactNode` 型別 prop 專用的小型節點編輯器：這個 prop 本身也可以放「一棵
 * （通常很小的）節點樹」，例如 `icon={<SomeIcon />}` 或 `label={<span>...</span>}`。
 * 跟 `children` 使用同一套 `NodeEditor` 遞迴渲染，只是資料來源是
 * `node.nodeProps[propName]` 而不是 `node.children`。
 *
 * 大多數情況這種 prop 只會放 0 或 1 個節點（單一 icon/label），但底層仍用陣列
 * 存放，允許放多個節點（少見但保留彈性，輸出時單一節點直接展開、多節點才輸出
 * 陣列，見 `toPageNode`）。
 */
function ReactNodePropEditor({
  propName,
  required,
  nodes,
  depth,
  i18nKeys,
  i18nPreview,
  onChange,
}: {
  propName: string;
  required: boolean;
  nodes: EditableNode[];
  depth: number;
  i18nKeys: string[];
  i18nPreview: FlatDict;
  onChange: (next: EditableNode[]) => void;
}) {
  function updateChild(index: number, next: EditableNode) {
    const copy = nodes.slice();
    copy[index] = next;
    onChange(copy);
  }

  function deleteChild(index: number) {
    const copy = nodes.slice();
    copy.splice(index, 1);
    onChange(copy);
  }

  function moveChild(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= nodes.length) return;
    const copy = nodes.slice();
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  }

  function addChild(kind: "text" | "component") {
    const child =
      kind === "text"
        ? makeNewTextNode()
        : makeNewComponentNode(allComponents[0]?.id ?? "");
    onChange([...nodes, child]);
  }

  const dragProps = useNodeDragReorder(nodes.length, (from, to) => {
    const copy = nodes.slice();
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    onChange(copy);
  });

  return (
    <div className={styles.childrenBlock}>
      <div className={styles.childrenHeader}>
        <span>
          {propName}{" "}
          <span className={styles.propType}>
            (ReactNode{required ? " *" : ""})
          </span>
        </span>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => addChild("text")}
          >
            + 文字
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => addChild("component")}
          >
            + 元件
          </button>
        </div>
      </div>

      {nodes.length === 0 && (
        <p className={styles.emptyHint}>
          （此 prop 尚未放入任何節點，可用上方按鈕新增一個文字或元件）
        </p>
      )}

      {nodes.map((child, i) => (
        <NodeEditor
          key={child.key}
          node={child}
          depth={depth + 1}
          onChange={(next) => updateChild(i, next)}
          onDelete={() => deleteChild(i)}
          onMoveUp={i > 0 ? () => moveChild(i, -1) : undefined}
          onMoveDown={i < nodes.length - 1 ? () => moveChild(i, 1) : undefined}
          dragProps={dragProps(i)}
          i18nKeys={i18nKeys}
          i18nPreview={i18nPreview}
        />
      ))}
    </div>
  );
}

export function NodeEditor({
  node,
  depth,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  dragProps,
  i18nKeys,
  i18nPreview,
  showChildren = true,
}: NodeEditorProps) {
  const meta =
    node.kind === "component" ? getComponentById(node.component) : undefined;

  function updateChild(index: number, next: EditableNode) {
    if (node.kind !== "component") return;
    const children = node.children.slice();
    children[index] = next;
    onChange({ ...node, children });
  }

  function deleteChild(index: number) {
    if (node.kind !== "component") return;
    const children = node.children.slice();
    children.splice(index, 1);
    onChange({ ...node, children });
  }

  function moveChild(index: number, dir: -1 | 1) {
    if (node.kind !== "component") return;
    const target = index + dir;
    if (target < 0 || target >= node.children.length) return;
    const children = node.children.slice();
    [children[index], children[target]] = [children[target], children[index]];
    onChange({ ...node, children });
  }

  function reorderChild(from: number, to: number) {
    if (node.kind !== "component") return;
    const children = node.children.slice();
    const [moved] = children.splice(from, 1);
    children.splice(to, 0, moved);
    onChange({ ...node, children });
  }

  const childDragProps = useNodeDragReorder(
    node.kind === "component" ? node.children.length : 0,
    reorderChild,
  );

  function addChild(kind: "text" | "component") {
    if (node.kind !== "component") return;
    const child =
      kind === "text"
        ? makeNewTextNode()
        : makeNewComponentNode(allComponents[0]?.id ?? "");
    onChange({ ...node, children: [...node.children, child] });
  }

  // depth 用實際像素內縮（而非固定 class），讓遞迴層級可以無限往下正確表示；
  // 同時在節點標頭放一個 "L{depth}" 徽章，讓深層節點在視覺上能清楚辨識自己
  // 目前巢狀在第幾層，而不是所有 depth > 0 的節點看起來縮排都一樣。
  const indentPx = depth * 18;

  return (
    <div
      className={cn(
        styles.node,
        depth > 0 && styles.nodeNested,
        dragProps?.isDragging && styles.nodeDragging,
        dragProps?.dropPosition === "before" && styles.nodeDropBefore,
        dragProps?.dropPosition === "after" && styles.nodeDropAfter,
      )}
      style={depth > 0 ? { marginLeft: `${indentPx}px` } : undefined}
      draggable={dragProps?.draggable}
      onDragStart={dragProps?.onDragStart}
      onDragEnter={dragProps?.onDragEnter}
      onDragOver={dragProps?.onDragOver}
      onDragEnd={dragProps?.onDragEnd}
      onDrop={dragProps?.onDrop}
    >
      <div className={styles.nodeHeader}>
        {dragProps && (
          <span className={styles.dragHandle} title="拖曳排序">
            ⠿
          </span>
        )}
        {depth > 0 && (
          <span
            className={styles.depthBadge}
            title={`巢狀層級：第 ${depth} 層`}
          >
            L{depth}
          </span>
        )}
        <span
          className={cn(
            styles.kindBadge,
            node.kind === "component"
              ? styles.kindBadgeComponent
              : styles.kindBadgeText,
          )}
          data-kind={node.kind}
        >
          {node.kind === "text" ? "文字" : "元件"}
        </span>

        {node.kind === "component" && (
          <>
            {!getComponentById(node.component) && (
              <span
                className={styles.kindBadge}
                style={{ color: "var(--destructive, #dc2626)" }}
                title={`找不到 component id "${node.component}"，原始資料仍保留；請在下拉選單中選擇要更換成的元件，或直接刪除此節點`}
              >
                ⚠ 未知元件
              </span>
            )}
            <select
              className={styles.select}
              value={node.component}
              onChange={(e) => {
                const newId = e.target.value;
                const newMeta = getComponentById(newId);
                // 切換元件時保留使用者已輸入的、仍存在於新元件 props 定義中的值
                const keptProps: Record<string, unknown> = {};
                if (newMeta) {
                  for (const p of newMeta.props) {
                    if (p.name in node.props)
                      keptProps[p.name] = node.props[p.name];
                  }
                }
                onChange({ ...node, component: newId, props: keptProps });
              }}
            >
              {/* 目前值若不在元件庫清單中（例如元件已被移除/改名），額外插入一個
                  對應的 option，讓 <select> 能正確顯示「目前是這個未知值」，
                  而不是悄悄 fallback 選到清單第一項、掩蓋了資料本身的問題。
                  使用者仍可從清單選別的元件來替換掉它。 */}
              {!getComponentById(node.component) && (
                <option value={node.component}>
                  ⚠ {node.component}（找不到，請更換）
                </option>
              )}
              {allComponents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.componentName} ({c.id})
                </option>
              ))}
            </select>
          </>
        )}

        {node.kind === "component" && node.children.length > 0 && (
          <span
            className={styles.depthBadge}
            title={`共 ${node.children.length} 個子節點`}
          >
            ▾ {node.children.length}
          </span>
        )}
        {node.kind === "component" && Object.keys(node.props).length > 0 && (
          <span
            className={styles.depthBadge}
            title={`共 ${Object.keys(node.props).length} 個已設定的 props`}
          >
            ⚙ {Object.keys(node.props).length}
          </span>
        )}

        <div className={styles.headerActions}>
          {onMoveUp && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onMoveUp}
              title="上移"
            >
              ↑
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onMoveDown}
              title="下移"
            >
              ↓
            </button>
          )}
          <button
            type="button"
            className={styles.iconBtnDanger}
            onClick={onDelete}
            title="刪除節點"
          >
            刪除
          </button>
        </div>
      </div>

      {node.kind === "text" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <ValueTypeField
                valueType={node.valueType ?? "string"}
                value={node.value}
                disabled={Boolean(node.i18nKey)}
                onChange={(next) => onChange({ ...node, value: next })}
              />
            </div>
            <I18nKeyPicker
              value={node.i18nKey}
              keys={i18nKeys}
              previewDict={i18nPreview}
              onChange={(key) => {
                const next = { ...node } as typeof node;
                if (key) next.i18nKey = key;
                else delete next.i18nKey;
                onChange(next);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StringLikeValueTypeSelect
              value={node.valueType ?? "string"}
              onChange={(nextType) =>
                onChange({ ...node, valueType: nextType })
              }
            />
            {node.i18nKey && (
              <I18nBoundBadge
                i18nKey={node.i18nKey}
                onUnbind={() => {
                  const next = { ...node } as typeof node;
                  delete next.i18nKey;
                  onChange(next);
                }}
              />
            )}
          </div>
        </div>
      )}

      {node.kind === "component" && (
        <>
          {!meta && (
            <p className={styles.warning}>
              ⚠ 找不到 component id "{node.component}"，請確認
              data/components.json。
            </p>
          )}

          {meta && meta.props.length > 0 && (
            <div className={styles.propsGrid}>
              {meta.props
                .filter((p) => p.type !== "ReactNode")
                .map((p) => (
                  <label
                    key={p.name}
                    className={cn(
                      styles.propField,
                      p.type === "string" && "sm:col-span-full",
                    )}
                  >
                    <span className={styles.propLabel}>
                      {p.name}
                      {p.required && <span className={styles.required}>*</span>}
                      <span className={styles.propType}> {p.type}</span>
                      <PropMetaBadges
                        required={p.required}
                        defaultValue={p.defaultValue}
                      />
                    </span>

                    {p.type === "boolean" ? (
                      <select
                        className={styles.select}
                        value={String(Boolean(node.props[p.name]))}
                        onChange={(e) =>
                          onChange({
                            ...node,
                            props: {
                              ...node.props,
                              [p.name]: e.target.value === "true",
                            },
                          })
                        }
                      >
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : /^(".*"\s*\|\s*)+".*"$/.test(p.type) ? (
                      <select
                        className={styles.select}
                        value={propValueToInputString(node.props[p.name])}
                        onChange={(e) =>
                          onChange({
                            ...node,
                            props: { ...node.props, [p.name]: e.target.value },
                          })
                        }
                      >
                        <option value="">(未設定)</option>
                        {p.type
                          .split("|")
                          .map((s) => s.trim().replace(/^"|"$/g, ""))
                          .map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                      </select>
                    ) : p.type === "string" ? (
                      // 純 `string` 型別的 prop：額外提供「輸入類型」選單（一般文字/多行/
                      // email/url/phone/色碼/檔案路徑/markdown），依選擇渲染對應的輸入元件。
                      // `props[p.name]` 本身仍然只存純字串，型別選擇只存在編輯器 sidecar
                      // （`node.propValueTypes`），不影響輸出的 PageNode 結構。
                      // 輸入框與 i18n 綁定按鈕同一行（按鈕固定在右側），
                      // 型別選單／已綁定狀態收在下面較窄的一行。
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <ValueTypeField
                              valueType={
                                isStringLikeValueType(
                                  node.propValueTypes?.[p.name] ?? "",
                                )
                                  ? node.propValueTypes![p.name]
                                  : "string"
                              }
                              value={propValueToInputString(node.props[p.name])}
                              placeholder={p.defaultValue ?? ""}
                              disabled={Boolean(
                                node.i18nPropBindings?.[p.name],
                              )}
                              onChange={(next) =>
                                onChange({
                                  ...node,
                                  props: { ...node.props, [p.name]: next },
                                })
                              }
                            />
                          </div>
                          <I18nKeyPicker
                            value={node.i18nPropBindings?.[p.name]}
                            keys={i18nKeys}
                            previewDict={i18nPreview}
                            onChange={(key) => {
                              const nextBindings = {
                                ...(node.i18nPropBindings ?? {}),
                              };
                              if (key) nextBindings[p.name] = key;
                              else delete nextBindings[p.name];
                              const next = { ...node };
                              if (Object.keys(nextBindings).length > 0) {
                                next.i18nPropBindings = nextBindings;
                              } else {
                                delete next.i18nPropBindings;
                              }
                              onChange(next);
                            }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StringLikeValueTypeSelect
                            value={
                              isStringLikeValueType(
                                node.propValueTypes?.[p.name] ?? "",
                              )
                                ? node.propValueTypes![p.name]
                                : "string"
                            }
                            onChange={(nextType) => {
                              const nextTypes = {
                                ...(node.propValueTypes ?? {}),
                                [p.name]: nextType,
                              };
                              onChange({ ...node, propValueTypes: nextTypes });
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          className={cn(styles.textFieldInput, "flex-1")}
                          type={p.type === "number" ? "number" : "text"}
                          value={propValueToInputString(node.props[p.name])}
                          placeholder={p.defaultValue ?? ""}
                          disabled={Boolean(node.i18nPropBindings?.[p.name])}
                          onChange={(e) =>
                            onChange({
                              ...node,
                              props: {
                                ...node.props,
                                [p.name]: parsePropValue(
                                  e.target.value,
                                  p.type,
                                ),
                              },
                            })
                          }
                        />
                        {/* 只有字串型別（非 number）的 prop 才提供 i18n 綁定，
                          number 型別在畫面上不會是「文案」，綁定意義不大。
                          純 `string` 型別已改用上面的分支處理，這裡剩下的是
                          非 number、非純 string 的其他型別（例如未知/複雜型別 fallback）。 */}
                        {p.type !== "number" && (
                          <I18nKeyPicker
                            value={node.i18nPropBindings?.[p.name]}
                            keys={i18nKeys}
                            previewDict={i18nPreview}
                            onChange={(key) => {
                              const nextBindings = {
                                ...(node.i18nPropBindings ?? {}),
                              };
                              if (key) nextBindings[p.name] = key;
                              else delete nextBindings[p.name];
                              const next = { ...node };
                              if (Object.keys(nextBindings).length > 0) {
                                next.i18nPropBindings = nextBindings;
                              } else {
                                delete next.i18nPropBindings;
                              }
                              onChange(next);
                            }}
                          />
                        )}
                      </div>
                    )}
                    {node.i18nPropBindings?.[p.name] && (
                      <I18nBoundBadge
                        i18nKey={node.i18nPropBindings[p.name]}
                        onUnbind={() => {
                          const nextBindings = {
                            ...(node.i18nPropBindings ?? {}),
                          };
                          delete nextBindings[p.name];
                          const next = { ...node };
                          if (Object.keys(nextBindings).length > 0) {
                            next.i18nPropBindings = nextBindings;
                          } else {
                            delete next.i18nPropBindings;
                          }
                          onChange(next);
                        }}
                      />
                    )}
                  </label>
                ))}
            </div>
          )}

          {meta &&
            meta.props
              // "children" 這個 prop 名稱跟節點自己的 children 陣列（下方那塊，
              // 真正會被渲染出來的）語意重疊，但實際上完全是兩份不同的資料
              // （dynamic-renderer.tsx / generate-pages.mjs 都只認節點的
              // `children` 陣列，不會讀 `props.children`）。過去若某個元件的
              // metadata 裡剛好也宣告了一個叫 children 的 ReactNode prop，
              // 這裡就會多長出一塊「看起來能編輯、但編輯了畫面不會變」的
              // 重複區塊，因此排除掉，統一只保留下方那塊真正有作用的。
              .filter((p) => p.type === "ReactNode" && p.name !== "children")
              .map((p) => (
                <ReactNodePropEditor
                  key={p.name}
                  propName={p.name}
                  required={p.required}
                  nodes={node.nodeProps?.[p.name] ?? []}
                  depth={depth}
                  i18nKeys={i18nKeys}
                  i18nPreview={i18nPreview}
                  onChange={(nextNodes) => {
                    const nextNodeProps = { ...(node.nodeProps ?? {}) };
                    if (nextNodes.length > 0) {
                      nextNodeProps[p.name] = nextNodes;
                    } else {
                      delete nextNodeProps[p.name];
                    }
                    const next = { ...node };
                    if (Object.keys(nextNodeProps).length > 0) {
                      next.nodeProps = nextNodeProps;
                    } else {
                      delete next.nodeProps;
                    }
                    onChange(next);
                  }}
                />
              ))}

          {showChildren ? (
            <div className={styles.childrenBlock}>
              <div className={styles.childrenHeader}>
                <span>children ({node.children.length})</span>
                <div className={styles.headerActions}>
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={() => addChild("text")}
                  >
                    + 文字
                  </button>
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={() => addChild("component")}
                  >
                    + 元件
                  </button>
                </div>
              </div>

              {node.children.length === 0 && (
                <p className={styles.emptyHint}>（無子節點）</p>
              )}

              {node.children.map((child, i) => (
                <NodeEditor
                  key={child.key}
                  node={child}
                  depth={depth + 1}
                  onChange={(next) => updateChild(i, next)}
                  onDelete={() => deleteChild(i)}
                  onMoveUp={i > 0 ? () => moveChild(i, -1) : undefined}
                  onMoveDown={
                    i < node.children.length - 1
                      ? () => moveChild(i, 1)
                      : undefined
                  }
                  dragProps={childDragProps(i)}
                  i18nKeys={i18nKeys}
                  i18nPreview={i18nPreview}
                />
              ))}
            </div>
          ) : (
            node.children.length > 0 && (
              <p className={styles.emptyHint}>
                （此節點有 {node.children.length}{" "}
                個子節點；在上方畫面點選子節點即可個別編輯）
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}

/** 單一頁面（PageDef）的編輯畫面：id / title + nodes 樹。 */
export function PageDefEditor({
  page,
  onChange,
}: {
  page: EditablePageDef;
  onChange: (next: EditablePageDef) => void;
}) {
  function updateNode(index: number, next: EditableNode) {
    const nodes = page.nodes.slice();
    nodes[index] = next;
    onChange({ ...page, nodes });
  }

  function deleteNode(index: number) {
    const nodes = page.nodes.slice();
    nodes.splice(index, 1);
    onChange({ ...page, nodes });
  }

  function moveNode(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= page.nodes.length) return;
    const nodes = page.nodes.slice();
    [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
    onChange({ ...page, nodes });
  }

  function reorderNode(from: number, to: number) {
    const nodes = page.nodes.slice();
    const [moved] = nodes.splice(from, 1);
    nodes.splice(to, 0, moved);
    onChange({ ...page, nodes });
  }

  const nodeDragProps = useNodeDragReorder(page.nodes.length, reorderNode);
  const { app } = useApp();
  const { keys: i18nKeys, previewDict: i18nPreview } = useI18nKeys(app!);

  function addNode(kind: "text" | "component") {
    const node =
      kind === "text"
        ? makeNewTextNode()
        : makeNewComponentNode(allComponents[0]?.id ?? "");
    onChange({ ...page, nodes: [...page.nodes, node] });
  }

  return (
    <div className={styles.pageEditor}>
      <div className={styles.pageMeta}>
        <label className={styles.metaField}>
          <span>id</span>
          <input
            className={styles.textFieldInput}
            value={page.id}
            onChange={(e) => {
              if (SAFE_ID_RE.test(e.target.value)) {
                onChange({ ...page, id: e.target.value });
              }
            }}
          />
        </label>
        <label className={styles.metaField}>
          <span>title</span>
          <input
            className={styles.textFieldInput}
            value={page.title}
            onChange={(e) => onChange({ ...page, title: e.target.value })}
          />
        </label>
      </div>

      <div className={styles.childrenHeader}>
        <span>nodes ({page.nodes.length})</span>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => addNode("text")}
          >
            + 文字節點
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => addNode("component")}
          >
            + 元件節點
          </button>
        </div>
      </div>

      {page.nodes.map((node, i) => (
        <NodeEditor
          key={node.key}
          node={node}
          depth={0}
          onChange={(next) => updateNode(i, next)}
          onDelete={() => deleteNode(i)}
          onMoveUp={i > 0 ? () => moveNode(i, -1) : undefined}
          onMoveDown={
            i < page.nodes.length - 1 ? () => moveNode(i, 1) : undefined
          }
          dragProps={nodeDragProps(i)}
          i18nKeys={i18nKeys}
          i18nPreview={i18nPreview}
        />
      ))}
    </div>
  );
}

export interface EditablePageDef {
  id: string;
  title: string;
  nodes: EditableNode[];
}

export function toEditablePage(page: PageDef): EditablePageDef {
  return {
    id: page.id,
    title: page.title,
    nodes: page.nodes.map((node, i) =>
      toEditable(node, nodePath("", i), page.i18nBindings),
    ),
  };
}

export function toPageDef(page: EditablePageDef): PageDef {
  const outBindings: I18nPathBindings = {};
  const nodes = page.nodes.map((node, i) =>
    toPageNode(node, nodePath("", i), outBindings),
  );
  const hasBindings = Boolean(outBindings.text || outBindings.props);
  return {
    id: page.id,
    title: page.title,
    nodes,
    ...(hasBindings ? { i18nBindings: outBindings } : {}),
  };
}

/** 供 `/live/:pageId` 合併頁（live-workspace.tsx）重用的寫入/讀取工具，避免重複貼一份邏輯。 */
export { postPagesToDisk, fetchAppPagesFromDisk, WriteBackStatus };
export type { WriteBackState };

/**
 * `/live/:pageId/edit` — 針對目前 app 底下單一頁面的編輯器。
 * 只在瀏覽器記憶體中編輯，不會寫回任何檔案；
 * 提供「下載 JSON」與「列印」按鈕輸出目前編輯結果。
 * 寫入檔案系統時，只會替換該 app 陣列中對應 id 的那一筆，
 * 其餘 app / 其餘頁面維持 initialPagesData（最初載入時）的內容。
 */
export function PageEditorRoute() {
  const { pageId } = useParams<{ pageId: string }>();
  const { app } = useApp();
  const diskNsPages = app ? initialPagesData[app] : undefined;

  // 整個 app 的頁面陣列以 localStorage 為主要工作副本（跟 PagesEditorIndex
  // 共用同一把 key），只有在 localStorage 完全沒有這個 app 的紀錄時才
  // fallback 到磁碟初始值。這裡編輯單一頁面，但存放/同步的單位仍是整個陣列，
  // 這樣兩個編輯器（單頁 / 整個 app）看到的資料才會一致。
  const [nsPages, setNsPages] = useState<PageDef[] | null>(() =>
    app ? resolveInitialAppPages(app, diskNsPages) : null,
  );
  const original = useMemo(
    () => nsPages?.find((p) => p.id === pageId),
    [nsPages, pageId],
  );
  const [page, setPage] = useState<EditablePageDef | null>(() =>
    original ? toEditablePage(original) : null,
  );
  const printRef = useRef<HTMLPreElement>(null);
  const [showJson, setShowJson] = useState(false);
  const [writeBack, setWriteBack] = useState<WriteBackState>({
    status: "idle",
  });
  const [readBack, setReadBack] = useState<WriteBackState>({ status: "idle" });

  // app 切換時重新從 localStorage / 磁碟載入該 app 的頁面陣列
  useEffect(() => {
    if (!app) {
      setNsPages(null);
      return;
    }
    setNsPages(resolveInitialAppPages(app, initialPagesData[app]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  // pageId 或底層 nsPages 變動時，把編輯器指向對應那一筆
  useEffect(() => {
    const found = nsPages?.find((p) => p.id === pageId);
    setPage(found ? toEditablePage(found) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, app]);

  // 每次 page 內容改動，立即把「整個 app 陣列（替換掉這一筆）」同步回
  // localStorage —— 這是本檔案「所有更動先進 localStorage，只有手動寫入 /
  // 讀取才碰檔案系統」的核心：不需要按任何按鈕，編輯過程本身就已經是持久化的。
  useEffect(() => {
    if (!app || !nsPages || !page) return;
    const nextNsPages = nsPages.map((p) =>
      p.id === page.id ? toPageDef(page) : p,
    );
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app]: nextNsPages });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  if (!app || !nsPages) {
    return (
      <div className={styles.page}>
        <p className={styles.warning}>
          ⚠ 找不到 app <code>{app}</code>。
        </p>
        <p>
          <Link to="/admin">回到 App 設定頁</Link>
        </p>
      </div>
    );
  }

  if (!original || !page) {
    return (
      <div className={styles.page}>
        <p className={styles.warning}>
          ⚠ 在 app <code>{app}</code> 底下找不到 id 為 <code>{pageId}</code>{" "}
          的頁面。
        </p>
        <p>
          <Link to="/live">回到頁面清單</Link>
        </p>
      </div>
    );
  }

  const currentJson = JSON.stringify(toPageDef(page), null, 2);

  function download() {
    const blob = new Blob([currentJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page!.id || "page"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function printJson() {
    setShowJson(true);
    requestAnimationFrame(() => {
      window.print();
    });
  }

  function reset() {
    idCounter = 0;
    setPage(toEditablePage(original!));
    setWriteBack({ status: "idle" });
  }

  async function writeToDisk() {
    setWriteBack({ status: "saving" });
    // localStorage 裡目前這個 app 的完整陣列（含這個頁面剛編輯的內容）
    // 已經是最新的，直接用它跟其餘 app（維持 initialPagesData 最初載入
    // 時的內容）合併後一次性寫回磁碟。
    const local = loadLocalPagesData();
    const nsToWrite = local[app!] ?? nsPages!;
    const merged: PagesData = { ...initialPagesData, [app!]: nsToWrite };
    const result = await postPagesToDisk(merged);
    setWriteBack({
      status: result.ok ? "success" : "error",
      message: result.message,
    });
  }

  async function readFromDisk() {
    if (
      !window.confirm(
        `確定要用磁碟上 data/${app}/pages.json 的內容覆蓋瀏覽器中「${app}」目前的編輯狀態嗎？此動作無法復原（會直接覆蓋，不會 merge）。`,
      )
    ) {
      return;
    }
    setReadBack({ status: "saving" });
    const result = await fetchAppPagesFromDisk(app!);
    if (!result.ok) {
      setReadBack({ status: "error", message: result.message });
      return;
    }
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app!]: result.pages });
    setNsPages(result.pages);
    idCounter = 0;
    const found = result.pages.find((p) => p.id === pageId);
    setPage(found ? toEditablePage(found) : null);
    setReadBack({ status: "success", message: result.message });
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link to={`/live/${pageId}`} className={styles.backLink}>
          ← 回到即時預覽
        </Link>
        <div className={styles.toolbarActions}>
          <button type="button" className={styles.smallBtn} onClick={reset}>
            重設為原始 JSON
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => setShowJson((v) => !v)}
          >
            {showJson ? "隱藏 JSON" : "預覽 JSON"}
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={download}
          >
            下載 JSON
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={printJson}
          >
            列印 JSON
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={readFromDisk}
            disabled={readBack.status === "saving"}
          >
            {readBack.status === "saving"
              ? "讀取中…"
              : "從檔案系統讀取（覆蓋）"}
          </button>
          <button
            type="button"
            className={styles.successBtn}
            onClick={writeToDisk}
            disabled={writeBack.status === "saving"}
          >
            {writeBack.status === "saving" ? "寫入中…" : "寫入檔案系統"}
          </button>
        </div>
      </div>

      <WriteBackStatus state={writeBack} />
      <WriteBackStatus state={readBack} />

      <h1>
        編輯頁面：{page.title || page.id}{" "}
        <span className={styles.id}>（app: {app}）</span>
      </h1>
      <p className={styles.hint}>
        所有編輯即時同步到瀏覽器 <code>localStorage</code>
        ，重新整理分頁不會遺失。 只有按「寫入檔案系統」（僅限{" "}
        <code>npm run dev</code>）才會覆寫 <code>data/{app}/pages.json</code>
        ，其他分頁 / <code>/live</code> 頁面會透過 HMR
        立即看到最新內容；按「從檔案系統讀取（覆蓋）」則反向把磁碟上的內容
        覆蓋回瀏覽器的編輯狀態。也可以用「下載 JSON」或「列印」取得目前結果。
      </p>

      <PageDefEditor page={page} onChange={setPage} />

      {showJson && (
        <div className={styles.jsonPreview}>
          <div className={styles.childrenHeader}>
            <span>目前 JSON</span>
          </div>
          <pre ref={printRef} className={styles.jsonBlock}>
            {currentJson}
          </pre>
        </div>
      )}
    </div>
  );
}

/** `/live/edit` — 列出目前 app 底下所有頁面，並可一次下載/列印整份 pages 陣列。 */
export function PagesEditorIndex() {
  const { app } = useApp();
  const diskNsInitial = app ? initialPagesData[app] : undefined;
  const [pages, setPages] = useState<EditablePageDef[]>(() =>
    app ? resolveInitialAppPages(app, diskNsInitial).map(toEditablePage) : [],
  );
  const [showJson, setShowJson] = useState(false);
  const [writeBack, setWriteBack] = useState<WriteBackState>({
    status: "idle",
  });
  const [readBack, setReadBack] = useState<WriteBackState>({ status: "idle" });

  // app 切換時重新從 localStorage / 磁碟載入
  useEffect(() => {
    if (!app) {
      setPages([]);
      return;
    }
    idCounter = 0;
    setPages(
      resolveInitialAppPages(app, initialPagesData[app]).map(toEditablePage),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  // 每次 pages 陣列改動（新增/刪除/編輯任一頁面），立即同步回 localStorage —
  // 不需要按任何按鈕，跟 PageEditorRoute 共用同一把 key，兩個編輯器看到的
  // 資料互相一致。
  useEffect(() => {
    if (!app) return;
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app]: pages.map(toPageDef) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, app]);

  if (!app) {
    return (
      <div className={styles.page}>
        <p className={styles.warning}>
          ⚠ 找不到 app <code>{app}</code>。
        </p>
        <p>
          <Link to="/admin">回到 App 設定頁</Link>
        </p>
      </div>
    );
  }

  function updatePage(index: number, next: EditablePageDef) {
    const copy = pages.slice();
    copy[index] = next;
    setPages(copy);
  }

  function addPage() {
    const id = `page-${pages.length + 1}`;
    setPages([...pages, { id, title: "新頁面", nodes: [] }]);
  }

  function deletePage(index: number) {
    const copy = pages.slice();
    copy.splice(index, 1);
    setPages(copy);
  }

  const allJson = JSON.stringify(pages.map(toPageDef), null, 2);

  function download() {
    const blob = new Blob([allJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${app}.pages.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function printJson() {
    setShowJson(true);
    requestAnimationFrame(() => window.print());
  }

  async function writeToDisk() {
    setWriteBack({ status: "saving" });
    const merged: PagesData = {
      ...initialPagesData,
      [app!]: pages.map(toPageDef),
    };
    const result = await postPagesToDisk(merged);
    setWriteBack({
      status: result.ok ? "success" : "error",
      message: result.message,
    });
  }

  async function readFromDisk() {
    if (
      !window.confirm(
        `確定要用磁碟上 data/${app}/pages.json 的內容覆蓋瀏覽器中「${app}」目前的編輯狀態嗎？此動作無法復原（會直接覆蓋，不會 merge）。`,
      )
    ) {
      return;
    }
    setReadBack({ status: "saving" });
    const result = await fetchAppPagesFromDisk(app!);
    if (!result.ok) {
      setReadBack({ status: "error", message: result.message });
      return;
    }
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app!]: result.pages });
    idCounter = 0;
    setPages(result.pages.map(toEditablePage));
    setReadBack({ status: "success", message: result.message });
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link to="/live" className={styles.backLink}>
          ← 回到即時預覽清單
        </Link>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => setShowJson((v) => !v)}
          >
            {showJson ? "隱藏 JSON" : "預覽整份 JSON"}
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={download}
          >
            下載整份 pages.json
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={printJson}
          >
            列印整份 JSON
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={readFromDisk}
            disabled={readBack.status === "saving"}
          >
            {readBack.status === "saving"
              ? "讀取中…"
              : "從檔案系統讀取（覆蓋）"}
          </button>
          <button
            type="button"
            className={styles.successBtn}
            onClick={writeToDisk}
            disabled={writeBack.status === "saving"}
          >
            {writeBack.status === "saving" ? "寫入中…" : "寫入檔案系統"}
          </button>
        </div>
      </div>

      <WriteBackStatus state={writeBack} />
      <WriteBackStatus state={readBack} />

      <h1>
        編輯所有頁面 <span className={styles.id}>（app: {app}）</span>
      </h1>
      <p className={styles.hint}>
        所有編輯（新增/刪除/修改頁面）即時同步到瀏覽器 <code>localStorage</code>
        ， 重新整理分頁不會遺失。可個別展開頁面編輯，或直接下載/列印整份陣列；
        按「寫入檔案系統」（僅限 <code>npm run dev</code>
        ）可將目前整份陣列直接覆寫
        <code>data/{app}/pages.json</code>，透過 HMR 讓 <code>/live</code>{" "}
        頁面立即反映最新內容；按「從檔案系統讀取（覆蓋）」則反向把磁碟上的內容覆蓋回
        瀏覽器的編輯狀態。
      </p>

      <button type="button" className={styles.smallBtn} onClick={addPage}>
        + 新增頁面
      </button>

      {pages.map((p, i) => (
        <details
          key={p.id + i}
          className={styles.pageDetails}
          open={pages.length <= 2}
        >
          <summary className={styles.pageSummary}>
            {p.title || "(未命名)"} <span className={styles.id}>({p.id})</span>
            <button
              type="button"
              className={styles.iconBtnDanger}
              onClick={(e) => {
                e.preventDefault();
                deletePage(i);
              }}
            >
              刪除頁面
            </button>
          </summary>
          <PageDefEditor page={p} onChange={(next) => updatePage(i, next)} />
        </details>
      ))}

      {showJson && (
        <div className={styles.jsonPreview}>
          <div className={styles.childrenHeader}>
            <span>整份 pages.json（app: {app}）</span>
          </div>
          <pre className={styles.jsonBlock}>{allJson}</pre>
        </div>
      )}
    </div>
  );
}
