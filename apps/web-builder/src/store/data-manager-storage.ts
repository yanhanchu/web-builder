// localStorage 存取層：資料管理（app 底下的子功能）目前的編輯狀態。
//
// 跟 route-storage.ts 同一套「localStorage 為主要工作副本」模式，但資料
// 形狀多一層 typeId（app -> typeId -> DataRecordEntry[]），因此不直接沿用
// createAppKeyedStorage<T>，改成在同一個 storage key 底下存整份巢狀物件，
// 操作時對「單一 app + 單一 typeId」這組 key 做讀寫。
//
// 跟 routes 同一套模式：localStorage 為主要工作副本，另有對應的
// disk-api（src/lib/data-manager-disk-api.ts）與 write-data-plugin
// （scripts/write-data-plugin.mjs），可手動「寫入檔案系統」「從檔案系統
// 讀取（覆蓋）」到 data/{app}/records/{typeId}.json。

import type { DataManagerData, DataRecordEntry } from '@/types/data-manager-types';

const STORAGE_KEY = 'data-manager:data';

function load(): DataManagerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as DataManagerData;
    }
    return {};
  } catch {
    return {};
  }
}

function save(data: DataManagerData): boolean {
  let ok = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    ok = false;
  }
  notify(data);
  return ok;
}

// 同分頁內變更通知，跟 storage.ts 的 createAppKeyedStorage 同樣理由：
// 同一分頁內 setItem 不會觸發瀏覽器原生 storage event。
const listeners = new Set<(data: DataManagerData) => void>();

function notify(data: DataManagerData): void {
  listeners.forEach((fn) => fn(data));
}

export function subscribeDataManagerData(fn: (data: DataManagerData) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function loadDataManagerData(): DataManagerData {
  return load();
}

export function saveDataManagerData(data: DataManagerData): void {
  save(data);
}

/** 取得某個 app 底下、某個型別 id 目前的資料紀錄，未曾編輯過時回傳空陣列 */
export function loadTypeRecords(app: string, typeId: string): DataRecordEntry[] {
  const all = load();
  return all[app]?.[typeId] ?? [];
}

/** 覆寫某個 app 底下、某個型別 id 的資料紀錄，其餘 app / typeId 維持不變 */
export function saveTypeRecords(app: string, typeId: string, records: DataRecordEntry[]): void {
  const all = load();
  const appData = all[app] ?? {};
  save({ ...all, [app]: { ...appData, [typeId]: records } });
}

/** 取得某個 app 底下，目前有哪些型別 id 已經被編輯過（有 localStorage 紀錄），供列表用 */
export function loadAppTypeIds(app: string): string[] {
  const all = load();
  return Object.keys(all[app] ?? {});
}

/** 新增一筆資料紀錄到指定 app + typeId */
export function addDataRecord(app: string, typeId: string, entry: DataRecordEntry): void {
  const current = loadTypeRecords(app, typeId);
  saveTypeRecords(app, typeId, [...current, entry]);
}

/** 更新指定 app + typeId 底下的一筆既有資料紀錄（依 id 比對） */
export function updateDataRecord(app: string, typeId: string, id: string, value: Record<string, unknown>): void {
  const current = loadTypeRecords(app, typeId);
  saveTypeRecords(
    app,
    typeId,
    current.map((r) => (r.id === id ? { ...r, value } : r))
  );
}

/** 刪除指定 app + typeId 底下的一筆資料紀錄 */
export function removeDataRecord(app: string, typeId: string, id: string): void {
  const current = loadTypeRecords(app, typeId);
  saveTypeRecords(
    app,
    typeId,
    current.filter((r) => r.id !== id)
  );
}

/** app 被刪除時，一併清掉 localStorage 裡對應的暫存資料。 */
export function removeAppDataRecords(app: string): void {
  const all = load();
  if (!(app in all)) return;
  const next = { ...all };
  delete next[app];
  save(next);
}

/** app 被重新命名時，把 localStorage 裡的資料 key 一併搬移。 */
export function renameAppDataRecords(oldName: string, newName: string): void {
  const all = load();
  if (!(oldName in all)) return;
  const next = { ...all };
  next[newName] = next[oldName];
  delete next[oldName];
  save(next);
}
