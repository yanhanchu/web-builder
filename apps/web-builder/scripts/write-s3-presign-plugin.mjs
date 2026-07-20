/**
 * Vite plugin：只在 `vite dev`（configureServer 不會在 build 觸發）掛兩個
 * middleware，供「檔案管理」（/files）頁面使用：
 *
 *   POST /__api/s3-presign          上傳授權：body `{ app, filename, contentType }`，
 *                                    回傳 presigned PUT URL + 新的物件 key。
 *   POST /__api/s3-delete-presign   刪除授權：body `{ app, key }`，回傳
 *                                    presigned DELETE URL，用於刪除檔案時一併清掉
 *                                    已同步到 S3 的本體，避免留下孤兒物件。
 *
 * 前端拿到 URL 後直接對其發出對應的 HTTP method（PUT / DELETE），不需要
 * 再經過這個 dev server 中轉檔案本體，也就是題目要的「取得 token 和檔名後
 * 直接上傳至 S3/R2」。
 *
 * 純 SigV4 簽章與「驗證 storage 設定」的邏輯已抽到 `@workspace/server`
 * （見 packages/server/src/s3-presign-service.mjs），不綁定任何單一 app
 * 的資料存取方式；這裡（app 端）只負責這個 app 自己的部分：
 *   1. 用 app-fs.mjs 讀出 `data/{app}/app.json` 的 storage 設定
 *   2. 把 storage 設定物件連同 app / filename / key 一起傳進
 *      @workspace/server 的 createS3UploadPresign / createS3DeletePresign
 *
 * 安全性：
 * - 僅在 dev server 掛載，正式 build 產物完全不含這個端點。
 * - secretAccessKey 只在 server 端讀取、用來計算 SigV4 簽章，
 *   不會出現在回傳給前端的任何欄位。
 */
import { createS3UploadPresign, createS3DeletePresign } from '@workspace/server/s3-presign-service';
import { readJsonFile, appSettingsFile, isSafeId } from './app-fs.mjs';

const UPLOAD_API_PATH = '/__api/s3-presign';
const DELETE_API_PATH = '/__api/s3-delete-presign';
const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1MB，request body 只有少量 JSON 欄位，足夠寬裕

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        reject(new Error('請求內容過大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  if (raw.length === 0) return {};
  return JSON.parse(raw.toString('utf-8'));
}

/** 讀出指定 app 的 storage 設定（data/{app}/app.json 的 storage 欄位）。不合法或找不到時回傳 { error }。 */
function loadAppStorage(app) {
  if (!isSafeId(app)) {
    return { error: `不合法的 app 名稱：${JSON.stringify(app)}` };
  }
  const settings = readJsonFile(appSettingsFile(app), null);
  if (!settings) {
    return { error: `找不到 app 設定：data/${app}/app.json` };
  }
  return { storage: settings.storage };
}

export function writeS3PresignPlugin() {
  return {
    name: 'write-s3-presign-api',
    configureServer(server) {
      server.middlewares.use(UPLOAD_API_PATH, async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Only POST is supported' });
          return;
        }
        try {
          const body = await readJsonBody(req);
          const { app, filename, contentType } = body ?? {};
          if (typeof app !== 'string' || typeof filename !== 'string') {
            sendJson(res, 400, { ok: false, error: '缺少必要欄位：app / filename' });
            return;
          }
          const resolved = loadAppStorage(app);
          if (resolved.error) {
            sendJson(res, 422, { ok: false, error: resolved.error });
            return;
          }
          const result = createS3UploadPresign({ app, storage: resolved.storage, filename, contentType });
          sendJson(res, result.ok ? 200 : 422, result);
        } catch (err) {
          sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      });

      server.middlewares.use(DELETE_API_PATH, async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Only POST is supported' });
          return;
        }
        try {
          const body = await readJsonBody(req);
          const { app, key } = body ?? {};
          if (typeof app !== 'string' || typeof key !== 'string') {
            sendJson(res, 400, { ok: false, error: '缺少必要欄位：app / key' });
            return;
          }
          const resolved = loadAppStorage(app);
          if (resolved.error) {
            sendJson(res, 422, { ok: false, error: resolved.error });
            return;
          }
          const result = createS3DeletePresign({ storage: resolved.storage, key });
          sendJson(res, result.ok ? 200 : 422, result);
        } catch (err) {
          sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
