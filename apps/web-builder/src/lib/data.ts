import type { AppsData, AppSettings } from '@/types/types';
import type { PagesData, PageDef } from '@/types/pages-types';
import { stripI18nAnnotations } from '@/lib/pages-i18n-annotations';

// ---------------------------------------------------------------------------
// 唯一資料來源：data/{app}/app.json、data/{app}/pages.json。
//
// 這裡不再有任何「聚合檔」（原本的 data/apps.json、data/pages.json）。
// 改用 Vite 的 `import.meta.glob`，在 build 期（跟 dev 期）直接靜態掃描
// 所有 `data/*/app.json` / `data/*/pages.json`，把結果組成跟原本聚合檔
// 形狀一致的 `{ [app]: ... }` 物件：
//
//   - `import.meta.glob` 的路徑 pattern 在編譯期就會被 Vite 解析、展開成
//     實際存在的檔案清單，不需要「知道有哪些 app」這件事先驗地存在
//     於任何一份固定檔案裡 —— 新增 / 刪除 `data/{app}/` 目錄，
//     下次 build（或 dev 重新載入這個模組）就會自動反映在結果裡，
//     不需要额外手動把新 app「加進某份清單」。
//   - `eager: true` 讓這些 json 直接被當成一般的靜態 import 處理
//     （產物內聯打包，build 完全不需要 dev server 或任何 runtime 讀檔）。
//   - dev 模式下，這幾個 json 本身的改動（例如 /admin 頁面寫回磁碟後）
//     一樣會觸發 Vite 對這些被 import 的檔案做 HMR；因為 glob 匯入的每個
//     檔案都各自是獨立模組、彼此不會互相影響 Context 或其他物件的識別，
//     所以不會有先前「聚合檔 HMR 導致 Context 物件被重建」的問題。
// ---------------------------------------------------------------------------

const appModules = import.meta.glob('../../data/*/app.json', { eager: true }) as Record<
  string,
  { default: AppSettings }
>;

const pagesModules = import.meta.glob('../../data/*/pages.json', { eager: true }) as Record<
  string,
  { default: PageDef[] }
>;

/** 從 glob 匯入的路徑（例如 `../../data/default/app.json`）取出中間的 app 名稱 */
function appFromGlobPath(globPath: string): string | null {
  const match = globPath.match(/\/data\/([^/]+)\/(?:app|pages)\.json$/);
  return match ? match[1] : null;
}

function buildAppsData(): AppsData {
  const result: AppsData = {};
  for (const [globPath, mod] of Object.entries(appModules)) {
    const app = appFromGlobPath(globPath);
    if (!app) continue;
    result[app] = mod.default;
  }
  return result;
}

function buildPagesData(): PagesData {
  const result: PagesData = {};
  for (const [globPath, mod] of Object.entries(pagesModules)) {
    const app = appFromGlobPath(globPath);
    if (!app) continue;
    // data/{app}/pages.json 可能含有寫檔時附加的 __i18n/__text 標註（純粹
    // 給人讀 JSON 用，見 pages-i18n-annotations.ts），讀進來組成 pagesData
    // 之前先還原成單純的節點樹，避免這份純展示用的標註意外被當成真的 prop
    // 或子節點內容渲染出來。
    result[app] = mod.default.map((page) => ({
      ...page,
      nodes: stripI18nAnnotations(page.nodes),
    }));
  }
  return result;
}

/**
 * 目前所有 app 的設定（app -> AppSettings）。
 * 直接由 `data/*\/app.json` 靜態掃描組成，取代原本的 data/apps.json。
 */
export const appsData: AppsData = buildAppsData();

/**
 * 目前所有 app 的頁面資料（app -> PageDef[]）。
 * 直接由 `data/*\/pages.json` 靜態掃描組成，取代原本的 data/pages.json。
 */
export const pagesData: PagesData = buildPagesData();

// ---------------------------------------------------------------------------
// Dev 模式下的即時更新：/admin、/live/edit 寫回磁碟後，各自對應的
// data/{app}/app.json、data/{app}/pages.json 會被 Vite 偵測到並
// 讓這個模組（app-data.ts）整個 HMR 重新求值。我們用
// import.meta.hot.accept() 自己接手這次更新，把重新算好的
// appsData / pagesData 推給訂閱者，畫面立即反映、不用整頁重新整理，
// 也不會有路由狀態跳掉的問題。
//
// 因為只有「資料」這個模組被 accept、Context 物件本身定義在完全不同的檔案
// （app-context-core.tsx，見該檔案說明），所以這裡的 HMR 不會影響到
// 任何 React Context 的識別，不會重現先前「useApp must be used
// within a AppProvider」那個問題。
// ---------------------------------------------------------------------------

type Listener = (next: { appsData: AppsData; pagesData: PagesData }) => void;
const listeners = new Set<Listener>();

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (!newModule) return;
    const next = newModule as unknown as {
      appsData: AppsData;
      pagesData: PagesData;
    };
    listeners.forEach((fn) => fn(next));
  });
}

export function subscribeAppData(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}