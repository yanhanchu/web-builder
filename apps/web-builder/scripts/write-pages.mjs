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

/** 驗證 i18nBindings 的形狀：{ text?: Record<path,key>, props?: Record<path, Record<propName,key>> }，
 *  所有 key/value 都必須是字串。找不到欄位、或整個欄位不存在都算合法（純選填）。 */
function isValidI18nBindings(bindings) {
  if (bindings === undefined) return true;
  if (bindings == null || typeof bindings !== 'object' || Array.isArray(bindings)) return false;
  const { text, props, ...rest } = bindings;
  if (Object.keys(rest).length > 0) return false;
  if (text !== undefined) {
    if (text == null || typeof text !== 'object' || Array.isArray(text)) return false;
    if (!Object.values(text).every((v) => typeof v === 'string')) return false;
  }
  if (props !== undefined) {
    if (props == null || typeof props !== 'object' || Array.isArray(props)) return false;
    for (const perNodeProps of Object.values(props)) {
      if (perNodeProps == null || typeof perNodeProps !== 'object' || Array.isArray(perNodeProps)) return false;
      if (!Object.values(perNodeProps).every((v) => typeof v === 'string')) return false;
    }
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
    if (!isValidI18nBindings(page.i18nBindings)) {
      return { error: `app "${app}"：page "${page.id}" 的 i18nBindings 格式不合法` };
    }
  }

  // 保留 i18nBindings（若有）：先前這裡只複製 id/title/nodes，會讓每次「寫入
  // 檔案系統」把使用者在 NodeEditor 綁定好的 i18n key 對照全部悄悄丟掉。
  // 同時把 i18nBindings 攤平標註回每個節點的 props（見 annotateNodesWithI18n），
  // 讓 pages.json 本身就看得出「哪個節點的哪個 prop 對應哪個 i18n key」，
  // 不需要額外對照 path。
  const cleanPages = pages.map((page) => {
    const nodes = page.i18nBindings
      ? annotateNodesWithI18n(page.nodes, page.i18nBindings)
      : page.nodes;
    return {
      id: page.id,
      title: page.title,
      nodes,
      ...(page.i18nBindings ? { i18nBindings: page.i18nBindings } : {}),
    };
  });

  return { cleanPages };
}

/**
 * 把 i18nBindings（path -> key 的 sidecar）攤平標註回節點樹本身，純粹給
 * `data/{app}/pages.json` 這份檔案「人類可讀」用：在對應節點的
 * `props.__i18n` 加上 `{ [propName 或 "$text"]: i18nKey }`。
 *
 * 這個欄位只在寫檔時附加，不是真正的資料來源（i18nBindings 才是，前端
 * 讀回來後仍是照 i18nBindings 還原成 nodeProps/i18nKey，見 page-editor.tsx
 * 的 toEditable），也不會被 dynamic-renderer.tsx / generate-pages.mjs 拿來
 * 渲染或生成——只是讓人（或 code review）打開 pages.json 就能直接看出綁定
 * 關係，不需要另外對照一份用路徑索引的 sidecar。
 */
function annotateNodesWithI18n(nodes, bindings, path = '') {
  return nodes.map((node, i) => {
    const nodePath = path ? `${path}.${i}` : String(i);
    if (typeof node === 'string') {
      const key = bindings.text?.[nodePath];
      return key ? { __text: node, __i18nKey: key } : node;
    }
    const propBindings = bindings.props?.[nodePath];
    const next = { ...node };
    if (propBindings && Object.keys(propBindings).length > 0) {
      next.props = { ...(next.props ?? {}), __i18n: { ...propBindings } };
    }
    if (Array.isArray(node.children)) {
      next.children = annotateNodesWithI18n(node.children, bindings, nodePath);
    }
    return next;
  });
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
 * 把 annotateNodesWithI18n 寫進去的 `props.__i18n` / `{ __text, __i18nKey }`
 * 標註還原成一般節點：這些標註只是給人看 pages.json 用的展示層，讀回來給
 * 前端（或再次寫入時當作輸入）時要拿掉，維持節點樹是單純的
 * `string | ComponentNode`，跟 `i18nBindings` 各自的職責不混在一起。
 */
function stripI18nAnnotations(nodes) {
  return nodes.map((node) => {
    if (typeof node === 'string') return node;
    if (node && typeof node === 'object' && '__text' in node && '__i18nKey' in node) {
      return node.__text;
    }
    const next = { ...node };
    if (next.props && typeof next.props === 'object' && '__i18n' in next.props) {
      const { __i18n, ...restProps } = next.props;
      next.props = restProps;
    }
    if (Array.isArray(next.children)) {
      next.children = stripI18nAnnotations(next.children);
    }
    return next;
  });
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
    const pages = readJsonFile(appPagesFile(app), []);
    pagesData[app] = pages.map((page) => ({
      ...page,
      nodes: Array.isArray(page.nodes) ? stripI18nAnnotations(page.nodes) : page.nodes,
    }));
  }
  return pagesData;
}

export { toRelative };
