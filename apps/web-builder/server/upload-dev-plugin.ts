// ============================================================
// Vite dev server plugin：本機上傳 API + S3 presign 純前端上傳 API
//
// 提供的路由（全部掛在 /api 底下，:appName 是 namespace，預設 "default"）：
//
//   POST /api/settings/:appName
//     body: { uploadDestinations: UploadDest[] }
//     App 設定頁按「儲存設定」時呼叫，把上傳目的地設定同步寫到
//     apps/web-builder/.data/<appName>/app-settings.json。這是本機上傳 /
//     S3 presign 這兩個 API 讀取設定的唯一來源。
//
//   GET  /api/settings/:appName
//     讀回目前存檔的設定（除錯 / 之後其他頁面要用）。
//
//   GET  /api/upload/:appName/destinations
//     列出目前「已啟用」的上傳目的地（S3 的 secretAccessKey 會被拿掉，
//     不回給前端），讓上傳元件知道有哪些目的地可以選。
//
//   POST /api/upload/:appName/local?destId=xxx
//     multipart/form-data，欄位名稱固定用 "file"。
//     依 destId 找到對應（kind: "local"）的目的地設定，把檔案寫到
//     <storagePath>/<appName>/<隨機檔名>，保留原始副檔名。
//
//   GET  /api/upload/:appName/local/file/:fileName
//     若該本機目的地沒填 publicBaseUrl，上傳完回傳的 url 會指到這條路由，
//     直接把檔案讀出來當靜態檔回應（開發用途）。
//
//   POST /api/upload/:appName/s3/presign
//     body: { destId, fileName, contentType? }
//     依 destId 找到對應（kind: "s3"）的目的地設定，計算 SigV4
//     presigned PUT URL，回傳給前端後由「前端直接」對該 URL 發
//     PUT 上傳檔案本體 —— 檔案完全不經過這個 dev server。
// ============================================================

import type { Plugin, ViteDevServer, Connect } from "vite";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { LocalUploadDest, S3UploadDest } from "../src/lib/upload-destinations.types";
import {
  readAppSettings,
  writeAppSettings,
  sanitizeAppName,
  DEFAULT_APP_NAME,
} from "./settings-store";
import { parseMultipart } from "./multipart";
import { saveLocalUpload } from "./local-upload";
import { presignPutObject, resolvePublicUrl } from "./s3-presign";
import { makeStoredFileName, isSafePathSegment } from "./filename";

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(payload);
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const buf = await readRequestBody(req);
  if (buf.length === 0) return {} as T;
  return JSON.parse(buf.toString("utf-8")) as T;
}

/** 回給前端的「已啟用目的地」清單，拿掉 S3 的密鑰欄位。 */
function toPublicDest(dest: LocalUploadDest | S3UploadDest) {
  if (dest.kind === "s3") {
    const { secretAccessKey: _secretAccessKey, ...rest } = dest;
    return rest;
  }
  return dest;
}

