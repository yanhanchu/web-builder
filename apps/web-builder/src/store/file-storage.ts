// localStorage 存取層：檔案管理（app 底下的子功能）目前的編輯狀態（metadata）。
//
// 底層邏輯沿用共用模組 `src/store/storage.ts`（`createAppKeyedStorage`）：
// 跟 app 設定 / pages / i18n / 路由管理同一套「以 app 為 key 存一份物件」模式，
// 只是這裡帶專屬的 storageKey，值的型別是 `FileEntry[]`。
//
// 檔案「本體」不在這一層處理，一律先寫入 OPFS（見
// src/lib/opfs-file-store.ts），並依 FileEntry.locations 額外同步到：
//   - 'disk'：見 src/lib/files-disk-api.ts（dev only，寫進 public/uploads/{app}/）
//   - 's3'  ：見 @workspace/browser 套件的 s3-upload-client.ts（dev only，presigned URL 直傳 S3/R2）
// 這裡的 remove / rename 系列函式會一併呼叫 opfs-file-store 清掉對應的 OPFS 本體，
// 避免 metadata 刪除後 OPFS 留下孤兒檔案。

import { createAppKeyedStorage } from '@/store/storage';
import { removeOpfsFile, removeOpfsAppDir, renameOpfsAppDir } from '@/lib/opfs-file-store';
import type { FilesData, FileEntry } from '@/types/file-types';
import type { AppStorageProvider } from '@/types/types';

const STORAGE_KEY = 'file-manager:data';

const filesStorage = createAppKeyedStorage<FileEntry[]>(STORAGE_KEY);

// -------------------------------------------------------------------
// 「上傳目的地管理」面板：使用者勾選的自動同步目標（local / s3）。
//
// 這份狀態原本只存在元件的 useState，重新整理分頁就會被重置成空集合，
// 導致「勾了 S3 卻在重整後顯示沒設定」的不一致。改用跟 metadata 同一套
// 「以 app 為 key」的 localStorage 存取層，行為對齊 pages / i18n / routes：
// 一勾選就即時落地，重整、切換分頁都不會遺失。
// -------------------------------------------------------------------

type AutoSyncTarget = Extract<AppStorageProvider, 'local' | 's3'>;

const AUTO_SYNC_STORAGE_KEY = 'file-manager:auto-sync-targets';

const autoSyncTargetsStorage = createAppKeyedStorage<AutoSyncTarget[]>(AUTO_SYNC_STORAGE_KEY);

/** 取得指定 app 目前勾選的自動同步目標（未曾設定過回傳空陣列）。 */
export function loadAutoSyncTargets(app: string): AutoSyncTarget[] {
  return autoSyncTargetsStorage.loadApp(app) ?? [];
}

/** 覆寫指定 app 的自動同步目標（面板勾選/取消勾選時呼叫）。回傳是否寫入成功。 */
export function saveAutoSyncTargets(app: string, targets: AutoSyncTarget[]): boolean {
  return autoSyncTargetsStorage.saveApp(app, targets);
}

/** 訂閱自動同步目標的變動（同分頁內即時通知，例如切換 app 後的其他畫面）。 */
export function subscribeAutoSyncTargets(fn: (data: Record<string, AutoSyncTarget[]>) => void): () => void {
  return autoSyncTargetsStorage.subscribe(fn);
}

/** app 被刪除時，一併清掉自動同步目標的暫存設定。 */
export function removeAppAutoSyncTargets(app: string): void {
  autoSyncTargetsStorage.removeApp(app);
}

/** app 被重新命名時，把自動同步目標設定的 key 一併搬移。 */
export function renameAppAutoSyncTargets(oldName: string, newName: string): void {
  autoSyncTargetsStorage.renameApp(oldName, newName);
}

export function loadFilesData(): FilesData {
  return filesStorage.load();
}

export function saveFilesData(data: FilesData): void {
  filesStorage.save(data);
}

/** 訂閱 localStorage 中檔案清單的變動（同分頁內即時通知）。 */
export function subscribeFilesData(fn: (data: FilesData) => void): () => void {
  return filesStorage.subscribe(fn);
}

/** 取得單一 app 目前的檔案清單，未曾編輯過時回傳空陣列。 */
export function loadAppFiles(app: string): FileEntry[] {
  return filesStorage.loadApp(app) ?? [];
}

/** 覆寫單一 app 的檔案清單，其餘 app 維持不變。回傳是否寫入成功。 */
export function saveAppFiles(app: string, files: FileEntry[]): boolean {
  return filesStorage.saveApp(app, files);
}

/** 新增一筆檔案到指定 app（多筆上傳時逐一呼叫，或改用 addFiles 一次寫入）。 */
export function addFile(app: string, entry: FileEntry): boolean {
  const current = loadAppFiles(app);
  return saveAppFiles(app, [...current, entry]);
}

/**
 * 一次新增多筆檔案到指定 app（拖拉 / 選取多檔時使用，避免逐筆寫入互相覆蓋）。
 * 回傳是否寫入成功。這裡只寫 metadata（localStorage）；呼叫端須自行先把
 * 檔案本體寫進 OPFS（見 opfs-file-store.ts）或上傳到磁碟（見 files-disk-api.ts），
 * 再呼叫這個函式登記 metadata，兩者順序錯了會出現「有紀錄但讀不到本體」。
 */
export function addFiles(app: string, entries: FileEntry[]): boolean {
  if (entries.length === 0) return true;
  const current = loadAppFiles(app);
  return saveAppFiles(app, [...current, ...entries]);
}

/** 更新指定 app 底下的一筆既有檔案（依 id 比對），常用於編輯 description。回傳是否寫入成功。 */
export function updateFile(app: string, id: string, patch: Partial<Omit<FileEntry, 'id'>>): boolean {
  const current = loadAppFiles(app);
  return saveAppFiles(
    app,
    current.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f))
  );
}

/**
 * 刪除指定 app 底下的一筆檔案：先移除 metadata（localStorage），並清掉
 * OPFS 中的本體（OPFS 是上傳當下必定寫入的預設本體，因此一律嘗試清除，
 * 不像本機 / S3 屬於選用的額外同步目的地）。本機 / S3 上已同步的本體
 * 目前不會自動刪除（同步為手動操作，刪除亦然，與 pages/i18n/routes 的
 * 「寫入/讀取」對稱設計一致）。回傳是否寫入成功。
 */
export function removeFile(app: string, id: string): boolean {
  const current = loadAppFiles(app);
  const ok = saveAppFiles(
    app,
    current.filter((f) => f.id !== id)
  );
  if (ok) {
    void removeOpfsFile(app, id);
  }
  return ok;
}

/** app 被刪除時，一併清掉 localStorage 裡對應的暫存檔案資料，以及 OPFS 裡該 app 的所有檔案本體。 */
export function removeAppFiles(app: string): void {
  filesStorage.removeApp(app);
  void removeOpfsAppDir(app);
}

/** app 被重新命名時，把 localStorage 裡的檔案資料 key、以及 OPFS 裡的檔案本體目錄一併搬移。 */
export function renameAppFiles(oldName: string, newName: string): void {
  filesStorage.renameApp(oldName, newName);
  void renameOpfsAppDir(oldName, newName);
}
