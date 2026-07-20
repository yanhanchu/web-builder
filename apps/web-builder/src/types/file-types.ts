// 「檔案管理」的型別定義。
//
// 跟「路由管理」一樣是 app 底下獨立的子功能：每個 app 可以各自維護一份
// 檔案清單，用來模擬「上傳檔案 / 管理媒體庫」的介面。
//
// 儲存策略（本次重構）：
//   - metadata（檔名 / mimeType / size / 縮圖狀態 / 備註 / 時間戳 / 各儲存位置
//     狀態）存在瀏覽器 localStorage（見 src/store/file-storage.ts），
//     沿用既有的「以 app 為 key 存一份物件」模式，維持即時同步、換頁不遺失
//     的體驗。
//   - 檔案「本體」上傳後預設一律先存 OPFS（Origin Private File System，
//     見 src/lib/opfs-file-store.ts），不再塞進 localStorage 的
//     base64 dataUrl（原本 5–10MB 容量上限很容易被單一圖片塞爆）。
//   - 「本機檔案系統」與「S3 相容節點」是可以並存、各自獨立的「額外」儲存
//     目的地（見下方 `AppStorageProvider[]`，app 設定可以同時勾選兩者）：
//       - 開發環境下（`npm run dev`）可另外把本體同步一份到本機，透過
//         `/__api/upload-file` 寫入 `public/uploads/{app}/`（見
//         src/lib/files-disk-api.ts、scripts/write-files.mjs）。
//       - 也可另外把本體同步一份到 S3 / R2，透過 `/__api/s3-presign` 取得
//         presigned URL 後直接 PUT 上傳（見 @workspace/browser 套件的
//         s3-upload-client.ts、@workspace/server 套件的 s3-presign-service.mjs）。
//     同一筆檔案可以「同時」存在 OPFS + 本機、OPFS + S3、甚至三者皆有，
//     因此檔案本體的存放狀態改用 `FileLocations`（每個目的地各自的
//     已同步狀態），取代舊版「單一 storageKind」的設計。

/** app 設定裡「檔案上傳」可選的儲存供應商：本機檔案系統 / S3 相容物件儲存（可複選） */
export type AppStorageProvider = 'local' | 's3';

/** 單一儲存目的地（本機或 S3）目前的同步狀態 */
export interface FileLocationStatus {
  /** 是否已同步到這個目的地 */
  synced: boolean;
  /** 已同步時，可直接訪問的網址（本機為 /uploads/{app}/xxx，S3 為 publicUrl） */
  url?: string;
  /** S3 專用：實際的物件 key（含副檔名），刪除 / 除錯時使用 */
  key?: string;
  /** 本機專用：實際落地的檔名（public/uploads/{app}/{storedName}），刪除時使用 */
  storedName?: string;
  /** 最後成功同步時間（ISO 字串） */
  syncedAt?: string;
}

/** 一筆檔案在各個可能儲存位置的同步狀態；OPFS 永遠視為預設已同步（上傳當下就寫入）。 */
export interface FileLocations {
  disk?: FileLocationStatus;
  s3?: FileLocationStatus;
}

/** 單筆檔案紀錄（metadata，存在 localStorage；本體另外存放，見 locations） */
export interface FileEntry {
  /** 前端產生的唯一識別碼（新增時用 crypto.randomUUID() 產生），同時也是 OPFS 內的檔名 */
  id: string;
  /** 原始檔名（含副檔名） */
  name: string;
  /** MIME type，例如 image/png、application/pdf */
  mimeType: string;
  /** 檔案大小（bytes） */
  size: number;
  /**
   * 各儲存目的地目前的同步狀態（本機 / S3，皆為「額外」同步目的地，
   * 可以同時存在、互不影響）。OPFS 本體上傳當下必定寫入，不需要另外
   * 用欄位標記；只有本機 / S3 需要記錄「是否已同步、同步後的網址」。
   */
  locations: FileLocations;
  /** 是否為圖片（依 mimeType 判斷，決定要不要顯示縮圖預覽） */
  isImage: boolean;
  /** 選填備註，方便管理時辨識用途 */
  description?: string;
  /** 建立時間（ISO 字串） */
  createdAt: string;
  /** 最後更新時間（ISO 字串），編輯 description 或同步到磁碟/S3 時更新 */
  updatedAt: string;
}

/**
 * data/{app}/files.json（未來若串接檔案系統 metadata 持久化）的資料形狀：
 * app -> 該 app 底下的檔案清單 metadata。
 *
 * 目前 metadata 僅存在瀏覽器 localStorage（見 src/store/file-storage.ts）；
 * 檔案本體一律先存 OPFS，並視 app 設定額外同步到 public/uploads/{app}/
 * 與／或 S3 / R2。
 */
export type FilesData = Record<string /* app */, FileEntry[]>;

/** 依 mimeType 判斷是否為圖片 */
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/** 把 bytes 轉成人類可讀的檔案大小字串（例如 1.2 MB） */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

/** 建立一份空的 FileLocations（尚未同步到任何額外目的地） */
export function emptyFileLocations(): FileLocations {
  return {};
}
