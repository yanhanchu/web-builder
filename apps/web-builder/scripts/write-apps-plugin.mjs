/**
 * Vite plugin：只在 `vite dev`（configureServer 不會在 build 觸發）掛一個 middleware，
 * 同一個路徑 `/__api/write-apps` 依 HTTP method + `action` 分派：
 *
 *  - GET  /__api/write-apps                         → 掃描 data/{app}/ 底下所有目錄，
 *      各自讀出 app.json 組成 { [app]: AppSettings }（見 write-apps.mjs 的 readAppsFromDisk）
 *  - POST /__api/write-apps  { action: 'save', appsData }
 *      → 整批覆寫每個 app 各自的 data/{app}/app.json（設定欄位編輯用）
 *  - POST /__api/write-apps  { action: 'create', app, settings }
 *      → 新增 app：建立 data/{app}/ 目錄，寫入 app.json 與空的 pages.json（[]）
 *  - POST /__api/write-apps  { action: 'delete', app }
 *      → 刪除 app：整個刪除 data/{app}/ 目錄（含 app.json / pages.json / i18n/）
 *  - POST /__api/write-apps  { action: 'rename', oldName, newName }
 *      → 重新命名 app：把整個 data/{oldName}/ 目錄改名成 data/{newName}/
 *        （app.json / pages.json / i18n/ 隨目錄一起搬移）
 *
 * 沒有聚合檔：`data/{app}/app.json` 本身就是唯一資料來源，前端用
 * `import.meta.glob` 直接靜態掃描這些檔案（見 src/lib/app-data.ts），
 * 不需要另外維護一份彙整過的 data/apps.json / data/pages.json。
 *
 * 安全性：
 * - 僅在 dev server 掛載，正式 build 產物完全不含這個寫檔 API。
 * - app 名稱只允許安全字元（見 app-fs.mjs 的 isSafeId/isSafeSegment），
 *   讀寫目錄一律限制在 data/{app}/ 底下，避免路徑穿越。
 */
import {
  writeAppsToDisk,
  createApp,
  deleteApp,
  renameApp,
  readAppsFromDisk,
} from './write-apps.mjs';

const API_PATH = '/__api/write-apps';

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

export function writeAppsPlugin() {
  return {
    name: 'write-apps-api',
    configureServer(server) {
      server.middlewares.use(API_PATH, async (req, res) => {
        if (req.method === 'GET') {
          const result = readAppsFromDisk();
          sendJson(res, 200, result);
          return;
        }

        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Only GET/POST is supported' });
          return;
        }

        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: '請求 body 不是合法 JSON' });
          return;
        }

        const { action } = body ?? {};

        if (action === 'save') {
          const { appsData } = body;
          if (appsData == null || typeof appsData !== 'object' || Array.isArray(appsData)) {
            sendJson(res, 400, { ok: false, error: '缺少必要欄位：appsData' });
            return;
          }
          const result = writeAppsToDisk({ appsData });
          sendJson(res, result.ok ? 200 : 422, result);
          return;
        }

        if (action === 'create') {
          const { app, settings } = body;
          if (typeof app !== 'string' || !app) {
            sendJson(res, 400, { ok: false, error: '缺少必要欄位：app' });
            return;
          }
          const result = createApp({ app, settings });
          sendJson(res, result.ok ? 200 : 422, result);
          return;
        }

        if (action === 'delete') {
          const { app } = body;
          if (typeof app !== 'string' || !app) {
            sendJson(res, 400, { ok: false, error: '缺少必要欄位：app' });
            return;
          }
          const result = deleteApp({ app });
          sendJson(res, result.ok ? 200 : 422, result);
          return;
        }

        if (action === 'rename') {
          const { oldName, newName } = body;
          if (typeof oldName !== 'string' || !oldName || typeof newName !== 'string' || !newName) {
            sendJson(res, 400, { ok: false, error: '缺少必要欄位：oldName / newName' });
            return;
          }
          const result = renameApp({ oldName, newName });
          sendJson(res, result.ok ? 200 : 422, result);
          return;
        }

        sendJson(res, 400, { ok: false, error: `不支援的 action：${JSON.stringify(action)}` });
      });
    },
  };
}
