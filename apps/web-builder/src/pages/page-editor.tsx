import type { DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { allComponents, getComponentById } from '@workspace/ui/lib/generator/component-registry';
import type { PageDef, PageNode, ComponentNode, PagesData } from '@/types/pages-types';
import { pagesData as initialPagesData } from '@/lib/data';
import { loadLocalPagesData, saveLocalPagesData, resolveInitialAppPages } from '@/store/pages-storage';
import { writePagesToDisk as writePagesToDiskApi, readPagesFromDisk } from '@/lib/pages-disk-api';
import { loadI18nData } from '@/store/i18n-storage';
import { collectAllKeys } from '@/utils/i18n-utils';
import { editorStyles as styles } from '@/styles/page-editor-styles';
import { cn } from '@workspace/ui/utils/utils';
import { useApp } from '@/hooks/context';

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
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

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
  | { key: string; kind: 'text'; value: string; i18nKey?: string }
  | {
      key: string;
      kind: 'component';
      component: string;
      props: Record<string, unknown>;
      children: EditableNode[];
      i18nPropBindings?: Record<string, string>;
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
  props?: Record<string /* path */, Record<string /* propName */, string /* i18n key */>>;
}

function nodePath(prefix: string, index: number): string {
  return prefix ? `${prefix}.${index}` : String(index);
}

/** 依 "0.2.1" 這種路徑字串，從 EditableNode[] 樹中找出對應節點。找不到回傳 undefined。 */
export function findNodeByPath(nodes: EditableNode[], path: string): EditableNode | undefined {
  const parts = path.split('.').map(Number);
  let list = nodes;
  let node: EditableNode | undefined;
  for (const idx of parts) {
    node = list[idx];
    if (!node) return undefined;
    list = node.kind === 'component' ? node.children : [];
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
  updater: (node: EditableNode) => EditableNode
): EditableNode[] {
  const parts = path.split('.').map(Number);
  function recur(list: EditableNode[], depth: number): EditableNode[] {
    const idx = parts[depth];
    const node = list[idx];
    if (!node) return list;
    const isLast = depth === parts.length - 1;
    const nextNode: EditableNode = isLast
      ? updater(node)
      : node.kind === 'component'
        ? { ...node, children: recur(node.children, depth + 1) }
        : node;
    const copy = list.slice();
    copy[idx] = nextNode;
    return copy;
  }
  return recur(nodes, 0);
}

/** 依路徑從 nodes 樹中刪除對應節點，回傳一棵新樹。 */
export function removeNodeByPath(nodes: EditableNode[], path: string): EditableNode[] {
  const parts = path.split('.').map(Number);
  function recur(list: EditableNode[], depth: number): EditableNode[] {
    const idx = parts[depth];
    const isLast = depth === parts.length - 1;
    if (isLast) {
      const copy = list.slice();
      copy.splice(idx, 1);
      return copy;
    }
    const node = list[idx];
    if (!node || node.kind !== 'component') return list;
    const copy = list.slice();
    copy[idx] = { ...node, children: recur(node.children, depth + 1) };
    return copy;
  }
  return recur(nodes, 0);
}

function toEditable(node: PageNode, path: string, bindings: I18nPathBindings | undefined): EditableNode {
  if (typeof node === 'string') {
    const i18nKey = bindings?.text?.[path];
    return { key: nextKey(), kind: 'text', value: node, ...(i18nKey ? { i18nKey } : {}) };
  }
  const propBindings = bindings?.props?.[path];
  return {
    key: nextKey(),
    kind: 'component',
    component: node.component,
    props: { ...(node.props ?? {}) },
    children: (node.children ?? []).map((child, i) => toEditable(child, nodePath(path, i), bindings)),
    ...(propBindings && Object.keys(propBindings).length > 0
      ? { i18nPropBindings: { ...propBindings } }
      : {}),
  };
}

/**
 * 把 EditableNode 樹寫回 PageNode 樹，同時把沿路遇到的 i18n 綁定收集進
 * `outBindings`（呼叫端傳入一個空物件，這個函式會就地把它填滿）。
 * `path` 是目前節點在樹上的位置（見 `I18nPathBindings` 的路徑格式說明）。
 */
function toPageNode(node: EditableNode, path: string, outBindings: I18nPathBindings): PageNode {
  if (node.kind === 'text') {
    if (node.i18nKey) {
      outBindings.text ??= {};
      outBindings.text[path] = node.i18nKey;
    }
    return node.value;
  }
  const out: ComponentNode = { component: node.component };
  if (Object.keys(node.props).length > 0) out.props = node.props;
  if (node.children.length > 0) {
    out.children = node.children.map((child, i) => toPageNode(child, nodePath(path, i), outBindings));
  }
  if (node.i18nPropBindings && Object.keys(node.i18nPropBindings).length > 0) {
    outBindings.props ??= {};
    outBindings.props[path] = { ...node.i18nPropBindings };
  }
  return out;
}

function makeNewTextNode(): EditableNode {
  return { key: nextKey(), kind: 'text', value: '新文字節點' };
}

function makeNewComponentNode(componentId: string): EditableNode {
  const meta = getComponentById(componentId);
  const props: Record<string, unknown> = {};
  if (meta) {
    for (const p of meta.props) {
      if (p.required && p.defaultValue == null) {
        props[p.name] = defaultValueForType(p.type);
      }
    }
  }
  return { key: nextKey(), kind: 'component', component: componentId, props, children: [] };
}

function defaultValueForType(type: string): unknown {
  if (type === 'boolean') return false;
  if (type === 'number') return 0;
  if (type === 'ReactNode') return '';
  return '';
}

function parsePropValue(raw: string, type: string): unknown {
  if (type === 'boolean') return raw === 'true';
  if (type === 'number') {
    const n = Number(raw);
    return Number.isNaN(n) ? 0 : n;
  }
  // string / string literal union / ReactNode / 其他：盡量嘗試 JSON 解析，
  // 讓使用者也能輸入物件/陣列這類複雜值；失敗就當純字串處理。
  if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function propValueToInputString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
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
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

async function postPagesToDisk(pagesData: PagesData): Promise<{ ok: boolean; message: string }> {
  const result = await writePagesToDiskApi(pagesData);
  if (!result.ok) {
    return { ok: false, message: `寫入失敗：${result.error}` };
  }
  return {
    ok: true,
    message: `✓ 已寫入 ${result.writtenFiles.join(', ')}（共 ${result.appCount} 個 app、${result.pageCount} 個頁面）`,
  };
}

/**
 * 從磁碟讀回整份 pagesData，並回傳「該 app 讀到的頁面陣列」+ 訊息文字。
 * 呼叫端負責決定要怎麼用這份資料覆蓋 localStorage / 目前的編輯 state。
 */
async function fetchAppPagesFromDisk(
  app: string
): Promise<{ ok: true; pages: PageDef[]; message: string } | { ok: false; message: string }> {
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
  if (state.status === 'idle' || state.status === 'saving') return null;
  return (
    <p
      className={cn(
        styles.writeStatus,
        state.status === 'success' ? styles.writeStatusSuccess : styles.writeStatusError
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
 */
export function useI18nKeys(app: string | undefined): string[] {
  return useMemo(() => {
    if (!app) return [];
    const data = loadI18nData();
    const nsData = data[app];
    if (!nsData) return [];
    return collectAllKeys(nsData);
  }, [app]);
}

/**
 * 「綁定 i18n key」的小選單，文字節點與 string 型別的 props 共用。
 * `value` 是目前綁定的 key（未綁定為 undefined/空字串）；選擇「不綁定」
 * 會呼叫 `onChange(undefined)`，讓呼叫端把對應的綁定欄位整個移除。
 */
function I18nKeyPicker({
  value,
  keys,
  onChange,
}: {
  value: string | undefined;
  keys: string[];
  onChange: (key: string | undefined) => void;
}) {
  return (
    <select
      className={cn(styles.select, 'max-w-[220px] shrink-0', value ? 'border-primary/40 text-primary' : 'text-muted-foreground')}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      title={value ? `已綁定 i18n key「${value}」` : '綁定 i18n key（顯示時動態換值）'}
    >
      <option value="">🔗 不綁定 i18n</option>
      {keys.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
      {/* 綁定的 key 若因為刪除等原因已不在目前 key 清單中，仍保留原本的值可見、可解除 */}
      {value && !keys.includes(value) && (
        <option value={value}>{value}（找不到此 key）</option>
      )}
    </select>
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
function useNodeDragReorder(count: number, onReorder: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function makeDragProps(index: number): NodeDragProps {
    return {
      draggable: true,
      isDragging: dragIndex === index,
      dropPosition:
        overIndex === index && dragIndex !== null && dragIndex !== index
          ? index > dragIndex
            ? 'after'
            : 'before'
          : null,
      onDragStart: (e) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // Firefox 需要至少設定一次 data 才會啟動拖曳。
        e.dataTransfer.setData('text/plain', String(index));
      },
      onDragEnter: (e) => {
        e.preventDefault();
        if (dragIndex === null || dragIndex === index) return;
        setOverIndex(index);
      },
      onDragOver: (e) => {
        // 一定要 preventDefault 瀏覽器才允許 drop。
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
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
        if (from === null || from === index || from < 0 || from >= count) return;
        onReorder(from, index);
      },
    };
  }

  return makeDragProps;
}

interface NodeDragProps {
  draggable: true;
  isDragging: boolean;
  dropPosition: 'before' | 'after' | null;
  onDragStart: (e: DragEvent) => void;
  onDragEnter: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: DragEvent) => void;
}

export function NodeEditor({ node, depth, onChange, onDelete, onMoveUp, onMoveDown, dragProps, i18nKeys, showChildren = true }: NodeEditorProps) {
  const meta = node.kind === 'component' ? getComponentById(node.component) : undefined;

  function updateChild(index: number, next: EditableNode) {
    if (node.kind !== 'component') return;
    const children = node.children.slice();
    children[index] = next;
    onChange({ ...node, children });
  }

  function deleteChild(index: number) {
    if (node.kind !== 'component') return;
    const children = node.children.slice();
    children.splice(index, 1);
    onChange({ ...node, children });
  }

  function moveChild(index: number, dir: -1 | 1) {
    if (node.kind !== 'component') return;
    const target = index + dir;
    if (target < 0 || target >= node.children.length) return;
    const children = node.children.slice();
    [children[index], children[target]] = [children[target], children[index]];
    onChange({ ...node, children });
  }

  function reorderChild(from: number, to: number) {
    if (node.kind !== 'component') return;
    const children = node.children.slice();
    const [moved] = children.splice(from, 1);
    children.splice(to, 0, moved);
    onChange({ ...node, children });
  }

  const childDragProps = useNodeDragReorder(
    node.kind === 'component' ? node.children.length : 0,
    reorderChild
  );

  function addChild(kind: 'text' | 'component') {
    if (node.kind !== 'component') return;
    const child = kind === 'text' ? makeNewTextNode() : makeNewComponentNode(allComponents[0]?.id ?? '');
    onChange({ ...node, children: [...node.children, child] });
  }

  return (
    <div
      className={cn(
        styles.node,
        depth > 0 && 'ml-5',
        dragProps?.isDragging && styles.nodeDragging,
        dragProps?.dropPosition === 'before' && styles.nodeDropBefore,
        dragProps?.dropPosition === 'after' && styles.nodeDropAfter
      )}
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
        <span
          className={cn(
            styles.kindBadge,
            node.kind === 'component' ? styles.kindBadgeComponent : styles.kindBadgeText
          )}
          data-kind={node.kind}
        >
          {node.kind === 'text' ? '文字' : '元件'}
        </span>

        {node.kind === 'component' && (
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
                  if (p.name in node.props) keptProps[p.name] = node.props[p.name];
                }
              }
              onChange({ ...node, component: newId, props: keptProps });
            }}
          >
            {allComponents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.componentName} ({c.id})
              </option>
            ))}
          </select>
        )}

        <div className={styles.headerActions}>
          {onMoveUp && (
            <button type="button" className={styles.iconBtn} onClick={onMoveUp} title="上移">
              ↑
            </button>
          )}
          {onMoveDown && (
            <button type="button" className={styles.iconBtn} onClick={onMoveDown} title="下移">
              ↓
            </button>
          )}
          <button type="button" className={styles.iconBtnDanger} onClick={onDelete} title="刪除節點">
            刪除
          </button>
        </div>
      </div>

      {node.kind === 'text' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <textarea
              className={cn(styles.textInput, 'flex-1')}
              value={node.value}
              rows={2}
              onChange={(e) => onChange({ ...node, value: e.target.value })}
            />
            <I18nKeyPicker
              value={node.i18nKey}
              keys={i18nKeys}
              onChange={(key) => {
                const next = { ...node } as typeof node;
                if (key) next.i18nKey = key;
                else delete next.i18nKey;
                onChange(next);
              }}
            />
          </div>
          {node.i18nKey && (
            <p className="text-[0.6875rem] leading-relaxed text-muted-foreground/70">
              已綁定 i18n key「{node.i18nKey}」，畫面上會改用該 key 目前語系的翻譯內容顯示；上方輸入框的內容只在找不到這個 key 時當作備援文字。
            </p>
          )}
        </div>
      )}

      {node.kind === 'component' && (
        <>
          {!meta && (
            <p className={styles.warning}>
              ⚠ 找不到 component id "{node.component}"，請確認 data/components.json。
            </p>
          )}

          {meta && meta.props.length > 0 && (
            <div className={styles.propsGrid}>
              {meta.props.map((p) => (
                <label key={p.name} className={styles.propField}>
                  <span className={styles.propLabel}>
                    {p.name}
                    {p.required && <span className={styles.required}>*</span>}
                    <span className={styles.propType}> {p.type}</span>
                  </span>

                  {p.type === 'boolean' ? (
                    <select
                      className={styles.select}
                      value={String(Boolean(node.props[p.name]))}
                      onChange={(e) =>
                        onChange({
                          ...node,
                          props: { ...node.props, [p.name]: e.target.value === 'true' },
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
                        onChange({ ...node, props: { ...node.props, [p.name]: e.target.value } })
                      }
                    >
                      <option value="">(未設定)</option>
                      {p.type
                        .split('|')
                        .map((s) => s.trim().replace(/^"|"$/g, ''))
                        .map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        className={cn(styles.textFieldInput, 'flex-1')}
                        type={p.type === 'number' ? 'number' : 'text'}
                        value={propValueToInputString(node.props[p.name])}
                        placeholder={p.defaultValue ?? ''}
                        disabled={Boolean(node.i18nPropBindings?.[p.name])}
                        onChange={(e) =>
                          onChange({
                            ...node,
                            props: {
                              ...node.props,
                              [p.name]: parsePropValue(e.target.value, p.type),
                            },
                          })
                        }
                      />
                      {/* 只有字串型別（非 number）的 prop 才提供 i18n 綁定，
                          number 型別在畫面上不會是「文案」，綁定意義不大。 */}
                      {p.type !== 'number' && (
                        <I18nKeyPicker
                          value={node.i18nPropBindings?.[p.name]}
                          keys={i18nKeys}
                          onChange={(key) => {
                            const nextBindings = { ...(node.i18nPropBindings ?? {}) };
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
                </label>
              ))}
            </div>
          )}

          {showChildren ? (
            <div className={styles.childrenBlock}>
              <div className={styles.childrenHeader}>
                <span>children ({node.children.length})</span>
                <div className={styles.headerActions}>
                  <button type="button" className={styles.smallBtn} onClick={() => addChild('text')}>
                    + 文字
                  </button>
                  <button type="button" className={styles.smallBtn} onClick={() => addChild('component')}>
                    + 元件
                  </button>
                </div>
              </div>

              {node.children.length === 0 && <p className={styles.emptyHint}>（無子節點）</p>}

              {node.children.map((child, i) => (
                <NodeEditor
                  key={child.key}
                  node={child}
                  depth={depth + 1}
                  onChange={(next) => updateChild(i, next)}
                  onDelete={() => deleteChild(i)}
                  onMoveUp={i > 0 ? () => moveChild(i, -1) : undefined}
                  onMoveDown={i < node.children.length - 1 ? () => moveChild(i, 1) : undefined}
                  dragProps={childDragProps(i)}
                  i18nKeys={i18nKeys}
                />
              ))}
            </div>
          ) : (
            node.children.length > 0 && (
              <p className={styles.emptyHint}>
                （此節點有 {node.children.length} 個子節點；在上方畫面點選子節點即可個別編輯）
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
  const i18nKeys = useI18nKeys(app!);

  function addNode(kind: 'text' | 'component') {
    const node = kind === 'text' ? makeNewTextNode() : makeNewComponentNode(allComponents[0]?.id ?? '');
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
                onChange({ ...page, id: e.target.value })
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
        />
      ))}
    </div>
  )
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
    nodes: page.nodes.map((node, i) => toEditable(node, nodePath('', i), page.i18nBindings)),
  };
}

export function toPageDef(page: EditablePageDef): PageDef {
  const outBindings: I18nPathBindings = {};
  const nodes = page.nodes.map((node, i) => toPageNode(node, nodePath('', i), outBindings));
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
    app ? resolveInitialAppPages(app, diskNsPages) : null
  );
  const original = useMemo(() => nsPages?.find((p) => p.id === pageId), [nsPages, pageId]);
  const [page, setPage] = useState<EditablePageDef | null>(() =>
    original ? toEditablePage(original) : null
  );
  const printRef = useRef<HTMLPreElement>(null);
  const [showJson, setShowJson] = useState(false);
  const [writeBack, setWriteBack] = useState<WriteBackState>({ status: 'idle' });
  const [readBack, setReadBack] = useState<WriteBackState>({ status: 'idle' });

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
    const nextNsPages = nsPages.map((p) => (p.id === page.id ? toPageDef(page) : p));
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
          ⚠ 在 app <code>{app}</code> 底下找不到 id 為 <code>{pageId}</code> 的頁面。
        </p>
        <p>
          <Link to="/live">回到頁面清單</Link>
        </p>
      </div>
    );
  }

  const currentJson = JSON.stringify(toPageDef(page), null, 2);

  function download() {
    const blob = new Blob([currentJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page!.id || 'page'}.json`;
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
    setWriteBack({ status: 'idle' });
  }

  async function writeToDisk() {
    setWriteBack({ status: 'saving' });
    // localStorage 裡目前這個 app 的完整陣列（含這個頁面剛編輯的內容）
    // 已經是最新的，直接用它跟其餘 app（維持 initialPagesData 最初載入
    // 時的內容）合併後一次性寫回磁碟。
    const local = loadLocalPagesData();
    const nsToWrite = local[app!] ?? nsPages!;
    const merged: PagesData = { ...initialPagesData, [app!]: nsToWrite };
    const result = await postPagesToDisk(merged);
    setWriteBack({ status: result.ok ? 'success' : 'error', message: result.message });
  }

  async function readFromDisk() {
    if (
      !window.confirm(
        `確定要用磁碟上 data/${app}/pages.json 的內容覆蓋瀏覽器中「${app}」目前的編輯狀態嗎？此動作無法復原（會直接覆蓋，不會 merge）。`
      )
    ) {
      return;
    }
    setReadBack({ status: 'saving' });
    const result = await fetchAppPagesFromDisk(app!);
    if (!result.ok) {
      setReadBack({ status: 'error', message: result.message });
      return;
    }
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app!]: result.pages });
    setNsPages(result.pages);
    idCounter = 0;
    const found = result.pages.find((p) => p.id === pageId);
    setPage(found ? toEditablePage(found) : null);
    setReadBack({ status: 'success', message: result.message });
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
          <button type="button" className={styles.smallBtn} onClick={() => setShowJson((v) => !v)}>
            {showJson ? '隱藏 JSON' : '預覽 JSON'}
          </button>
          <button type="button" className={styles.primaryBtn} onClick={download}>
            下載 JSON
          </button>
          <button type="button" className={styles.primaryBtn} onClick={printJson}>
            列印 JSON
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={readFromDisk}
            disabled={readBack.status === 'saving'}
          >
            {readBack.status === 'saving' ? '讀取中…' : '從檔案系統讀取（覆蓋）'}
          </button>
          <button
            type="button"
            className={styles.successBtn}
            onClick={writeToDisk}
            disabled={writeBack.status === 'saving'}
          >
            {writeBack.status === 'saving' ? '寫入中…' : '寫入檔案系統'}
          </button>
        </div>
      </div>

      <WriteBackStatus state={writeBack} />
      <WriteBackStatus state={readBack} />

      <h1>
        編輯頁面：{page.title || page.id} <span className={styles.id}>（app: {app}）</span>
      </h1>
      <p className={styles.hint}>
        所有編輯即時同步到瀏覽器 <code>localStorage</code>，重新整理分頁不會遺失。
        只有按「寫入檔案系統」（僅限 <code>npm run dev</code>）才會覆寫{' '}
        <code>data/{app}/pages.json</code>，其他分頁 / <code>/live</code>{' '}
        頁面會透過 HMR 立即看到最新內容；按「從檔案系統讀取（覆蓋）」則反向把磁碟上的內容
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
    app ? resolveInitialAppPages(app, diskNsInitial).map(toEditablePage) : []
  );
  const [showJson, setShowJson] = useState(false);
  const [writeBack, setWriteBack] = useState<WriteBackState>({ status: 'idle' });
  const [readBack, setReadBack] = useState<WriteBackState>({ status: 'idle' });

  // app 切換時重新從 localStorage / 磁碟載入
  useEffect(() => {
    if (!app) {
      setPages([]);
      return;
    }
    idCounter = 0;
    setPages(resolveInitialAppPages(app, initialPagesData[app]).map(toEditablePage));
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
    setPages([...pages, { id, title: '新頁面', nodes: [] }]);
  }

  function deletePage(index: number) {
    const copy = pages.slice();
    copy.splice(index, 1);
    setPages(copy);
  }

  const allJson = JSON.stringify(pages.map(toPageDef), null, 2);

  function download() {
    const blob = new Blob([allJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
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
    setWriteBack({ status: 'saving' });
    const merged: PagesData = { ...initialPagesData, [app!]: pages.map(toPageDef) };
    const result = await postPagesToDisk(merged);
    setWriteBack({ status: result.ok ? 'success' : 'error', message: result.message });
  }

  async function readFromDisk() {
    if (
      !window.confirm(
        `確定要用磁碟上 data/${app}/pages.json 的內容覆蓋瀏覽器中「${app}」目前的編輯狀態嗎？此動作無法復原（會直接覆蓋，不會 merge）。`
      )
    ) {
      return;
    }
    setReadBack({ status: 'saving' });
    const result = await fetchAppPagesFromDisk(app!);
    if (!result.ok) {
      setReadBack({ status: 'error', message: result.message });
      return;
    }
    const all = loadLocalPagesData();
    saveLocalPagesData({ ...all, [app!]: result.pages });
    idCounter = 0;
    setPages(result.pages.map(toEditablePage));
    setReadBack({ status: 'success', message: result.message });
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link to="/live" className={styles.backLink}>
          ← 回到即時預覽清單
        </Link>
        <div className={styles.toolbarActions}>
          <button type="button" className={styles.smallBtn} onClick={() => setShowJson((v) => !v)}>
            {showJson ? '隱藏 JSON' : '預覽整份 JSON'}
          </button>
          <button type="button" className={styles.primaryBtn} onClick={download}>
            下載整份 pages.json
          </button>
          <button type="button" className={styles.primaryBtn} onClick={printJson}>
            列印整份 JSON
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={readFromDisk}
            disabled={readBack.status === 'saving'}
          >
            {readBack.status === 'saving' ? '讀取中…' : '從檔案系統讀取（覆蓋）'}
          </button>
          <button
            type="button"
            className={styles.successBtn}
            onClick={writeToDisk}
            disabled={writeBack.status === 'saving'}
          >
            {writeBack.status === 'saving' ? '寫入中…' : '寫入檔案系統'}
          </button>
        </div>
      </div>

      <WriteBackStatus state={writeBack} />
      <WriteBackStatus state={readBack} />

      <h1>
        編輯所有頁面 <span className={styles.id}>（app: {app}）</span>
      </h1>
      <p className={styles.hint}>
        所有編輯（新增/刪除/修改頁面）即時同步到瀏覽器 <code>localStorage</code>，
        重新整理分頁不會遺失。可個別展開頁面編輯，或直接下載/列印整份陣列；
        按「寫入檔案系統」（僅限 <code>npm run dev</code>）可將目前整份陣列直接覆寫
        <code>data/{app}/pages.json</code>，透過 HMR 讓 <code>/live</code>{' '}
        頁面立即反映最新內容；按「從檔案系統讀取（覆蓋）」則反向把磁碟上的內容覆蓋回
        瀏覽器的編輯狀態。
      </p>

      <button type="button" className={styles.smallBtn} onClick={addPage}>
        + 新增頁面
      </button>

      {pages.map((p, i) => (
        <details key={p.id + i} className={styles.pageDetails} open={pages.length <= 2}>
          <summary className={styles.pageSummary}>
            {p.title || '(未命名)'} <span className={styles.id}>({p.id})</span>
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