/**
 * Vite plugin：只在 `vite dev`（configureServer 不會在 build 觸發）掛一個 middleware，
 * 同一個路徑 `/__api/write-data-records` 依 HTTP method 分派：
 *  - POST /__api/write-data-records：把 `/data`（DataManager）目前編輯的整份
 *    dataManagerData（app -> typeId -> DataRecordEntry[]）依 app + typeId 各自寫回
 *    `data/{app}/records/{typeId}.json`（見 write-data-records.mjs 的 writeDataRecordsToDisk）
 *  - GET  /__api/write-data-records：讀取磁碟上目前所有 app 的 records/*.json，
 *    供「從檔案系統讀取（覆蓋）」按鈕使用（見 write-data-records.mjs 的
 *    readAllDataRecordsFromDisk），與 write-routes-plugin.mjs 的 GET 語意一致：
 *    整批覆蓋瀏覽器端目前的資料編輯狀態（localStorage），不會 merge。
 *
 * 安全性：
 * - 僅在 dev server 掛載，正式 build 產物完全不含這個寫檔 API。
 * - 輸出路徑固定為 data/{app}/records/{typeId}.json，不接受任意路徑；app / typeId
 *   只允許安全字元（見 write-data-records.mjs 的驗證），避免路徑穿越或不合法資料寫入。
 */
import { writeDataRecordsToDisk, readAllDataRecordsFromDisk } from './write-data-records.mjs';

const API_PATH = '/__api/write-data-records';

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

export function writeDataRecordsPlugin() {
  return {
    name: 'write-data-records-api',
    configureServer(server) {
      server.middlewares.use(API_PATH, async (req, res) => {
        if (req.method === 'GET') {
          try {
            const dataManagerData = readAllDataRecordsFromDisk();
            sendJson(res, 200, { ok: true, dataManagerData });
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

        const { dataManagerData } = body ?? {};

        if (dataManagerData == null || typeof dataManagerData !== 'object' || Array.isArray(dataManagerData)) {
          sendJson(res, 400, { ok: false, error: '缺少必要欄位：dataManagerData（必須是物件，app -> typeId -> DataRecordEntry[]）' });
          return;
        }

        const result = writeDataRecordsToDisk({ dataManagerData });

        if (!result.ok) {
          sendJson(res, 422, result);
          return;
        }

        sendJson(res, 200, result);
      });
    },
  };
}
