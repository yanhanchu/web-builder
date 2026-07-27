// ============================================================
// 前端上傳 client：呼叫 vite dev server 提供的上傳 API
// （server/upload-dev-plugin.ts）
//
// 不論最終目的地是哪種 kind，檔案一律先寫進瀏覽器的 OPFS
// （opfs.ts 的 saveFileToOpfs()），這是「一定會做」的第一步。
//
// 在 OPFS 之外，只要「已啟用」的上傳目的地清單不是空的，選檔／拖檔
// 上傳時就會自動平行送到「每一個」已啟用目的地（uploadFileToAllEnabledDests）
// ——不再是「選一個目的地上傳，其他之後再手動同步」。之後 file-sync-panel.tsx
// 那個同步狀態叢集純粹是「備援」：只有在自動上傳當下失敗（網路問題、
// 目的地設定錯誤…）的目的地，才需要靠手動按同步鈕補救；成功的目的地
// 一開始就已經是 synced 狀態。
//
//   - 本機上傳目的地：uploadFileToLocal()  -> 先存進 OPFS，再把 OPFS
//     裡的內容包成 multipart POST 給 dev server，整份檔案內容還是會
//     經過 dev server 寫進 storagePath（跟原本行為一致），只是多了
//     OPFS 這一步「前端也留一份」。
//   - S3 相容目的地：uploadFileToS3()      -> 先存進 OPFS，再跟 dev
//     server 要 presigned URL（帶正確的 contentLength，鎖進 SigV4
//     簽名，S3 端會強制核對上傳 body 大小），由「瀏覽器直接」PUT 給
//     S3 / MinIO / R2 / B2，檔案本體不經過 dev server（純前端上傳）。
//   - 跨目的地同步（備援用）：syncFileToDestination() -> 讀取「目前
//     已存在」的檔案內容（OPFS 或一般網址），整個讀取＋寫入流程都在
//     「前端」完成：寫回本機目的地一樣是 multipart POST 給 dev server
//     的 /local；寫到 S3 一樣是 presigned PUT。dev server 不提供
//     /sync 這條路由，同步的「協調」邏輯整個搬到瀏覽器端，也不處理
//     CORS。
//
// appName 是這一整套前端（web-builder）之後要接多 app / namespace
// 時的區隔依據；目前前端還沒有 app 的概念，一律用 "default"。
// ============================================================

import type { UploadDest } from "./upload-destinations";
import {
  saveFileToOpfs,
  readOpfsFileByUrl,
  writeOpfsFile,
  isOpfsUrl,
  makeOpfsFileName,
} from "./opfs";

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

/** 把一個 File/Blob 包成 multipart/form-data，POST 給 dev server 的本機上傳路由。 */
async function postMultipartToLocal(
  data: Blob,
  fileName: string,
  options: { destId?: string; appName: string; mimeType?: string },
): Promise<{ url: string; fileName: string; size: number; mimeType?: string }> {
  const form = new FormData();
  form.append("file", data, fileName);

  const url = new URL(
    `/api/upload/${encodeURIComponent(options.appName)}/local`,
    window.location.origin,
  );
  if (options.destId) url.searchParams.set("destId", options.destId);

  const res = await fetch(url, { method: "POST", body: form });
  const body = await parseJsonOrThrow(res);
  return {
    url: body.url,
    fileName: body.fileName,
    size: body.size,
    mimeType: body.mimeType ?? options.mimeType,
  };
}

