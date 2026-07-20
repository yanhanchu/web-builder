import { createElement, Fragment, useEffect, useState, type ReactNode } from 'react';
import { getComponentById, loadComponentModule } from '@workspace/ui/lib/generator/component-registry';
import type { PageNode } from '@/types/pages-types';

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

/** 遞迴把單一節點（字串或 component 節點）轉成 ReactNode。 */
function renderNode(node: PageNode, key: string | number): ReactNode {
  if (typeof node === 'string') {
    return node;
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
    return (
      <span key={key} className="text-destructive">
        ⚠ 找不到 component id "{component}"（請確認 data/components.json 存在此
        id，或先執行 npm run docs:generate）
      </span>
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

  const childNodes = Array.isArray(children)
    ? children.map((child, i) => renderNode(child, i))
    : undefined;

  return createElement(
    entry.Component!,
    { key, ...props },
    ...(childNodes ?? [])
  );
}

interface DynamicRendererProps {
  nodes: PageNode[];
}

/**
 * 把一組 PageNode 遞迴渲染成實際畫面。
 * 內部會依賴 moduleCache 做動態 import，載入完成後透過訂閱機制觸發重新渲染，
 * 所以第一次渲染某個新用到的組件時會短暫顯示「載入中」，之後就是同步渲染。
 */
export function DynamicRenderer({ nodes }: DynamicRendererProps) {
  useModuleCacheVersion();
  return (
    <Fragment>
      {nodes.map((node, i) => (
        <Fragment key={i}>{renderNode(node, i)}</Fragment>
      ))}
    </Fragment>
  );
}
