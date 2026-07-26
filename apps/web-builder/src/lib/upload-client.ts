// ============================================================
// 前端上傳 client：呼叫 vite dev server 提供的上傳 API
// （server/upload-dev-plugin.ts）
//
//   - 本機上傳目的地：uploadFileToLocal()  -> multipart POST，檔案整個
//     經過 dev server 寫到 storagePath。
//   - S3 相容目的地：uploadFileToS3()      -> 先跟 dev server 要
//     presigned URL，再由「瀏覽器直接」PUT 給 S3 / MinIO / R2 / B2，
//     檔案本體完全不經過 dev server（純前端上傳）。
//
// appName 是這一整套前端（web-builder）之後要接多 app / namespace
// 時的區隔依據；目前前端還沒有 app 的概念，一律用 "default"。
// ============================================================

import type { UploadDest } from "./upload-destinations";

export const DEFAULT_APP_NAME = "default";

export interface UploadResult {
  url: string;
  fileName: string;
  size?: number;
  mimeType?: string;
}

/** 目的地清單 API 回傳的型別（S3 的 secretAccessKey 已被伺服器拿掉）。 */
export type PublicUploadDest =
  | Extract<UploadDest, { kind: "local" }>
  | Omit<Extract<UploadDest, { kind: "s3" }>, "secretAccessKey">;

async function parseJsonOrThrow(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `請求失敗（${res.status}）`);
  }
  return body;
}

/** 取得目前（伺服器端已存檔）所有已啟用的上傳目的地。 */
export async function listUploadDestinations(
  appName: string = DEFAULT_APP_NAME,
): Promise<PublicUploadDest[]> {
  const res = await fetch(
    `/api/upload/${encodeURIComponent(appName)}/destinations`,
  );
  const body = await parseJsonOrThrow(res);
  return body.destinations ?? [];
}

/** 把目前的上傳目的地設定同步到 dev server（App 設定頁「儲存設定」時呼叫）。 */
export async function syncUploadSettings(
  uploadDestinations: UploadDest[],
  appName: string = DEFAULT_APP_NAME,
): Promise<void> {
  const res = await fetch(`/api/settings/${encodeURIComponent(appName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadDestinations }),
  });
  await parseJsonOrThrow(res);
}

/** 上傳到「本機」目的地：整個檔案會經過 dev server 寫進 storagePath。 */
export async function uploadFileToLocal(
  file: File,
  options: { destId?: string; appName?: string } = {},
): Promise<UploadResult> {
  const appName = options.appName ?? DEFAULT_APP_NAME;
  const form = new FormData();
  form.append("file", file, file.name);

  const url = new URL(
    `/api/upload/${encodeURIComponent(appName)}/local`,
    window.location.origin,
  );
  if (options.destId) url.searchParams.set("destId", options.destId);

  const res = await fetch(url, { method: "POST", body: form });
  const body = await parseJsonOrThrow(res);
  return {
    url: body.url,
    fileName: body.fileName,
    size: body.size,
    mimeType: body.mimeType,
  };
}

/**
 * 上傳到「S3 相容」目的地：先跟 dev server 要 presigned URL，
 * 再由瀏覽器直接 PUT 給該節點，檔案不經過 dev server。
 */
export async function uploadFileToS3(
  file: File,
  options: { destId?: string; appName?: string } = {},
): Promise<UploadResult> {
  const appName = options.appName ?? DEFAULT_APP_NAME;

  const presignRes = await fetch(
    `/api/upload/${encodeURIComponent(appName)}/s3/presign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destId: options.destId,
        fileName: file.name,
        contentType: file.type || undefined,
      }),
    },
  );
  const presigned = await parseJsonOrThrow(presignRes);

  const putHeaders: Record<string, string> = {
    ...(presigned.requiredHeaders ?? {}),
  };

  const putRes = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: putHeaders,
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`上傳到 S3 節點失敗（${putRes.status}）`);
  }

  return {
    url: presigned.publicUrl,
    fileName: presigned.fileName,
    size: file.size,
    mimeType: file.type || undefined,
  };
}

/**
 * 簡易上傳：不指定目的地，自動挑「目前已啟用」的第一個上傳目的地
 * （優先本機，其次 S3）。給不需要讓使用者選目的地的簡單上傳 UI 用，
 * 例如資料管理頁的「檔案 File」來源。
 */
export async function uploadFileToFirstEnabledDest(
  file: File,
  appName: string = DEFAULT_APP_NAME,
): Promise<UploadResult> {
  const destinations = await listUploadDestinations(appName);
  if (destinations.length === 0) {
    throw new Error(
      '尚未設定任何已啟用的上傳目的地，請先到「App 設定」新增並啟用一個。',
    );
  }
  const dest = destinations.find((d) => d.kind === "local") ?? destinations[0];
  return uploadFile(file, dest, appName);
}

/** 依目的地種類自動選擇上傳方式。 */
export async function uploadFile(
  file: File,
  dest: Pick<UploadDest, "kind" | "id">,
  appName: string = DEFAULT_APP_NAME,
): Promise<UploadResult> {
  return dest.kind === "local"
    ? uploadFileToLocal(file, { destId: dest.id, appName })
    : uploadFileToS3(file, { destId: dest.id, appName });
}
