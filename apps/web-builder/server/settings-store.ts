// ============================================================
// 伺服器端設定檔存放（Vite dev server 專用）
//
// 前端 App 設定頁（/admin/settings）按下「儲存設定」時，除了寫入
// localStorage，還會把「上傳目的地」設定 POST 到這裡的 API，
// 由這個模組落地成本機的 JSON 檔案：
//
//   apps/web-builder/.data/app-settings/<appName>.json
//
// 之後本機上傳 / S3 presign 這兩個 API，都是「無狀態」的：每次請求
// 都重新從這份 JSON 讀取當下設定，不快取在記憶體裡，這樣改設定後
// 不用重啟 dev server 就能生效。
//
// `appName` 是這一整組前端（web-builder）之後要接多租戶 / 多專案時
// 用來區隔設定與檔案的 namespace。前端目前還沒有 app/namespace 的
// 概念，所以一律先用固定值 "default"。
// ============================================================

import { promises as fs } from "node:fs";
import path from "node:path";

// 與 ../src/lib/upload-destinations.ts 共用同一份型別定義，
// 避免前後端兩邊的 UploadDest 型別各自漂移。
import type { UploadDest } from "../src/lib/upload-destinations.types";

/** 這個 app 裡所有「設定＋上傳」相關的本機資料，都放在這個資料夾下。 */
export const DATA_ROOT = path.resolve(import.meta.dirname, "../.data");

const SETTINGS_DIR = path.join(DATA_ROOT, "app-settings");
const UPLOADS_DIR = path.join(DATA_ROOT, "uploads");

/** 預設 / 尚未帶 appName 時使用的 namespace。 */
export const DEFAULT_APP_NAME = "default";

export interface AppUploadSettings {
  uploadDestinations: UploadDest[];
}

const EMPTY_SETTINGS: AppUploadSettings = { uploadDestinations: [] };

/** 只允許簡單、安全的檔名字元，避免 appName 被拿來做路徑穿越（path traversal）。 */
function sanitizeAppName(appName: string | undefined | null): string {
  const name = (appName ?? "").trim();
  if (!name) return DEFAULT_APP_NAME;
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  return cleaned || DEFAULT_APP_NAME;
}

function settingsFilePath(appName: string): string {
  return path.join(SETTINGS_DIR, `${sanitizeAppName(appName)}.json`);
}

/** 這個 app（namespace）存放實際上傳檔案的根目錄：.data/uploads/<appName>/ */
export function uploadsDirFor(appName: string): string {
  return path.join(UPLOADS_DIR, sanitizeAppName(appName));
}

export async function readAppSettings(
  appName: string,
): Promise<AppUploadSettings> {
  try {
    const raw = await fs.readFile(settingsFilePath(appName), "utf-8");
    const parsed = JSON.parse(raw);
    return {
      uploadDestinations: Array.isArray(parsed?.uploadDestinations)
        ? parsed.uploadDestinations
        : [],
    };
  } catch {
    return EMPTY_SETTINGS;
  }
}

export async function writeAppSettings(
  appName: string,
  settings: AppUploadSettings,
): Promise<void> {
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.writeFile(
    settingsFilePath(appName),
    JSON.stringify(settings, null, 2),
    "utf-8",
  );
}

export async function findDest(
  appName: string,
  destId: string,
): Promise<UploadDest | undefined> {
  const settings = await readAppSettings(appName);
  return settings.uploadDestinations.find((d) => d.id === destId);
}

export { sanitizeAppName };
