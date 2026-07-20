import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { allComponents, getComponentById } from '@workspace/ui/lib/generator/component-registry';
import type { PageDef, PageNode, ComponentNode, PagesData } from '@/types/pages-types';
import { pagesData as initialPagesData } from '@/lib/data';
import { loadLocalPagesData, saveLocalPagesData, resolveInitialAppPages } from '@/store/pages-storage';
import { writePagesToDisk as writePagesToDiskApi, readPagesFromDisk } from '@/lib/pages-disk-api';
import { editorStyles as styles } from '@/styles/page-editor-styles';
import { cn } from '@workspace/ui/utils/utils';
import { useApp } from '@/hooks/app/context';

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
type EditableNode =
  | { key: string; kind: 'text'; value: string }
  | {
      key: string;
      kind: 'component';
      component: string;
      props: Record<string, unknown>;
      children: EditableNode[];
    };

function toEditable(node: PageNode): EditableNode {
  if (typeof node === 'string') {
    return { key: nextKey(), kind: 'text', value: node };
  }
  return {
    key: nextKey(),
    kind: 'component',
    component: node.component,
    props: { ...(node.props ?? {}) },
    children: (node.children ?? []).map(toEditable),
  };
}

function toPageNode(node: EditableNode): PageNode {
  if (node.kind === 'text') return node.value;
  const out: ComponentNode = { component: node.component };
  if (Object.keys(node.props).length > 0) out.props = node.props;
  if (node.children.length > 0) out.children = node.children.map(toPageNode);
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

interface NodeEditorProps {
  node: EditableNode;
  depth: number;
  onChange: (next: EditableNode) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function NodeEditor({ node, depth, onChange, onDelete, onMoveUp, onMoveDown }: NodeEditorProps) {
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

  function addChild(kind: 'text' | 'component') {
    if (node.kind !== 'component') return;
    const child = kind === 'text' ? makeNewTextNode() : makeNewComponentNode(allComponents[0]?.id ?? '');
    onChange({ ...node, children: [...node.children, child] });
  }

  return (
    <div className={cn(styles.node, depth > 0 && 'ml-5')}>
      <div className={styles.nodeHeader}>
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
        <textarea
          className={styles.textInput}
          value={node.value}
          rows={2}
          onChange={(e) => onChange({ ...node, value: e.target.value })}
        />
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
                    <input
                      className={styles.textFieldInput}
                      type={p.type === 'number' ? 'number' : 'text'}
                      value={propValueToInputString(node.props[p.name])}
                      placeholder={p.defaultValue ?? ''}
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
                  )}
                </label>
              ))}
            </div>
          )}

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
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 單一頁面（PageDef）的編輯畫面：id / title + nodes 樹。 */
function PageDefEditor({
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
        />
      ))}
    </div>
  )
}

interface EditablePageDef {
  id: string;
  title: string;
  nodes: EditableNode[];
}

function toEditablePage(page: PageDef): EditablePageDef {
  return { id: page.id, title: page.title, nodes: page.nodes.map(toEditable) };
}

function toPageDef(page: EditablePageDef): PageDef {
  return { id: page.id, title: page.title, nodes: page.nodes.map(toPageNode) };
}

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