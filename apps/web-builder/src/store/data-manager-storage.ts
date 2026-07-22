// localStorage 存取層：資料管理（v3）
//
// 結構：data-manager:v3 -> { [app]: { [typeId]: { [datasetName]: Dataset } } }
//
// - v3 改用新的 DataManagerData 形狀（app -> typeId -> datasetName -> Dataset）
// - v2/v1 的 key 是 data-manager:data，不衝突，舊資料自動被忽略

import type {
  DataManagerData,
  Dataset,
  DataRecordEntry,
  RecordValue,
} from '@/types/data-manager-types';
import type { BindingMap } from '@/types/binding-types';

const STORAGE_KEY = 'data-manager:v3';

// ─── raw load / save ──────────────────────────────────────────────────────────

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

function save(data: DataManagerData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded — 靜默失敗
  }
  notify(data);
}

// ─── 同分頁通知（不走瀏覽器 storage event） ──────────────────────────────────

const listeners = new Set<(data: DataManagerData) => void>();

function notify(data: DataManagerData): void {
  listeners.forEach((fn) => fn(data));
}

export function subscribeDataManagerData(fn: (data: DataManagerData) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ─── 公開 API ─────────────────────────────────────────────────────────────────

export function loadDataManagerData(): DataManagerData {
  return load();
}

export function saveDataManagerData(data: DataManagerData): void {
  save(data);
}

/** 取得某 app + typeId 底下的所有 datasets（map by name） */
export function loadDatasets(app: string, typeId: string): Record<string, Dataset> {
  const all = load();
  return all[app]?.[typeId] ?? {};
}

/** 覆寫某 app + typeId 底下的所有 datasets */
function saveDatasets(app: string, typeId: string, datasets: Record<string, Dataset>): void {
  const all = load();
  const appData = all[app] ?? {};
  save({ ...all, [app]: { ...appData, [typeId]: datasets } });
}

/** 取得某個 dataset */
export function loadDataset(app: string, typeId: string, datasetName: string): Dataset | undefined {
  return loadDatasets(app, typeId)[datasetName];
}

/** 新增或覆寫一個 dataset */
export function saveDataset(app: string, typeId: string, datasetName: string, dataset: Dataset): void {
  const datasets = loadDatasets(app, typeId);
  saveDatasets(app, typeId, { ...datasets, [datasetName]: dataset });
}

/** 刪除一個 dataset */
export function removeDataset(app: string, typeId: string, datasetName: string): void {
  const datasets = { ...loadDatasets(app, typeId) };
  delete datasets[datasetName];
  saveDatasets(app, typeId, datasets);
}

/** 重新命名一個 dataset */
export function renameDataset(
  app: string,
  typeId: string,
  oldName: string,
  newName: string
): void {
  const datasets = { ...loadDatasets(app, typeId) };
  if (!(oldName in datasets) || newName === oldName) return;
  const ds = datasets[oldName];
  datasets[newName] = { ...ds, name: newName } as Dataset;
  delete datasets[oldName];
  saveDatasets(app, typeId, datasets);
}

// ─── 陣列型 dataset：逐筆操作 ─────────────────────────────────────────────────

/** 對 isArrayType=true 的 dataset 新增一筆 item */
export function addItemToDataset(
  app: string,
  typeId: string,
  datasetName: string,
  entry: DataRecordEntry
): void {
  const ds = loadDataset(app, typeId, datasetName);
  if (!ds || !ds.isArrayType) return;
  saveDataset(app, typeId, datasetName, {
    ...ds,
    items: [...ds.items, entry],
  });
}

/** 更新 isArrayType=true 的 dataset 中某一筆 item */
export function updateItemInDataset(
  app: string,
  typeId: string,
  datasetName: string,
  id: string,
  value: Record<string, RecordValue>,
  bindings?: BindingMap
): void {
  const ds = loadDataset(app, typeId, datasetName);
  if (!ds || !ds.isArrayType) return;
  saveDataset(app, typeId, datasetName, {
    ...ds,
    items: ds.items.map((r) =>
      r.id === id ? { ...r, value, ...(bindings !== undefined ? { bindings } : {}) } : r
    ),
  });
}

/** 移除 isArrayType=true 的 dataset 中某一筆 item */
export function removeItemFromDataset(
  app: string,
  typeId: string,
  datasetName: string,
  id: string
): void {
  const ds = loadDataset(app, typeId, datasetName);
  if (!ds || !ds.isArrayType) return;
  saveDataset(app, typeId, datasetName, {
    ...ds,
    items: ds.items.filter((r) => r.id !== id),
  });
}

// ─── 單一物件型 dataset：整體更新 ────────────────────────────────────────────

/** 更新 isArrayType=false 的 dataset 的 item（整份覆寫） */
export function updateSingleDataset(
  app: string,
  typeId: string,
  datasetName: string,
  value: Record<string, RecordValue>,
  bindings?: BindingMap
): void {
  const ds = loadDataset(app, typeId, datasetName);
  if (!ds || ds.isArrayType) return;
  saveDataset(app, typeId, datasetName, {
    ...ds,
    item: value,
    ...(bindings !== undefined ? { bindings } : {}),
  });
}

// ─── app 生命週期 ──────────────────────────────────────────────────────────────

export function removeAppDataRecords(app: string): void {
  const all = load();
  if (!(app in all)) return;
  const next = { ...all };
  delete next[app];
  save(next);
}

export function renameAppDataRecords(oldName: string, newName: string): void {
  const all = load();
  if (!(oldName in all)) return;
  const next = { ...all };
  next[newName] = next[oldName];
  delete next[oldName];
  save(next);
}

// ─── 為了相容舊的 data-manager-disk-api（loadDataManagerData 結構） ──────────

/** 取得某 app 底下有紀錄的 typeId 清單 */
export function loadAppTypeIds(app: string): string[] {
  const all = load();
  return Object.keys(all[app] ?? {});
}
