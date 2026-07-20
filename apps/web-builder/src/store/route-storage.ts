// localStorage 存取層：路由管理（app 底下的子功能）目前的編輯狀態。
//
// 底層邏輯沿用共用模組 `src/store/app-storage.ts`
// （`createAppKeyedStorage`）：app 設定（app.json）、pages、i18n、
// 路由管理都是「以 app 為 key 存一份物件」這個同一種模式，因此共用
// 同一套 load / save / resolveInitialForApp 實作，只是這裡帶專屬的
// storageKey，值的型別是 `RouteEntry[]`。
//
// 跟 pages / i18n 同一套模式：localStorage 為主要工作副本，另有對應的
// disk-api（src/lib/routes-disk-api.ts）與 write-routes-plugin
// （scripts/write-routes-plugin.mjs），可手動「寫入檔案系統」「從檔案系統
// 讀取（覆蓋）」到 data/{app}/routes.json。這份清單跟原有的 pages.json
// 動態渲染系統無關，只是一份給使用者自訂 path 對應（既有 generated 頁面
// 或自訂網址）的清單，每筆另可附一段 description 說明用途。

import { createAppKeyedStorage } from '@/store/storage';
import type { RoutesData, RouteEntry } from '@/types/route-types';

const STORAGE_KEY = 'route-manager:data';

const routesStorage = createAppKeyedStorage<RouteEntry[]>(STORAGE_KEY);

export function loadRoutesData(): RoutesData {
  return routesStorage.load();
}

export function saveRoutesData(data: RoutesData): void {
  routesStorage.save(data);
}

/** 訂閱 localStorage 中路由設定的變動（同分頁內即時通知）。 */
export function subscribeRoutesData(fn: (data: RoutesData) => void): () => void {
  return routesStorage.subscribe(fn);
}

/** 取得單一 app 目前的路由清單，未曾編輯過時回傳空陣列。 */
export function loadAppRoutes(app: string): RouteEntry[] {
  return routesStorage.loadApp(app) ?? [];
}

/** 覆寫單一 app 的路由清單，其餘 app 維持不變。 */
export function saveAppRoutes(app: string, routes: RouteEntry[]): void {
  routesStorage.saveApp(app, routes);
}

/** 新增一筆路由設定到指定 app。 */
export function addRoute(app: string, entry: RouteEntry): void {
  const current = loadAppRoutes(app);
  saveAppRoutes(app, [...current, entry]);
}

/** 更新指定 app 底下的一筆既有路由設定（依 id 比對）。 */
export function updateRoute(
  app: string,
  id: string,
  patch: Partial<Omit<RouteEntry, 'id'>>
): void {
  const current = loadAppRoutes(app);
  saveAppRoutes(
    app,
    current.map((r) => (r.id === id ? { ...r, ...patch } : r))
  );
}

/** 刪除指定 app 底下的一筆路由設定。 */
export function removeRoute(app: string, id: string): void {
  const current = loadAppRoutes(app);
  saveAppRoutes(
    app,
    current.filter((r) => r.id !== id)
  );
}

/** app 被刪除時，一併清掉 localStorage 裡對應的暫存路由資料。 */
export function removeAppRoutes(app: string): void {
  routesStorage.removeApp(app);
}

/** app 被重新命名時，把 localStorage 裡的路由資料 key 一併搬移。 */
export function renameAppRoutes(oldName: string, newName: string): void {
  routesStorage.renameApp(oldName, newName);
}
