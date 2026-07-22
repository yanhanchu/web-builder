import { Component, createElement, Fragment, useEffect, useState, type ReactNode } from 'react';
import { getComponentById, loadComponentModule } from '@workspace/ui/lib/generator/component-registry';
import type { PageNode } from '@/types/pages-types';
import type { BindingMap } from '@/types/binding-types';
import { loadI18nData } from '@/store/i18n-storage';

/**
 * runtime 版的「JSON -> JSX」渲染器。
 *
 * 跟 scripts/generate-pages.mjs 做的事情概念上一樣（把 data/pages.json
 * 的節點樹對照 data/components.json 轉成實際畫面），差別是：
 *   - generate-pages.mjs 是 build-time 產生 .tsx 原始碼字串，寫到磁碟，
 *     之後就是普通、跟手寫一樣的靜態頁面（零 runtime 成本，但改 json 要重新產生 + reload）。
 *   - 這裡是 runtime 直接把 JSON 節點樹遞迴 createElement 出來，
 *     並用 registry.loadComponentModule 動態 import 對應組件本體，
 *     所以 pages.json 的任何改動都能「不重新產生檔案」就立即反映在畫面上
 *     （由 Vite 對 JSON 檔案的 HMR 觸發重新渲染）。
 *
 * 兩條路徑並存，各自對應不同情境：
 *   - 想要「正式產物、可以 code review、可以離線編譯」-> npm run pages:generate
 *   - 想要「編輯 json 立刻在畫面上看到結果」            -> 這個 runtime 渲染器
 */

interface ModuleCacheEntry {
  status: 'loading' | 'ready' | 'error';
  Component?: React.ComponentType<Record<string, unknown>>;
  message?: string;
}

// 模組載入是 async 的，但同一個 importPath 在一次渲染中可能被用到很多次（例如
// Card 跟 CardHeader 是同一個檔案），所以用一個簡單的模組層級快取，
// 避免重複 import()，也讓子節點能同步判斷「是否已經載入過」。
const moduleCache = new Map<string, ModuleCacheEntry>();
const subscribers = new Set<() => void>();

function notifyAll() {
  subscribers.forEach((fn) => fn());
}

function ensureLoaded(componentId: string): ModuleCacheEntry {
  const meta = getComponentById(componentId);
  if (!meta) {
    return { status: 'error', message: `找不到 component id "${componentId}"` };
  }

  const cacheKey = meta.importPath;
  const existing = moduleCache.get(cacheKey);
  if (existing) return existing;

  const entry: ModuleCacheEntry = { status: 'loading' };
  moduleCache.set(cacheKey, entry);

  loadComponentModule(meta.importPath)
    .then((mod) => {
      const Component = mod[meta.componentName] as
        | React.ComponentType<Record<string, unknown>>
        | undefined;
      if (!Component) {
        moduleCache.set(cacheKey, {
          status: 'error',
          message: `模組 "${meta.importPath}" 中找不到具名 export "${meta.componentName}"`,
        });
      } else {
        moduleCache.set(cacheKey, { status: 'ready', Component });
      }
      notifyAll();
    })
    .catch((err) => {
      moduleCache.set(cacheKey, { status: 'error', message: err.message ?? String(err) });
      notifyAll();
    });

  return entry;
}

/** 訂閱模組快取的變化，用來在動態 import 完成後觸發重新渲染。 */
function useModuleCacheVersion() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);
}

/**
 * 包住單一節點的 render 結果：某些元件在特定 props 組合下 render 時會直接
 * throw（例如 Avatar 必填欄位沒填），若不攔截，會讓 React 整棵樹（往上到
 * 最近的 error boundary，這裡沒有的話就是整個 app）連帶炸掉，使用者連
 * 「選取這個節點來修正/刪除它」的機會都沒有。
 *
 * 這裡用 class component 實作 `getDerivedStateFromError`（React 目前仍只有
 * class component 能攔截 render 階段的錯誤），每個節點各自包一層，錯誤只會
 * 侷限在這一個節點，兄弟節點與其餘畫面不受影響。抓到錯誤後改用
 * `renderFallback` 畫一個跟「找不到 component id」一致的可點選佔位框
 * （帶 data-node-path/data-node-kind），編輯模式下仍可被選取、更換或刪除；
 * 原始 JSON 資料完全不變，只是換一種方式呈現「這個節點目前壞掉了」。
 *
 * `resetKey` 變動（節點的 props/component id 改變）時重新嘗試 render 一次，
 * 讓使用者在面板改完設定、修好問題後畫面能立即恢復正常，不需要重新整理頁面。
 */
class NodeErrorBoundary extends Component<
  { resetKey: string; renderFallback: (message: string) => ReactNode; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return this.props.renderFallback(this.state.error.message || String(this.state.error));
    }
    return this.props.children;
  }
}

/**
 * 寬鬆判斷一個 prop 值是否「看起來像」PageNode（component 節點），用來決定
 * 是否要把它當成子節點樹遞迴渲染，而不是原封不動當作 prop 值傳下去。純字串
 * 不算在內——一般字串 prop 太常見，交由 `props[name]` 原樣傳遞即可，只有帶
 * `component` 欄位的物件才視為節點樹（對應 page-editor.tsx 的 nodeProps 輸出）。
 */
