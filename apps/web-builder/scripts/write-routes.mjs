/**
 * 把「路由管理」（/routes，RouteManager）編輯好的 routes 資料寫回
 * `data/{app}/routes.json`。
 *
 * 僅在 `vite dev` 的 middleware（見 write-routes-plugin.mjs）被呼叫，
 * build 產物不含這支腳本的呼叫路徑，不會有寫檔 API 外洩到正式環境的疑慮。
 *
 * 檔案配置：`data/{app}/routes.json`（每個 app 一個檔案，跟 app.json /
 * pages.json / i18n/ 同一層）。
 *
 * 對外的資料形狀維持 `{ [app]: RouteEntry[] }`（RoutesData）不變，這一層
 * 負責 map <-> 個別檔案 的轉換，呼叫端（plugin / 前端）無感，跟
 * write-pages.mjs 是同一套模式。
 */
import {
  isSafeId,
  readJsonFile,
  writeJsonFile,
  appRoutesFile,
  listAppDirs,
  toRelative,
} from './app-fs.mjs';

/** path 只允許英數字、連字號、底線、斜線，且不可為空（跟前端 isValidRoutePath 一致） */
function isValidRoutePath(path) {
  if (typeof path !== 'string') return false;
  const trimmed = path.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return false;
  return /^[a-zA-Z0-9_\-/]+$/.test(trimmed);
}

/** 驗證單一 app 底下的 RouteEntry[] 陣列，回傳清理過（只保留合法欄位）的陣列，失敗回傳 error 訊息 */
function validateAppRoutes(app, routes) {
  if (!Array.isArray(routes)) {
    return { error: `app "${app}" 的內容必須是陣列` };
  }

  const seenIds = new Set();
  const seenPaths = new Set();
  for (const route of routes) {
    if (route == null || typeof route !== 'object' || Array.isArray(route)) {
      return { error: `app "${app}"：每筆路由都必須是物件` };
    }
    if (typeof route.id !== 'string' || route.id.length === 0) {
      return { error: `app "${app}"：不合法的路由 id：${JSON.stringify(route.id)}` };
    }
    if (seenIds.has(route.id)) {
      return { error: `app "${app}"：重複的路由 id：${route.id}` };
    }
    seenIds.add(route.id);

    if (!isValidRoutePath(route.path)) {
      return { error: `app "${app}"：不合法的路徑：${JSON.stringify(route.path)}` };
    }
    const normalizedPath = route.path.trim().replace(/^\/+|\/+$/g, '');
    if (seenPaths.has(normalizedPath)) {
      return { error: `app "${app}"：重複的路徑：${normalizedPath}` };
    }
    seenPaths.add(normalizedPath);

    if (route.targetType !== 'page' && route.targetType !== 'url') {
      return { error: `app "${app}"：路由 "${normalizedPath}" 的 targetType 必須是 "page" 或 "url"` };
    }
    if (route.targetType === 'page') {
      if (typeof route.pageId !== 'string' || route.pageId.length === 0) {
        return { error: `app "${app}"：路由 "${normalizedPath}" 缺少合法的 pageId` };
      }
    } else {
      if (typeof route.targetUrl !== 'string' || route.targetUrl.trim().length === 0) {
        return { error: `app "${app}"：路由 "${normalizedPath}" 缺少合法的 targetUrl` };
      }
    }
    if ('description' in route && route.description != null && typeof route.description !== 'string') {
      return { error: `app "${app}"：路由 "${normalizedPath}" 的 description 必須是字串` };
    }
  }

  const cleanRoutes = routes.map((route) => ({
    id: route.id,
    path: route.path.trim().replace(/^\/+|\/+$/g, ''),
    targetType: route.targetType,
    ...(route.targetType === 'page' ? { pageId: route.pageId } : { targetUrl: route.targetUrl.trim() }),
    ...(route.description ? { description: route.description } : {}),
  }));

  return { cleanRoutes };
}

/**
 * 驗證並寫入整份 routesData（app -> RouteEntry[]）：
 * 每個 app 各自寫進 `data/{app}/routes.json`。
 *
 * @param {object} params
 * @param {unknown} params.routesData  應為 Record<app, RouteEntry[]> 物件
 * @returns {{ ok: true, writtenFiles: string[], appCount: number, routeCount: number } | { ok: false, error: string }}
 */
export function writeRoutesToDisk({ routesData }) {
  try {
    if (routesData == null || typeof routesData !== 'object' || Array.isArray(routesData)) {
      return { ok: false, error: 'routesData 必須是物件（app -> RouteEntry[]）' };
    }

    const apps = Object.keys(routesData);
    for (const app of apps) {
      if (!isSafeId(app)) {
        return { ok: false, error: `不合法的 app 名稱：${JSON.stringify(app)}（只允許英數字、底線、連字號）` };
      }
    }

    const cleaned = {};
    let routeCount = 0;
    for (const app of apps) {
      const result = validateAppRoutes(app, routesData[app]);
      if (result.error) {
        return { ok: false, error: result.error };
      }
      cleaned[app] = result.cleanRoutes;
      routeCount += result.cleanRoutes.length;
    }

    const writtenFiles = [];
    for (const app of apps) {
      const filePath = appRoutesFile(app);
      writeJsonFile(filePath, cleaned[app]);
      writtenFiles.push(toRelative(filePath));
    }

    return {
      ok: true,
      writtenFiles,
      appCount: apps.length,
      routeCount,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 讀取目前磁碟上所有 app 的 routes.json，組成 RoutesData
 * （`{ [app]: RouteEntry[] }`），供 GET API 使用。
 */
export function readAllRoutesFromDisk() {
  const routesData = {};
  for (const app of listAppDirs()) {
    routesData[app] = readJsonFile(appRoutesFile(app), []);
  }
  return routesData;
}

export { toRelative };
