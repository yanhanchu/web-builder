/**
 * Vite plugin：只在 `vite dev`（configureServer 不會在 build 觸發）掛一個 middleware，
 * 同一個路徑 `/__api/write-routes` 依 HTTP method 分派：
 *  - POST /__api/write-routes：把 `/routes`（RouteManager）目前編輯的整份
 *    routesData（app -> RouteEntry[]）依 app 各自寫回 `data/{app}/routes.json`
 *    （見 write-routes.mjs 的 writeRoutesToDisk）
 *  - GET  /__api/write-routes：讀取磁碟上目前所有 app 的 routes.json，
 *    供「從檔案系統讀取（覆蓋）」按鈕使用（見 write-routes.mjs 的
 *    readAllRoutesFromDisk），與 write-pages-plugin.mjs 的 GET 語意一致：
 *    整批覆蓋瀏覽器端目前的 routes 編輯狀態（localStorage），不會 merge。
 *
 * 安全性：
 * - 僅在 dev server 掛載，正式 build 產物完全不含這個寫檔 API。
 * - 輸出路徑固定為 data/{app}/routes.json，不接受任意路徑；app / route id
 *   只允許安全字元（見 write-routes.mjs 的驗證），避免路徑穿越或不合法資料寫入。
 */
import { writeRoutesToDisk, readAllRoutesFromDisk } from './write-routes.mjs';

const API_PATH = '/__api/write-routes';

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

export function writeRoutesPlugin() {
  return {
    name: 'write-routes-api',
    configureServer(server) {
      server.middlewares.use(API_PATH, async (req, res) => {
        if (req.method === 'GET') {
          try {
            const routesData = readAllRoutesFromDisk();
            sendJson(res, 200, { ok: true, routesData });
          } catch (err) {
            sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
          }
          return;
        }

        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Only GET/POST are supported' });
          return;
        }

        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: '請求 body 不是合法 JSON' });
          return;
        }

        const { routesData } = body ?? {};

        if (routesData == null || typeof routesData !== 'object' || Array.isArray(routesData)) {
          sendJson(res, 400, { ok: false, error: '缺少必要欄位：routesData（必須是物件，app -> RouteEntry[]）' });
          return;
        }

        const result = writeRoutesToDisk({ routesData });

        if (!result.ok) {
          sendJson(res, 422, result);
          return;
        }

        sendJson(res, 200, result);
      });
    },
  };
}