function isPageNodeLike(value: unknown): value is PageNode {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { component?: unknown }).component === 'string'
  );
}

/**
 * 「這個節點目前壞掉了」的共用佔位畫面：找不到 component id、或 render 時
 * throw（NodeErrorBoundary 攔截到）都用同一種呈現方式，讓使用者一眼就能
 * 認出這類節點，並在編輯模式下維持可點選（帶 data-node-path/data-node-kind）。
 * 非編輯模式（純預覽）不需要互動性，只顯示簡短警告文字。
 */
function renderBrokenNodePlaceholder(
  key: string | number,
  path: string,
  editable: boolean,
  label: string,
  message: string
): ReactNode {
  if (!editable) {
    return (
      <span key={key} className="text-destructive">
        ⚠ {label}：{message}
      </span>
    );
  }
  return (
    <span
      key={key}
      data-node-path={path}
      data-node-kind="component"
      data-node-broken="true"
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-destructive/50 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
      title={`${label}：${message}（點選以修改或刪除此節點，原始資料仍會保留）`}
    >
      ⚠ {label}
    </span>
  );
}

/** 遞迴把單一節點（字串或 component 節點）轉成 ReactNode。
 *  `path` 對應 `PageDef.bindings` 使用的路徑格式（見 `@/types/binding-types`
 *  的說明），`resolveI18n` 是「給 key，回傳目前語系的值（找不到回傳
 *  undefined）」的查找函式，由外層 `DynamicRenderer` 依 app 準備好。 */
function renderNode(
  node: PageNode,
  key: string | number,
  path: string,
  bindings: BindingMap | undefined,
  resolveI18n: (i18nKey: string) => string | undefined,
  editable: boolean
): ReactNode {
  if (typeof node === 'string') {
    const boundKey = bindings?.[path]?.find((b) => b.kind === 'i18n')?.refKey;
    const resolved = boundKey ? resolveI18n(boundKey) : undefined;
    const text = resolved ?? node;
    // 找不到對應翻譯時 fallback 回原本寫死的字面內容，而不是顯示空白，
    // 避免漏翻譯的 key 導致畫面上整塊文字不見。
    if (!editable) return text;
    // 編輯模式下，文字節點也要能被點選，用一個不影響版面的 inline span 包住，
    // 帶上 data-node-path 讓外層的點擊代理（click delegation）辨識出這是哪個節點。
    return (
      <span key={key} data-node-path={path} data-node-kind="text" className="outline-none">
        {text}
      </span>
    );
  }

  const { component, props = {}, children } = node;

  if (!component || typeof component !== 'string') {
    return (
      <span key={key} className="text-destructive">
        ⚠ 節點缺少 "component" 欄位
      </span>
    );
  }

  const meta = getComponentById(component);
  if (!meta) {
    // 找不到對應 component id（例如元件庫改版、id 被改名，或資料本身壞掉）。
    // 編輯模式下仍要帶 data-node-path/data-node-kind，否則外層的點擊代理
    // （EditableCanvas 的 closest('[data-node-path]')）永遠找不到這個節點，
    // 使用者會卡在「看得到但選不到、刪不掉」的狀態。純預覽（非 editable）
    // 則維持原本的警告文字，不需要可互動性。
    return renderBrokenNodePlaceholder(
      key,
      path,
      editable,
      `未知元件「${component}」`,
      `找不到 component id "${component}"（請確認 data/components.json 存在此 id，或先執行 npm run docs:generate）`
    );
  }

  const entry = ensureLoaded(component);

  if (entry.status === 'loading') {
    return (
      <span key={key} className="opacity-50">
        載入 {meta.componentName} 中…
      </span>
    );
  }
  if (entry.status === 'error') {
    return (
      <span key={key} className="text-destructive">
        ⚠ {meta.componentName}: {entry.message}
      </span>
    );
  }

  // 依 bindings 把綁定的 string props 換成目前語系的值（找不到就沿用原本的 prop 值）。
  const withI18n = Object.fromEntries(
    Object.entries(props).map(([name, value]) => {
      const boundKey = bindings?.[`${path}#${name}`]?.find((b) => b.kind === 'i18n')?.refKey;
      if (!boundKey) return [name, value];
      const resolved = resolveI18n(boundKey);
      return [name, resolved ?? value];
    })
  );

  // `ReactNode` 型別的 prop 若存的是一個 PageNode / PageNode[]（component
  // 節點編輯器允許把子節點樹「塞進某個 prop」，見 page-editor.tsx 的
  // `nodeProps`），這裡要遞迴渲染成真正的 ReactNode，而不是把原始物件/陣列
  // 直接當 prop 值傳給元件。
  const resolvedProps = Object.fromEntries(
    Object.entries(withI18n).map(([name, value]) => {
      if (isPageNodeLike(value)) {
        return [
          name,
          renderNode(value, `${key}-${name}`, `${path}#${name}.0`, undefined, resolveI18n, false),
        ];
      }
      if (Array.isArray(value) && value.length > 0 && value.every(isPageNodeLike)) {
        return [
          name,
          value.map((child, i) =>
            renderNode(child, `${key}-${name}-${i}`, `${path}#${name}.${i}`, undefined, resolveI18n, false)
          ),
        ];
      }
      return [name, value];
    })
  );

  const childNodes = Array.isArray(children)
    ? children.map((child, i) =>
        renderNode(child, i, path ? `${path}.${i}` : String(i), bindings, resolveI18n, editable)
      )
    : undefined;

  // 編輯模式下，把 data-node-path / data-node-kind 一併 spread 進元件 props——
  // 這個 UI 套件裡的元件都是 `{...rest}` spread 到底層 DOM 元素（見
  // packages/ui/src/components/*），所以這兩個 data-* 屬性會安全地落到
  // 實際渲染出來的 DOM 節點上，外層點擊代理才能用 closest('[data-node-path]')
  // 找到「使用者實際點到的是哪一個節點」，不需要額外包一層 wrapper 破壞版面。
  const editableProps = editable
    ? { 'data-node-path': path, 'data-node-kind': 'component' }
    : undefined;

  const element = createElement(
    entry.Component!,
    { key, ...resolvedProps, ...editableProps },
    ...(childNodes ?? [])
  );

  // 保險層：不是每個元件都會把不認得的 props（例如這裡塞的 data-node-path）
  // `{...rest}` 到底層 DOM 上（過去 Avatar / Badge 就是這樣，導致點擊代理
  // 找不到對應節點、選不到也刪不掉）。用一個 `display: contents` 的
  // wrapper span 包住，該 wrapper 本身不影響版面（不佔盒子、不影響 flex/grid
  // 排列），但仍是 DOM 樹的一部分，`closest('[data-node-path]')` 往上找的時候
  // 一定找得到，不管內層元件本身有沒有正確透傳這個屬性。
  const wrapped = editable ? (
    <span
      key={key}
      data-node-path={path}
      data-node-kind="component"
      style={{ display: 'contents' }}
    >
      {element}
    </span>
  ) : (
    element
  );

  // resetKey 隨這個節點的 component id / props / children 內容變化，讓面板
  // 修改完設定後（例如補上必填欄位）能立即跳出「壞掉」狀態、重新嘗試 render，
  // 不需要重新整理整頁。
  const resetKey = JSON.stringify({ component, props: withI18n, children });

  return (
    <NodeErrorBoundary
      key={key}
      resetKey={resetKey}
      renderFallback={(message) =>
        renderBrokenNodePlaceholder(
          key,
          path,
          editable,
          `${meta.componentName} 渲染失敗`,
          message
        )
      }
    >
      {wrapped}
    </NodeErrorBoundary>
  );
}

