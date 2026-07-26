// ============================================================
// 跨目的地檔案同步（server 端核心邏輯）
//
// 「同步」在這個專案裡的意義：把某個 file DataSource 目前的檔案內容，
// 複製一份到另一個「已啟用的上傳目的地」，讓同一份檔案在本機磁碟 /
// 多個 S3 相容節點之間保持一致，之後不論切換到哪個目的地都讀得到。
//
// 整個流程完全在 server 端完成（不透過瀏覽器轉手），原因：
//   1. 來源可能是私有 S3 bucket（沒有公開讀取權限、也沒有 CORS），
//      瀏覽器直接 fetch 會失敗；server 端可以用 presigned GET URL 讀取。
//   2. 來源也可能是「另一個本機目的地」的磁碟檔案，server 端可以直接
//      讀檔案系統，不需要多繞一層 HTTP。
//   3. 統一由 server 讀出 Buffer 之後，再依「目標」目的地種類選擇寫入
//      方式（本機：直接寫檔；S3：用 presigned PUT 由 server 端自己發出，
//      不需要瀏覽器參與）。
//
// 讀取來源檔案內容的優先順序（readSourceFile）：
//   1. 若 sourceUrl 剛好對應到某個「本機」目的地（appName 相同），直接
//      從磁碟讀取，最快也最省一次網路往返。
//   2. 若 sourceUrl 剛好對應到某個「S3」目的地（appName 相同），代表
//      這是我們自己上傳產生的物件，且我們手上有這組憑證：用
//      presignGetObject() 產生簽名 GET URL 再 fetch，即使 bucket 是
//      私有的也讀得到。
//   3. 都對不上（例如來源是外部網址、或使用者手動填的 url）：直接
//      fetch(sourceUrl)，只適用於公開可讀的網址。
// ============================================================

import { promises as fs } from "node:fs";
import type {
  LocalUploadDest,
  S3UploadDest,
  UploadDest,
} from "../src/lib/upload-destinations.types";
import { readAppSettings } from "./settings-store";
import { saveLocalUpload, resolveLocalFileForRead } from "./local-upload";
import {
  presignPutObject,
  presignGetObject,
  resolvePublicUrl,
  extractKeyIfMatches,
} from "./s3-presign";
import { makeStoredFileName } from "./filename";

export interface SyncFileParams {
  appName: string;
  /** 目前這個檔案的 url（可能來自本機目的地、S3 目的地、或外部網址） */
  sourceUrl: string;
  /** 要同步過去的目標目的地 id */
  destId: string;
  /** 原始檔名（用來決定新檔案保留的副檔名） */
  fileName: string;
  mimeType?: string;
}

export interface SyncFileResult {
  ok: true;
  destId: string;
  url: string;
  size: number;
  mimeType?: string;
}

export class SyncError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** 依 appName 目前的設定，嘗試把 sourceUrl 讀成 Buffer。 */
async function readSourceFile(
  appName: string,
  sourceUrl: string,
  destinations: UploadDest[],
): Promise<{ data: Buffer; mimeType?: string }> {
  // 1) 本機目的地：直接讀磁碟
  for (const d of destinations) {
    if (d.kind !== "local") continue;
    const filePath = resolveLocalFileForRead(d as LocalUploadDest, appName, sourceUrl);
    if (!filePath) continue;
    try {
      const data = await fs.readFile(filePath);
      return { data };
    } catch {
      // 這個本機目的地「形狀」對得上但實際檔案不存在，繼續嘗試其他來源
      continue;
    }
  }

  // 2) S3 目的地：反推 key，用 presigned GET 讀取（即使是私有 bucket 也讀得到）
  for (const d of destinations) {
    if (d.kind !== "s3") continue;
    const s3dest = d as S3UploadDest;
    if (!s3dest.bucket || !s3dest.accessKeyId || !s3dest.secretAccessKey) continue;
    const key = extractKeyIfMatches(s3dest, sourceUrl);
    if (!key) continue;
    const presigned = presignGetObject({ dest: s3dest, key });
    const res = await fetch(presigned.downloadUrl);
    if (!res.ok) {
      throw new SyncError(
        `讀取來源檔案失敗（S3 節點「${s3dest.label || s3dest.id}」回應 ${res.status}）`,
        502,
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const mimeType = res.headers.get("content-type") ?? undefined;
    return { data: buf, mimeType };
  }

  // 3) 都對不上：當作一般公開網址直接抓（例如使用者手動填的外部 url）
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      throw new SyncError(`讀取來源檔案失敗（回應 ${res.status}）`, 502);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const mimeType = res.headers.get("content-type") ?? undefined;
    return { data: buf, mimeType };
  } catch (err) {
    if (err instanceof SyncError) throw err;
    throw new SyncError(
      `無法讀取來源檔案「${sourceUrl}」：${err instanceof Error ? err.message : "未知錯誤"}`,
      502,
    );
  }
}

/** 把讀到的檔案內容寫入目標目的地。 */
async function writeToDestination(params: {
  dest: UploadDest;
  appName: string;
  fileName: string;
  data: Buffer;
  mimeType?: string;
}): Promise<SyncFileResult> {
  const { dest, appName, fileName, data, mimeType } = params;

  if (dest.kind === "local") {
    const result = await saveLocalUpload({
      dest,
      appName,
      originalName: fileName,
      data,
      mimeType,
    });
    return {
      ok: true,
      destId: dest.id,
      url: result.url,
      size: result.size,
      mimeType: result.mimeType,
    };
  }

  // S3：server 端自己拿 presigned PUT 直接上傳，不需要瀏覽器參與
  if (!dest.bucket || !dest.accessKeyId || !dest.secretAccessKey) {
    throw new SyncError(
      `目標 S3 目的地「${dest.label || dest.id}」設定不完整（bucket / accessKeyId / secretAccessKey）`,
    );
  }
  const storedFileName = makeStoredFileName(fileName);
  const key = `uploads/${appName}/${storedFileName}`;
  const presigned = presignPutObject({ dest, key, contentType: mimeType });

  const putRes = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: presigned.requiredHeaders,
    body: data,
  });
  if (!putRes.ok) {
    throw new SyncError(
      `寫入 S3 節點「${dest.label || dest.id}」失敗（回應 ${putRes.status}）`,
      502,
    );
  }

  return {
    ok: true,
    destId: dest.id,
    url: resolvePublicUrl(dest, key),
    size: data.length,
    mimeType,
  };
}

/**
 * 把 sourceUrl 指向的檔案，同步一份到 destId 對應的目的地。
 * 目的地必須是目前設定裡「已啟用」的目的地之一，否則視為設定錯誤直接拒絕。
 */
export async function syncFileToDestination(
  params: SyncFileParams,
): Promise<SyncFileResult> {
  const { appName, sourceUrl, destId, fileName, mimeType } = params;

  if (!sourceUrl) throw new SyncError("缺少 sourceUrl");
  if (!destId) throw new SyncError("缺少 destId");
  if (!fileName) throw new SyncError("缺少 fileName");

  const settings = await readAppSettings(appName);
  const destinations = settings.uploadDestinations;

  const targetDest = destinations.find((d) => d.id === destId && d.enabled);
  if (!targetDest) {
    throw new SyncError(`找不到已啟用的同步目標目的地：${destId}`, 404);
  }

  const { data, mimeType: sourceMimeType } = await readSourceFile(
    appName,
    sourceUrl,
    destinations,
  );

  return writeToDestination({
    dest: targetDest,
    appName,
    fileName,
    data,
    mimeType: mimeType || sourceMimeType,
  });
}