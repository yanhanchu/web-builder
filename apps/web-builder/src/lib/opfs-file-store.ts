// OPFS（Origin Private File System）檔案本體儲存層。
//
// 「檔案管理」（/files）原本把檔案內容以 base64 dataUrl 直接存進
// localStorage（見 src/store/file-storage.ts 舊實作），localStorage
// 有 5–10MB 的容量上限（所有 key 共用），大檔案（尤其圖片、影片）很容易
// 直接把配額塞爆，上傳後「看起來沒有反應」。
//
// 這一層改用瀏覽器原生的 OPFS 存放「檔案本體」（Blob），
// 容量遠大於 localStorage（依瀏覽器可用磁碟空間而定，通常是數百 MB 到數 GB），
// 且讀寫走 Blob/ArrayBuffer，不需要 base64 編碼帶來的 ~33% 體積膨脹。
//
// 檔案配置：
//   OPFS root
//     files/
//       {app}/
//         {id}          ← 檔案本體（原始 bytes，檔名固定用 FileEntry.id，
//                            避免特殊字元/重複檔名造成的路徑問題，
//                            原始檔名與 mimeType 仍保存在 FileEntry metadata）
//
// FileEntry 的 metadata（name / mimeType / size / description / 時間戳）
// 依然存在 localStorage（見 file-storage.ts），只有「本體」搬到 OPFS，
// 這樣既維持既有的「localStorage 優先、即時同步」metadata 編輯體驗，
// 又不會被檔案本體塞爆容量。
//
// 瀏覽器支援：OPFS 為現代瀏覽器（Chrome/Edge 一定支援；Safari 16.4+／
// Firefox 111+ 亦有支援）標準 API，透過 `navigator.storage.getDirectory()`
// 取得。呼叫端應自行處理不支援的情況（見 isOpfsSupported）。

const FILES_DIR = 'files';

/** 判斷目前執行環境是否支援 OPFS。 */
export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage?.getDirectory === 'function'
  );
}

async function getFilesRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(FILES_DIR, { create: true });
}

async function getAppDir(app: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  const filesRoot = await getFilesRoot();
  return filesRoot.getDirectoryHandle(app, { create });
}

/**
 * 把一個 Blob/File 寫入 OPFS，路徑為 `files/{app}/{id}`。
 * `id` 應使用 FileEntry.id（crypto.randomUUID()），避免檔名衝突或特殊字元問題。
 */
export async function writeOpfsFile(app: string, id: string, blob: Blob): Promise<void> {
  const appDir = await getAppDir(app, true);
  const fileHandle = await appDir.getFileHandle(id, { create: true });
  // createWritable 為 OPFS 的同步存取 handle 之外，另一種較容易使用的寫入方式，
  // 支援大檔案串流寫入，不需要一次把整個 Blob 讀進記憶體字串。
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
}

/** 讀出 OPFS 中的檔案本體（File 物件，可直接拿去建立 objectURL 或轉 Blob）。不存在時回傳 null。 */
export async function readOpfsFile(app: string, id: string): Promise<File | null> {
  try {
    const appDir = await getAppDir(app, false);
    const fileHandle = await appDir.getFileHandle(id, { create: false });
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

/** 刪除 OPFS 中的單一檔案本體。檔案不存在時視為成功（idempotent）。 */
export async function removeOpfsFile(app: string, id: string): Promise<void> {
  try {
    const appDir = await getAppDir(app, false);
    await appDir.removeEntry(id);
  } catch {
    // 不存在或目錄本身不存在都當作已刪除，不需要拋出錯誤。
  }
}

/** 整個刪除某 app 底下所有檔案本體（app 被刪除時使用）。 */
export async function removeOpfsAppDir(app: string): Promise<void> {
  try {
    const filesRoot = await getFilesRoot();
    await filesRoot.removeEntry(app, { recursive: true });
  } catch {
    // 目錄本來就不存在時忽略。
  }
}

/**
 * 把某 app 底下所有檔案本體搬到新的 app 名稱底下（app 被重新命名時使用）。
 * OPFS 目前沒有原生的目錄 rename API，因此用「逐檔複製到新目錄 + 刪除舊目錄」實作。
 */
export async function renameOpfsAppDir(oldApp: string, newApp: string): Promise<void> {
  let oldDir: FileSystemDirectoryHandle;
  try {
    oldDir = await getAppDir(oldApp, false);
  } catch {
    return; // 舊目錄不存在，沒有東西需要搬移。
  }

  const newDir = await getAppDir(newApp, true);

  // entries() 為 FileSystemDirectoryHandle 的 async iterator，
  // TS lib.dom 型別定義依版本可能尚未涵蓋，實際執行環境（Chromium/現代瀏覽器）已支援。
  for await (const [name, handle] of oldDir.entries()) {
    if (handle.kind !== 'file') continue;
    const fileHandle = handle as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    const newFileHandle = await newDir.getFileHandle(name, { create: true });
    const writable = await newFileHandle.createWritable();
    try {
      await writable.write(file);
    } finally {
      await writable.close();
    }
  }

  const filesRoot = await getFilesRoot();
  await filesRoot.removeEntry(oldApp, { recursive: true });
}

/** 建立一個指向 OPFS 檔案內容的 objectURL（呼叫端用完後應呼叫 URL.revokeObjectURL 釋放）。 */
export async function createOpfsObjectUrl(app: string, id: string): Promise<string | null> {
  const file = await readOpfsFile(app, id);
  if (!file) return null;
  return URL.createObjectURL(file);
}