interface DynamicRendererProps {
  nodes: PageNode[];
  /** 選填：這份 nodes 對應的欄位綁定 sidecar（來自 `PageDef.bindings`）。
   *  不提供時等同完全沒有任何綁定，行為與原本一致。 */
  bindings?: BindingMap;
  /** 選填：目前 app（用來查 i18n 字典）；不提供時即使有綁定也不會被解析，直接顯示 fallback 字面值。 */
  app?: string;
  /** 選填：指定要用哪個語系；不提供時預設取該 app 底下第一個（依字母排序）語系。 */
  locale?: string;
  /** 選填：編輯模式。開啟時每個節點都會帶上 `data-node-path`/`data-node-kind`，
   *  供外層點擊代理（例如 live-workspace.tsx 的可視化編輯器）辨識點擊到哪個節點。
   *  純預覽（如 dynamic-page.tsx）不需要傳，行為與原本完全一致。 */
  editable?: boolean;
}

/**
 * 把一組 PageNode 遞迴渲染成實際畫面。
 * 內部會依賴 moduleCache 做動態 import，載入完成後透過訂閱機制觸發重新渲染，
 * 所以第一次渲染某個新用到的組件時會短暫顯示「載入中」，之後就是同步渲染。
 *
 * 若傳入 `bindings` + `app`，會額外把綁定的文字節點 / props 換成
 * 目前語系的 i18n 值（見 page-editor.tsx 綁定 UI 與 `@/types/binding-types`）。
 */
export function DynamicRenderer({ nodes, bindings, app, locale, editable = false }: DynamicRendererProps) {
  useModuleCacheVersion();

  function resolveI18n(i18nKey: string): string | undefined {
    if (!app) return undefined;
    const data = loadI18nData();
    const nsData = data[app];
    if (!nsData) return undefined;
    const localeToUse = locale ?? Object.keys(nsData).sort()[0];
    if (!localeToUse) return undefined;
    return nsData[localeToUse]?.[i18nKey];
  }

  return (
    <Fragment>
      {nodes.map((node, i) => (
        <Fragment key={i}>{renderNode(node, i, String(i), bindings, resolveI18n, editable)}</Fragment>
      ))}
    </Fragment>
  );
}