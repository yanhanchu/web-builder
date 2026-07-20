/**
 * Vite plugin：只在 `vite dev`（configureServer 不會在 build 觸發）掛一個 middleware，
 * 同一個路徑 `/__api/write-pages` 依 HTTP method 分派：
 *  - POST /__api/write-pages：把 `/live/edit` 系列頁面（AppManager / PageEditor）
 *    目前編輯的整份 pagesData（app -> PageDef[]）依 app 各自寫回
 *    `data/{app}/pages.json`（見 write-pages.mjs 的 writePagesToDisk）
 *  - GET  /__api/write-pages：讀取磁碟上目前所有 app 的 pages.json，
 *    供「從檔案系統讀取（覆蓋）」按鈕使用（見 write-pages.mjs 的
 *    readAllPagesFromDisk），與 write-i18n-plugin.mjs 的 GET 語意一致：
 *    整批覆蓋瀏覽器端目前的 pages 編輯狀態（localStorage），不會 merge。
 *
 * 安全性：
 * - 僅在 dev server 掛載，正式 build 產物完全不含這個寫檔 API。
 * - 輸出路徑固定為 data/{app}/pages.json，不接受任意路徑；app / page id
 *   只允許安全字元（見 write-pages.mjs 的 isSafeId），避免路徑穿越或不合法資料寫入。
 *
 * 寫入成功後，`data/{app}/pages.json` 的檔案變動會被 Vite 既有的 HMR 機制偵測到，
 * src/lib/app-data.ts 裡的 import.meta.hot.accept() 會接手更新並廣播給訂閱者，
 * dynamic-page.tsx 訂閱後，`/live` 系列頁面會立即反映最新內容，不需要整頁刷新。
 */
import { writePagesToDisk, readAllPagesFromDisk } from './write-pages.mjs';

const API_PATH = '/__api/write-pages';

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

export function writePagesPlugin() {
  return {
    name: 'write-pages-api',
    configureServer(server) {
      server.middlewares.use(API_PATH, async (req, res) => {
        if (req.method === 'GET') {
          try {
            const pagesData = readAllPagesFromDisk();
            sendJson(res, 200, { ok: true, pagesData });
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

        const { pagesData } = body ?? {};

        if (pagesData == null || typeof pagesData !== 'object' || Array.isArray(pagesData)) {
          sendJson(res, 400, { ok: false, error: '缺少必要欄位：pagesData（必須是物件，app -> PageDef[]）' });
          return;
        }

        const result = writePagesToDisk({ pagesData });

        if (!result.ok) {
          sendJson(res, 422, result);
          return;
        }

        sendJson(res, 200, result);
      });
    },
  };
}
