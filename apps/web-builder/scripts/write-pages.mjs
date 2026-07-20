/**
 * 把 `/live/edit`（AppManager / PageEditorRoute / PagesEditorIndex）編輯好的
 * pages 資料寫回 `data/{app}/pages.json`。
 *
 * 僅在 `vite dev` 的 middleware（見 write-pages-plugin.mjs）被呼叫，
 * build 產物不含這支腳本的呼叫路徑，不會有寫檔 API 外洩到正式環境的疑慮。
 *
 * 檔案配置：`data/{app}/pages.json`（每個 app 一個檔案，收在該
 * app 專屬的資料夾底下，跟 app.json / i18n/ 同一層 —— app 是一個
 * app / workspace 的概念，`data/{app}/` 就是它的資料夾）。
 *
 * 對外的資料形狀維持 `{ [app]: PageDef[] }`（PagesData）不變，只是
 * 底層存放方式從「單一 data/pages.json 檔案」改成「逐 app 個別檔案」，
 * 讀寫時在這一層做 map <-> 個別檔案 的轉換，呼叫端（plugin / 前端）無感。
 */
import {
  isSafeId,
  readJsonFile,
  writeJsonFile,
  appPagesFile,
  listAppDirs,
  toRelative,
} from './app-fs.mjs';

/** 遞迴驗證單一 PageNode（string 或 ComponentNode）的形狀是否合法 */
function isValidNode(node) {
  if (typeof node === 'string') return true;
  if (node == null || typeof node !== 'object' || Array.isArray(node)) return false;
  if (typeof node.component !== 'string' || node.component.length === 0) return false;
  if ('props' in node && (node.props == null || typeof node.props !== 'object' || Array.isArray(node.props))) {
    return false;
  }
  if ('children' in node) {
    if (!Array.isArray(node.children)) return false;
    return node.children.every(isValidNode);
  }
  return true;
}

/** 驗證單一 app 底下的 PageDef[] 陣列，回傳清理過（只保留合法欄位）的陣列，失敗回傳 error 訊息 */
function validateAppPages(app, pages) {
  if (!Array.isArray(pages)) {
    return { error: `app "${app}" 的內容必須是陣列` };
  }

  const seenIds = new Set();
  for (const page of pages) {
    if (page == null || typeof page !== 'object' || Array.isArray(page)) {
      return { error: `app "${app}"：每個 page 都必須是物件` };
    }
    if (!isSafeId(page.id)) {
      return {
        error: `app "${app}"：不合法的 page id：${JSON.stringify(page.id)}（只允許英數字、底線、連字號）`,
      };
    }
    if (seenIds.has(page.id)) {
      return { error: `app "${app}"：重複的 page id：${page.id}` };
    }
    seenIds.add(page.id);

    if (typeof page.title !== 'string') {
      return { error: `app "${app}"：page "${page.id}" 缺少合法的 title` };
    }
    if (!Array.isArray(page.nodes)) {
      return { error: `app "${app}"：page "${page.id}" 的 nodes 必須是陣列` };
    }
    if (!page.nodes.every(isValidNode)) {
      return { error: `app "${app}"：page "${page.id}" 內含格式不合法的節點` };
    }
  }

  const cleanPages = pages.map((page) => ({
    id: page.id,
    title: page.title,
    nodes: page.nodes,
  }));

  return { cleanPages };
}

/**
 * 驗證並寫入整份 pagesData（app -> PageDef[]）：
 * 每個 app 各自寫進 `data/{app}/pages.json`。
 *
 * @param {object} params
 * @param {unknown} params.pagesData  應為 Record<app, PageDef[]> 物件
 * @returns {{ ok: true, appCount: number, pageCount: number } | { ok: false, error: string }}
 */
export function writePagesToDisk({ pagesData }) {
  try {
    if (pagesData == null || typeof pagesData !== 'object' || Array.isArray(pagesData)) {
      return { ok: false, error: 'pagesData 必須是物件（app -> PageDef[]）' };
    }

    const apps = Object.keys(pagesData);
    for (const app of apps) {
      if (!isSafeId(app)) {
        return { ok: false, error: `不合法的 app 名稱：${JSON.stringify(app)}（只允許英數字、底線、連字號）` };
      }
    }

    const cleaned = {};
    let pageCount = 0;
    for (const app of apps) {
      const result = validateAppPages(app, pagesData[app]);
      if (result.error) {
        return { ok: false, error: result.error };
      }
      cleaned[app] = result.cleanPages;
      pageCount += result.cleanPages.length;
    }

    const writtenFiles = [];
    for (const app of apps) {
      const filePath = appPagesFile(app);
      writeJsonFile(filePath, cleaned[app]);
      writtenFiles.push(toRelative(filePath));
    }

    return {
      ok: true,
      writtenFiles,
      appCount: apps.length,
      pageCount,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 讀取目前磁碟上所有 app 的 pages.json，組成 PagesData
 * （`{ [app]: PageDef[] }`），供 GET API 使用。
 * （前端本身改用 import.meta.glob 靜態掃描，見 src/lib/app-data.ts，
 * 不再需要任何聚合檔案。）
 */
export function readAllPagesFromDisk() {
  const pagesData = {};
  for (const app of listAppDirs()) {
    pagesData[app] = readJsonFile(appPagesFile(app), []);
  }
  return pagesData;
}

export { toRelative };