export function uploadDevPlugin(): Plugin {
  return {
    name: "web-builder:upload-dev-api",
    configureServer(server: ViteDevServer) {
      const middleware: Connect.NextHandleFunction = async (req, res, next) => {
        try {
          if (!req.url || !req.url.startsWith("/api/")) return next();

          const fullUrl = new URL(req.url, "http://localhost");
          const segments = fullUrl.pathname.split("/").filter(Boolean); // ["api", ...]

          // ---------- /api/settings/:appName ----------
          if (segments[0] === "api" && segments[1] === "settings") {
            const appName = sanitizeAppName(segments[2] ?? DEFAULT_APP_NAME);

            if (req.method === "GET") {
              const settings = await readAppSettings(appName);
              return json(res, 200, settings);
            }

            if (req.method === "POST") {
              const body = await readJsonBody<{ uploadDestinations?: unknown }>(req);
              if (!Array.isArray(body.uploadDestinations)) {
                return json(res, 400, {
                  error: "body.uploadDestinations 必須是陣列",
                });
              }
              await writeAppSettings(appName, {
                uploadDestinations: body.uploadDestinations as (
                  | LocalUploadDest
                  | S3UploadDest
                )[],
              });
              return json(res, 200, { ok: true, appName });
            }

            return json(res, 405, { error: "Method Not Allowed" });
          }

          // ---------- /api/upload/:appName/... ----------
          if (segments[0] === "api" && segments[1] === "upload") {
            const rawAppName = segments[2] ?? DEFAULT_APP_NAME;
            const appName = sanitizeAppName(rawAppName);
            const sub = segments[3]; // "destinations" | "local" | "s3"

            // GET /api/upload/:appName/destinations
            if (sub === "destinations" && req.method === "GET") {
              const settings = await readAppSettings(appName);
              const enabled = settings.uploadDestinations
                .filter((d) => d.enabled)
                .map(toPublicDest);
              return json(res, 200, { appName, destinations: enabled });
            }

            // GET /api/upload/:appName/local/file/:fileName
            if (
              sub === "local" &&
              segments[4] === "file" &&
              segments[5] &&
              req.method === "GET"
            ) {
              const fileName = decodeURIComponent(segments[5]);
              if (!isSafePathSegment(fileName)) {
                return json(res, 400, { error: "非法檔名" });
              }
              const settings = await readAppSettings(appName);
              // 找出第一個本機目的地來定位檔案根目錄（開發用途的靜態檔服務）
              const localDest = settings.uploadDestinations.find(
                (d): d is LocalUploadDest => d.kind === "local" && !!d.storagePath,
              );
              if (!localDest) {
                return json(res, 404, { error: "找不到本機上傳目的地設定" });
              }
              const filePath = path.join(
                localDest.storagePath,
                appName,
                fileName,
              );
              try {
                const data = await fs.readFile(filePath);
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/octet-stream");
                res.end(data);
                return;
              } catch {
                return json(res, 404, { error: "檔案不存在" });
              }
            }

            // POST /api/upload/:appName/local?destId=xxx
            if (sub === "local" && req.method === "POST") {
              const destId = fullUrl.searchParams.get("destId");
              const contentType = req.headers["content-type"] || "";
              if (!contentType.includes("multipart/form-data")) {
                return json(res, 400, {
                  error: "Content-Type 必須是 multipart/form-data",
                });
              }

              const settings = await readAppSettings(appName);
              const dest = settings.uploadDestinations.find(
                (d): d is LocalUploadDest =>
                  d.kind === "local" && (!destId || d.id === destId) && d.enabled,
              );
              if (!dest) {
                return json(res, 404, {
                  error: destId
                    ? `找不到已啟用的本機上傳目的地：${destId}`
                    : "此 app 尚未設定任何已啟用的本機上傳目的地",
                });
              }

              const bodyBuf = await readRequestBody(req);
              const fields = parseMultipart(bodyBuf, contentType);
              const filePart = fields.find(
                (f) => f.name === "file" && f.filename,
              );
              if (!filePart || !filePart.filename) {
                return json(res, 400, {
                  error: '找不到檔案欄位，multipart 欄位名稱需為 "file"',
                });
              }

              try {
                const result = await saveLocalUpload({
                  dest,
                  appName,
                  originalName: filePart.filename,
                  data: filePart.data,
                  mimeType: filePart.contentType,
                });
                return json(res, 200, { ok: true, appName, destId: dest.id, ...result });
              } catch (err) {
                return json(res, 500, {
                  error: err instanceof Error ? err.message : "上傳失敗",
                });
              }
            }

            // POST /api/upload/:appName/s3/presign
            if (sub === "s3" && segments[4] === "presign" && req.method === "POST") {
              const body = await readJsonBody<{
                destId?: string;
                fileName?: string;
                contentType?: string;
              }>(req);

              if (!body.fileName) {
                return json(res, 400, { error: "缺少 fileName" });
              }

              const settings = await readAppSettings(appName);
              const dest = settings.uploadDestinations.find(
                (d): d is S3UploadDest =>
                  d.kind === "s3" &&
                  (!body.destId || d.id === body.destId) &&
                  d.enabled,
              );
              if (!dest) {
                return json(res, 404, {
                  error: body.destId
                    ? `找不到已啟用的 S3 上傳目的地：${body.destId}`
                    : "此 app 尚未設定任何已啟用的 S3 上傳目的地",
                });
              }
              if (!dest.bucket || !dest.accessKeyId || !dest.secretAccessKey) {
                return json(res, 400, {
                  error: "此 S3 目的地設定不完整（bucket / accessKeyId / secretAccessKey）",
                });
              }

              // 保留原始副檔名的 key：uploads/<appName>/<隨機檔名.ext>
              const storedFileName = makeStoredFileName(body.fileName);
              const key = `uploads/${appName}/${storedFileName}`;

              try {
                const presigned = presignPutObject({
                  dest,
                  key,
                  contentType: body.contentType,
                });
                const publicUrl = resolvePublicUrl(dest, key);
                return json(res, 200, {
                  ok: true,
                  appName,
                  destId: dest.id,
                  key,
                  fileName: storedFileName,
                  ...presigned,
                  publicUrl,
                });
              } catch (err) {
                return json(res, 500, {
                  error: err instanceof Error ? err.message : "簽名失敗",
                });
              }
            }
          }

          return next();
        } catch (err) {
          json(res, 500, {
            error: err instanceof Error ? err.message : "未預期的伺服器錯誤",
          });
        }
      };

      // 掛在 Vite 內建 middleware 之前，確保 /api/* 一律由這裡處理
      server.middlewares.use(middleware);
    },
  };
}
