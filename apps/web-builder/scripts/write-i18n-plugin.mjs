/**
 * Vite plugin：只在 `vite dev`（configureServer 不會在 build 觸發）掛一個 middleware：
 *  - POST /__api/write-i18n：把 i18n 管理頁面（/i18n）目前編輯的某個 app 寫入
 *    `data/{app}/i18n/{locale}.json`（見 write-i18n.mjs）
 *  - GET  /__api/write-i18n：讀取檔案系統上的 i18n 資料，供「從檔案系統讀取」功能使用
 *      - 不帶 ?app= 參數：回傳 data/ 底下目前有哪些 app 資料夾（見 write-i18n.mjs 的 listAppsOnDisk）
 *      - 帶 ?app=xxx：讀取 data/{app}/i18n/ 底下所有語系 json，還原成 flat 形式回傳
 *
 * 安全性：
 * - 僅在 dev server 掛載，正式 build 產物完全不含這個 API。
 * - app / locale 只允許安全字元（見 app-fs.mjs 的 isSafeSegment），
 *   讀寫目錄一律限制在 data/{app}/i18n/ 底下（見 app-fs.mjs 的路徑組裝），避免任意路徑存取。
 */
import { writeAppToDisk, readAppFromDisk, listAppsOnDisk } from './write-i18n.mjs';

const API_PATH = '/__api/write-i18n';

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function writeI18nPlugin() {
  return {
    name: 'write-i18n-api',
    configureServer(server) {
      server.middlewares.use(API_PATH, async (req, res) => {
        if (req.method === 'GET') {
          const url = new URL(req.url ?? '', 'http://localhost');
          const app = url.searchParams.get('app');

          if (!app) {
            const result = listAppsOnDisk();
            sendJson(res, result.ok ? 200 : 500, result);
            return;
          }

          const result = readAppFromDisk({ app });
          sendJson(res, result.ok ? 200 : 404, result);
          return;
        }

        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Only GET and POST are supported' });
          return;
        }

        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: '請求 body 不是合法 JSON' });
          return;
        }

        const { app, locales, format, keyTypes, versionHistory } = body ?? {};

        if (!app || typeof app !== 'string') {
          sendJson(res, 400, { ok: false, error: '缺少必要欄位：app' });
          return;
        }
        if (!locales || typeof locales !== 'object') {
          sendJson(res, 400, { ok: false, error: '缺少必要欄位：locales' });
          return;
        }
        if (format !== 'flat' && format !== 'nested') {
          sendJson(res, 400, { ok: false, error: 'format 必須是 "flat" 或 "nested"' });
          return;
        }

        const result = writeAppToDisk({ app, locales, format, keyTypes, versionHistory });

        if (!result.ok) {
          sendJson(res, 422, result);
          return;
        }

        sendJson(res, 200, result);
      });
    },
  };
}
