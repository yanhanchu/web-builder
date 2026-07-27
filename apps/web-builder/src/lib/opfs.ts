// ============================================================
// OPFS（Origin Private File System）：所有檔案上傳的第一落地點
//
// 不管使用者最終選了哪個上傳目的地（本機 / S3 相容節點），檔案一律
// 「先」寫進瀏覽器的 OPFS，之後才視需要同步（syncFileToDestination，
// 見 upload-client.ts）到實際目的地：
//
//   File 選取 -> saveFileToOpfs()（第一步，一定會做）
//             -> 依目的地種類：
//                - local：OPFS 本身就是「本機」目的地，不需要再送到
//                  任何 server，opfsPath 即最終位置。
//                - s3：跟 dev server 要 presigned PUT URL，再用瀏覽器
//                  直接對該 URL 發 PUT，body 讀自 OPFS（見
//                  uploadFileToS3()）。
//
// 路徑慣例：uploads/<appName>/<storedFileName>，跟原本 server 端
// local-upload.ts 的慣例（<storagePath>/<appName>/<storedFileName>）
// 對齊，方便閱讀 / 除錯時心智模型一致。
//
// 對外 URL 慣例：一律用 `opfs://<appName>/<storedFileName>` 這個
// 假 scheme 字串代表「這個檔案實際存在 OPFS 裡」，需要真的拿到內容
// （例如 <img src> 預覽、或同步到別的目的地）時，透過
// resolveOpfsUrlToObjectUrl() / readOpfsFile() 轉成真正可用的
// blob: URL 或 File。
// ============================================================

const ROOT_DIR = "uploads";
export const OPFS_URL_PREFIX = "opfs://";

function isOpfsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined" &&
    typeof navigator.storage.getDirectory === "function"
  );
}

async function getRootDir(): Promise<FileSystemDirectoryHandle> {
  if (!isOpfsSupported()) {
    throw new Error("此瀏覽器不支援 OPFS（Origin Private File System）");
  }
  const opfsRoot = await navigator.storage.getDirectory();
  return opfsRoot.getDirectoryHandle(ROOT_DIR, { create: true });
}

async function getAppDir(
  appName: string,
  options: { create?: boolean } = {},
): Promise<FileSystemDirectoryHandle> {
  const root = await getRootDir();
  return root.getDirectoryHandle(appName, { create: options.create ?? true });
}

/** 保留原始副檔名，產生一個不會互撞的 OPFS 檔名。與 server/filename.ts 的 makeStoredFileName 慣例一致。 */
export function makeOpfsFileName(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const ext = dot > 0 ? originalName.slice(dot) : "";
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  return `${unique}${ext}`;
}

export function makeOpfsUrl(appName: string, fileName: string): string {
  return `${OPFS_URL_PREFIX}${encodeURIComponent(appName)}/${encodeURIComponent(fileName)}`;
}

/** 判斷一個 url 字串是不是指向 OPFS 裡的檔案。 */
export function isOpfsUrl(url: string): boolean {
  return url.startsWith(OPFS_URL_PREFIX);
}

/** 拆解 opfs:// url，取回 appName / fileName；不是 opfs url 就回傳 null。 */
export function parseOpfsUrl(
  url: string,
): { appName: string; fileName: string } | null {
  if (!isOpfsUrl(url)) return null;
  const rest = url.slice(OPFS_URL_PREFIX.length);
  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) return null;
  return {
    appName: decodeURIComponent(rest.slice(0, slashIdx)),
    fileName: decodeURIComponent(rest.slice(slashIdx + 1)),
  };
}

export interface SavedOpfsFile {
  appName: string;
  fileName: string;
  /** `opfs://<appName>/<fileName>`，存進 DataSource.url 之類欄位使用 */
  url: string;
  size: number;
  mimeType?: string;
}

/**
 * 把選取的 File 寫進 OPFS：uploads/<appName>/<storedFileName>。
 * 這是所有上傳流程的第一步，不論之後要不要再同步到 local / S3 目的地。
 */
export async function saveFileToOpfs(
  file: File | Blob,
  appName: string,
  originalName: string = file instanceof File ? file.name : "file",
): Promise<SavedOpfsFile> {
  const appDir = await getAppDir(appName, { create: true });
  const fileName = makeOpfsFileName(originalName);
  const fileHandle = await appDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();

  return {
    appName,
    fileName,
    url: makeOpfsUrl(appName, fileName),
    size: file.size,
    mimeType: (file as File).type || undefined,
  };
}

/** 直接指定檔名寫入 OPFS（同步流程用：把來源內容原封不動複製一份到某個 appName 底下）。 */
export async function writeOpfsFile(
  appName: string,
  fileName: string,
  data: Blob,
): Promise<SavedOpfsFile> {
  const appDir = await getAppDir(appName, { create: true });
  const fileHandle = await appDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();

  return {
    appName,
    fileName,
    url: makeOpfsUrl(appName, fileName),
    size: data.size,
    mimeType: (data as File).type || undefined,
  };
}

/** 從 OPFS 讀回一個檔案的內容（File 物件）。找不到會 throw。 */
export async function readOpfsFile(
  appName: string,
  fileName: string,
): Promise<File> {
  const appDir = await getAppDir(appName, { create: false });
  const fileHandle = await appDir.getFileHandle(fileName, { create: false });
  return fileHandle.getFile();
}

/** 依 opfs:// url 讀回檔案內容，方便同步 / 預覽時直接吃 DataSource.url。 */
export async function readOpfsFileByUrl(url: string): Promise<File> {
  const parsed = parseOpfsUrl(url);
  if (!parsed) throw new Error(`不是有效的 opfs url：${url}`);
  return readOpfsFile(parsed.appName, parsed.fileName);
}

/** 把 opfs:// url 轉成當下分頁可用的 blob: URL，給 <img> / <a download> 之類預覽用。呼叫端用完要記得 URL.revokeObjectURL()。 */
export async function resolveOpfsUrlToObjectUrl(url: string): Promise<string> {
  const file = await readOpfsFileByUrl(url);
  return URL.createObjectURL(file);
}

export async function deleteOpfsFile(
  appName: string,
  fileName: string,
): Promise<void> {
  const appDir = await getAppDir(appName, { create: false });
  await appDir.removeEntry(fileName);
}

export interface OpfsFileEntry {
  appName: string;
  fileName: string;
  url: string;
}

/** 列出某個 appName 底下目前 OPFS 存了哪些檔案（除錯 / 管理用途）。 */
export async function listOpfsFiles(appName: string): Promise<OpfsFileEntry[]> {
  const appDir = await getAppDir(appName, { create: true });
  const entries: OpfsFileEntry[] = [];
  // @ts-expect-error -- FileSystemDirectoryHandle 的 async iterator 型別尚未進 lib.dom
  for await (const [name, handle] of appDir.entries()) {
    if (handle.kind === "file") {
      entries.push({ appName, fileName: name, url: makeOpfsUrl(appName, name) });
    }
  }
  return entries;
}

export { isOpfsSupported };
