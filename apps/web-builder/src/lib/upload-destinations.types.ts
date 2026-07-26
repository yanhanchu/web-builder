// ============================================================
// 上傳目的地：純型別定義 + 建構函式
//
// 這個檔案刻意「不含任何瀏覽器 API」（沒有 window / localStorage），
// 純粹是型別 + 建立預設值的函式，前端（src/lib/upload-destinations.ts）
// 和後端（server/*.ts，跑在 tsconfig.node.json 底下，lib 只有
// ES2023、沒有 DOM）都能安全 import，不會因為型別檢查時連帶解析到
// window 相關程式碼而報錯。
//
// 前端的 upload-destinations.ts 只是在這之上疊一層 localStorage
// 持久化，型別與預設值一律從這裡匯出，避免前後端兩邊定義各自漂移。
// ============================================================

export const UPLOAD_DESTS_KEY = "wb.settings.uploadDestinations";

export interface LocalUploadDest {
  id: string;
  kind: "local";
  enabled: boolean;
  label: string;
  /** 伺服器上的儲存目錄 */
  storagePath: string;
  /** 存好之後，檔案的對外網址前綴，例如 https://example.com/uploads */
  publicBaseUrl: string;
}

export interface S3UploadDest {
  id: string;
  kind: "s3";
  enabled: boolean;
  label: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 自訂 endpoint：留空即用 AWS 官方端點；填寫可接 MinIO / R2 / B2 等 S3 相容節點 */
  endpoint: string;
  /** path-style（http(s)://endpoint/bucket/key）而非 virtual-hosted-style，許多自架 S3 相容節點需要開啟 */
  forcePathStyle: boolean;
  /** 選填：存好之後，檔案的對外網址前綴（例如接了 CDN 或自訂網域時使用） */
  publicBaseUrl: string;
}

export type UploadDest = LocalUploadDest | S3UploadDest;

export function makeLocalDest(): LocalUploadDest {
  return {
    id: `local-${Date.now()}`,
    kind: "local",
    enabled: true,
    label: "本機儲存",
    storagePath: "/var/www/uploads",
    publicBaseUrl: "",
  };
}

export function makeS3Dest(): S3UploadDest {
  return {
    id: `s3-${Date.now()}`,
    kind: "s3",
    enabled: false,
    label: "新 S3 節點",
    bucket: "",
    region: "auto",
    accessKeyId: "",
    secretAccessKey: "",
    endpoint: "",
    forcePathStyle: false,
    publicBaseUrl: "",
  };
}

export const DEFAULT_UPLOAD_DESTS: UploadDest[] = [makeLocalDest()];