/** 跟 dev server 要 S3 presigned PUT URL，並把 body 大小一起帶上（contentLength），讓 server 端做上限檢查、也讓 S3 端把大小鎖進簽名強制核對。 */
async function requestS3Presign(params: {
  appName: string;
  destId?: string;
  fileName: string;
  contentType?: string;
  contentLength: number;
}): Promise<any> {
  const res = await fetch(
    `/api/upload/${encodeURIComponent(params.appName)}/s3/presign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destId: params.destId,
        fileName: params.fileName,
        contentType: params.contentType,
        contentLength: params.contentLength,
      }),
    },
  );
  return parseJsonOrThrow(res);
}

/**
 * 上傳到「本機」目的地：
 *   1. 先存進 OPFS（saveFileToOpfs），瀏覽器端留一份。
 *   2. 把 OPFS 裡剛存好的內容 multipart POST 給 dev server 的
 *      /api/upload/:appName/local，寫進 storagePath ——
 *      這一步跟原本行為一致，檔案內容還是會經過 dev server。
 */
export async function uploadFileToLocal(
  file: File,
  options: { destId?: string; appName?: string } = {},
): Promise<UploadResult> {
  const appName = options.appName ?? DEFAULT_APP_NAME;

  // 1) 先落地到 OPFS
  const saved = await saveFileToOpfs(file, appName, file.name);
  const opfsFile = await readOpfsFileByUrl(saved.url);

  // 2) 再把 OPFS 內容送給 dev server 寫進 storagePath
  return postMultipartToLocal(opfsFile, file.name, {
    destId: options.destId,
    appName,
    mimeType: file.type,
  });
}

/**
 * 上傳到「S3 相容」目的地：
 *   1. 先存進 OPFS（跟其他目的地一致，檔案一律先落地在瀏覽器）。
 *   2. 跟 dev server 要 presigned URL（server 只簽名，不經手檔案內容），
 *      帶上正確的 contentLength：server 端會檢查是否超過上限，並把它
 *      鎖進 SigV4 簽名，S3 端會強制核對實際上傳的 body 大小是否一致。
 *   3. 瀏覽器直接對該 URL 發 PUT，body 讀自剛剛存進 OPFS 的檔案。
 */
export async function uploadFileToS3(
  file: File,
  options: { destId?: string; appName?: string } = {},
): Promise<UploadResult> {
  const appName = options.appName ?? DEFAULT_APP_NAME;

  // 1) 先落地到 OPFS
  const saved = await saveFileToOpfs(file, appName, file.name);
  const opfsFile = await readOpfsFileByUrl(saved.url);

  // 2) 跟 dev server 要 presigned PUT URL（帶 contentLength）
  const presigned = await requestS3Presign({
    appName,
    destId: options.destId,
    fileName: file.name,
    contentType: file.type || undefined,
    contentLength: opfsFile.size,
  });

  // 3) 瀏覽器直接 PUT 給 S3 節點，檔案不經過 dev server；不處理 CORS。
  //    requiredHeaders 裡若有 Content-Length，瀏覽器 fetch 本來就會依
  //    body 大小自動帶正確值，這裡不需要（也不能）手動覆寫該 header，
  //    只要讀出來確認跟 opfsFile.size 一致即可。
  const putHeaders: Record<string, string> = {};
  if (presigned.requiredHeaders?.["Content-Type"]) {
    putHeaders["Content-Type"] = presigned.requiredHeaders["Content-Type"];
  }
  const putRes = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: putHeaders,
    body: opfsFile,
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

/** 依目的地種類自動選擇上傳方式。兩種 kind 都會先把檔案存進 OPFS。 */
export async function uploadFile(
  file: File,
  dest: Pick<UploadDest, "kind" | "id">,
  appName: string = DEFAULT_APP_NAME,
): Promise<UploadResult> {
  return dest.kind === "local"
    ? uploadFileToLocal(file, { destId: dest.id, appName })
    : uploadFileToS3(file, { destId: dest.id, appName });
}

export interface DestUploadOutcome {
  destId: string;
  destKind: "local" | "s3";
  ok: boolean;
  url?: string;
  errorMessage?: string;
}

export interface UploadToAllResult {
  /** OPFS 落地結果，一定會有（不論後面對外目的地成功與否）。 */
  opfsUrl: string;
  /**
   * 「主要」結果，給 DataSource.url 這類只需要單一網址的欄位使用：
   * 優先取第一個上傳成功的外部目的地（本機優先、其次 S3），
   * 一個都沒有已啟用的目的地、或全部失敗，就退回 OPFS 網址，
   * 至少檔案在瀏覽器端仍拿得到。
   */
  primary: UploadResult;
  /** 每個已啟用目的地各自的上傳結果，成功/失敗都會列出，供同步狀態叢集初始化用。 */
  perDestination: DestUploadOutcome[];
}

/**
 * 選檔／拖檔上傳的主要入口：
 *   1. 先存進 OPFS（不論後面有沒有已啟用的目的地，這一步一定會做）。
 *   2. 讀出目前「已啟用」的所有上傳目的地，平行呼叫 uploadFileToLocal /
 *      uploadFileToS3 逐一上傳（各自也都會各自重存一次 OPFS 副本，
 *      屬於 no-op 的小浪費，換來每個目的地各自獨立、互不影響失敗）。
 *   3. 回傳每個目的地的成敗，讓呼叫端（file-sync-panel.tsx 的
 *      useFileSync）可以把「自動上傳當下就成功」的目的地直接標成
 *      synced，不需要使用者再手動點一次；失敗的則維持 unsynced /
 *      failed，讓使用者可以用同步鈕當「備援」重試。
 */
export async function uploadFileToAllEnabledDests(
  file: File,
  appName: string = DEFAULT_APP_NAME,
): Promise<UploadToAllResult> {
  // 1) 一定先落地到 OPFS
  const savedOpfs = await saveFileToOpfs(file, appName, file.name);

  // 2) 讀目前已啟用的目的地，平行上傳
  const destinations = await listUploadDestinations(appName);

  const perDestination: DestUploadOutcome[] = await Promise.all(
    destinations.map(async (dest): Promise<DestUploadOutcome> => {
      try {
        const result =
          dest.kind === "local"
            ? await uploadFileToLocal(file, { destId: dest.id, appName })
            : await uploadFileToS3(file, { destId: dest.id, appName });
        return { destId: dest.id, destKind: dest.kind, ok: true, url: result.url };
      } catch (err) {
        return {
          destId: dest.id,
          destKind: dest.kind,
          ok: false,
          errorMessage: err instanceof Error ? err.message : "上傳失敗",
        };
      }
    }),
  );

  // 3) 決定「主要」結果：本機優先、其次 S3，一個都沒成功就退回 OPFS
  const firstOk =
    perDestination.find((d) => d.ok && d.destKind === "local") ??
    perDestination.find((d) => d.ok);

  const primary: UploadResult = firstOk?.url
    ? { url: firstOk.url, fileName: savedOpfs.fileName, size: file.size, mimeType: file.type || undefined }
    : { url: savedOpfs.url, fileName: savedOpfs.fileName, size: file.size, mimeType: file.type || undefined };

  return { opfsUrl: savedOpfs.url, primary, perDestination };
}

/**
 * 簡易上傳：存進 OPFS 並自動送到所有已啟用目的地，回傳「主要」結果
 * （見 uploadFileToAllEnabledDests 的 primary 說明）。給不需要處理
 * per-destination 細節的簡單上傳 UI 用，例如資料管理頁的「檔案 File」
 * 來源手動上傳按鈕。
 */
export async function uploadFileToFirstEnabledDest(
  file: File,
  appName: string = DEFAULT_APP_NAME,
): Promise<UploadResult> {
  const result = await uploadFileToAllEnabledDests(file, appName);
  return result.primary;
}

export interface SyncFileResult {
  url: string;
  size?: number;
  mimeType?: string;
}

/**
 * 把「目前已經存在」的檔案（sourceUrl，可能是 OPFS 裡的 opfs:// url、
 * dev server 本機目的地的網址、S3 目的地的網址、或使用者手動填的
 * 外部網址）同步一份到另一個已啟用的目的地。
 *
 * 這是「備援」路徑：選檔／拖檔上傳當下已經會自動送到所有已啟用目的地
 * （見 uploadFileToAllEnabledDests），只有在那次自動上傳失敗、或使用者
 * 是後來才啟用某個新目的地時，才需要用這個函式手動補一次。
 *
 * 整個同步流程都在「前端」完成，不再打 dev server 的 /sync 路由
 * （該路由已移除）：
 *   1. 讀來源內容：
 *      - sourceUrl 是 opfs:// -> 直接從 OPFS 讀（isOpfsUrl / readOpfsFileByUrl）
 *      - 其餘一律當作一般網址，瀏覽器直接 fetch()，不處理 CORS
 *   2. 寫入目標目的地：
 *      - local -> 先存回 OPFS 留一份，再 multipart POST 給 dev server
 *        的 /local，跟一般上傳走同一條路徑、同一套落地規則
 *      - s3    -> 跟 dev server 要 presigned PUT URL（帶正確
 *        contentLength），瀏覽器直接 PUT
 */
export async function syncFileToDestination(params: {
  sourceUrl: string;
  destId: string;
  destKind: "local" | "s3";
  fileName: string;
  mimeType?: string;
  appName?: string;
}): Promise<SyncFileResult> {
  const {
    sourceUrl,
    destId,
    destKind,
    fileName,
    mimeType,
    appName = DEFAULT_APP_NAME,
  } = params;

  // 1) 讀來源內容
  let data: Blob;
  let sourceMimeType: string | undefined;
  if (isOpfsUrl(sourceUrl)) {
    data = await readOpfsFileByUrl(sourceUrl);
    sourceMimeType = (data as File).type || undefined;
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      throw new Error(`讀取來源檔案失敗（${res.status}）`);
    }
    data = await res.blob();
    sourceMimeType = res.headers.get("content-type") ?? undefined;
  }
  const finalMimeType = mimeType || sourceMimeType;

  // 2) 寫入目標目的地
  if (destKind === "local") {
    // 先在 OPFS 留一份對應這次同步結果的副本，再送去 dev server 落地到 storagePath
    const opfsFileName = makeOpfsFileName(fileName);
    await writeOpfsFile(appName, opfsFileName, data);
    return postMultipartToLocal(data, fileName, {
      destId,
      appName,
      mimeType: finalMimeType,
    });
  }

  // s3：跟 dev server 要 presigned PUT URL（帶正確 contentLength），瀏覽器直接 PUT，不處理 CORS
  const presigned = await requestS3Presign({
    appName,
    destId,
    fileName,
    contentType: finalMimeType,
    contentLength: data.size,
  });

  const putHeaders: Record<string, string> = {};
  if (presigned.requiredHeaders?.["Content-Type"]) {
    putHeaders["Content-Type"] = presigned.requiredHeaders["Content-Type"];
  }
  const putRes = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: putHeaders,
    body: data,
  });
  if (!putRes.ok) {
    throw new Error(`同步到 S3 節點失敗（${putRes.status}）`);
  }

  return {
    url: presigned.publicUrl,
    size: data.size,
    mimeType: finalMimeType,
  };
}
