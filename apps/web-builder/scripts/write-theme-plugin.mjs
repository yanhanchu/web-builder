/**
 * Vite plugin：只在 `vite dev`（configureServer 不會在 build 觸發）掛一個 middleware，
 * 同一個路徑 `/__api/write-theme` 依 HTTP method 分派：
 *  - POST /__api/write-theme：把 `/theme`（ThemeGenerator）目前編輯的
 *    ThemeConfig（連同前端已算好的 CSS 字串）寫回
 *    `data/{app}/theme.json` + `data/{app}/styles.css`
 *    （見 write-theme.mjs 的 writeThemeToDisk）
 *  - GET  /__api/write-theme?app=xxx：讀取磁碟上該 app 目前的
 *    theme.json，供「從檔案系統讀取（覆蓋）」按鈕使用（見
 *    write-theme.mjs 的 readThemeFromDisk），與 write-routes-plugin.mjs
 *    的 GET 語意一致：整份覆蓋瀏覽器端目前的主題編輯狀態，不會 merge。
 *
 * 安全性：
 * - 僅在 dev server 掛載，正式 build 產物完全不含這個寫檔 API。
 * - 輸出路徑固定為 data/{app}/theme.json + data/{app}/styles.css，不接受
 *   任意路徑；app 名稱與欄位型別/範圍皆在 write-theme.mjs 驗證過，避免
 *   路徑穿越或不合法資料寫入。
 */
import { writeThemeToDisk, readThemeFromDisk } from './write-theme.mjs';

const API_PATH = '/__api/write-theme';

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

export function writeThemePlugin() {
  return {
    name: 'write-theme-api',
    configureServer(server) {
      server.middlewares.use(API_PATH, async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const app = url.searchParams.get('app');

        if (req.method === 'GET') {
          if (!app) {
            sendJson(res, 400, { ok: false, error: '缺少必要參數：app' });
            return;
          }
          try {
            const themeConfig = readThemeFromDisk({ app });
            sendJson(res, 200, { ok: true, themeConfig });
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

        const { app: bodyApp, themeConfig, css } = body ?? {};
        const resolvedApp = bodyApp ?? app;

        if (!resolvedApp) {
          sendJson(res, 400, { ok: false, error: '缺少必要欄位：app' });
          return;
        }

        if (themeConfig == null || typeof themeConfig !== 'object' || Array.isArray(themeConfig)) {
          sendJson(res, 400, { ok: false, error: '缺少必要欄位：themeConfig（必須是物件）' });
          return;
        }

        const result = writeThemeToDisk({ app: resolvedApp, themeConfig, css });

        if (!result.ok) {
          sendJson(res, 422, result);
          return;
        }

        sendJson(res, 200, result);
      });
    },
  };
}
