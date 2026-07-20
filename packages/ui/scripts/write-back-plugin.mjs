/**
 * Vite plugin：只在 `vite dev`（configureServer 只會在 serve 模式被呼叫，
 * `vite build` 走 config/generateBundle 這條路，不會觸發 configureServer）時，
 * 掛兩個 middleware：
 *  - POST /__api/update-prop：組件 props 的 description / defaultValue 寫回（見 write-back.mjs）
 *  - POST /__api/update-function-description：函式 JSDoc description 寫回（見 write-back-functions.mjs）
 * 寫檔成功後分別重新執行對應的 docs:generate / functions:generate，
 * 讓 components.json / functions.json 同步更新，Vite 的 HMR 會偵測到檔案變動並自動刷新頁面。
 *
 * 安全性：
 * - 僅在 dev server 掛載，正式 build 產物完全不含這些 API，不會有寫檔端點外洩到正式環境的疑慮。
 * - filePath 一律限制在對應的來源資料夾底下（src/components/ 或 src/functions/），避免任意路徑寫入。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { updateProp } from './write-back.mjs';
import { updateFunctionDescription } from './write-back-functions.mjs';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API_PATH = '/__api/update-prop';
const FUNCTION_API_PATH = '/__api/update-function-description';

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

/** 確保 filePath 落在 src/components/ 底下，避免路徑穿越攻擊 */
function isSafeComponentPath(filePath) {
  const normalized = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const abs = path.resolve(ROOT, normalized);
  const allowedRoots = ['src/components'].map((p) =>
    path.resolve(ROOT, p)
  );
  return (
    allowedRoots.some((root) => abs.startsWith(root + path.sep)) && abs.endsWith('.tsx')
  );
}

/** 確保 filePath 落在 src/functions/ 底下，避免路徑穿越攻擊 */
function isSafeFunctionPath(filePath) {
  const normalized = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const abs = path.resolve(ROOT, normalized);
  const allowedRoot = path.resolve(ROOT, 'src/functions');
  return abs.startsWith(allowedRoot + path.sep) && abs.endsWith('.ts');
}

export function writeBackPlugin() {
  return {
    name: 'write-back-api',
    // configureServer 只在 `vite dev` 生效，build 模式不會呼叫這個 hook，
    // 因此這些 API 保證只存在於開發環境。
    configureServer(server) {
      server.middlewares.use(API_PATH, async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Only POST is supported' });
          return;
        }

        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: '請求 body 不是合法 JSON' });
          return;
        }

        const { filePath, componentName, propName, propType, description, defaultValue } = body ?? {};

        if (!filePath || !componentName || !propName || typeof propType !== 'string') {
          sendJson(res, 400, {
            ok: false,
            error: '缺少必要欄位：filePath / componentName / propName / propType',
          });
          return;
        }

        if (!isSafeComponentPath(filePath)) {
          sendJson(res, 400, { ok: false, error: `不允許的檔案路徑：${filePath}` });
          return;
        }

        const result = updateProp({
          filePath,
          componentName,
          propName,
          propType,
          description,
          defaultValue,
        });

        if (!result.ok) {
          sendJson(res, 422, result);
          return;
        }

        // 寫回 tsx 後，重新產生 components.json / component-map.ts，
        // 讓 registry.ts 讀到的靜態資料、以及 PropsTable 顯示的內容立刻同步。
        try {
          await execFileAsync('node', ['scripts/generate-docs.mjs'], { cwd: ROOT });
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            error: `寫回 tsx 成功，但重新產生文件資料失敗：${err instanceof Error ? err.message : String(err)}`,
          });
          return;
        }

        sendJson(res, 200, { ok: true, changedFile: result.changedFile });
      });

      server.middlewares.use(FUNCTION_API_PATH, async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Only POST is supported' });
          return;
        }

        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: '請求 body 不是合法 JSON' });
          return;
        }

        const { filePath, functionName, description } = body ?? {};

        if (!filePath || !functionName || typeof description !== 'string') {
          sendJson(res, 400, {
            ok: false,
            error: '缺少必要欄位：filePath / functionName / description',
          });
          return;
        }

        if (!isSafeFunctionPath(filePath)) {
          sendJson(res, 400, { ok: false, error: `不允許的檔案路徑：${filePath}` });
          return;
        }

        const result = updateFunctionDescription({ filePath, functionName, description });

        if (!result.ok) {
          sendJson(res, 422, result);
          return;
        }

        // 寫回 .ts 後，重新產生 functions.json / function-types.ts，
        // 讓 functions-registry.ts 讀到的靜態資料、以及 FunctionDetail 顯示的內容立刻同步。
        try {
          await execFileAsync('node', ['scripts/generate-functions-docs.mjs'], { cwd: ROOT });
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            error: `寫回 .ts 成功，但重新產生函式文件資料失敗：${err instanceof Error ? err.message : String(err)}`,
          });
          return;
        }

        sendJson(res, 200, { ok: true, changedFile: result.changedFile });
      });
    },
  };
}

