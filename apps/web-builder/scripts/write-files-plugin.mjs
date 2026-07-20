/**
 * Vite plugin：只在 `vite dev`（configureServer 不會在 build 觸發）掛一個
 * middleware，`POST /__api/upload-file`：接收「檔案管理」（/files）上傳的
 * multipart/form-data（欄位：app / id / file），寫入
 * `public/uploads/{app}/{id}{ext}`（見 write-files.mjs 的 writeUploadedFile），
 * 回傳可直接使用的靜態路徑（url）。
 *
 * `DELETE /__api/upload-file`：body 為 JSON `{ app, storedName }`，
 * 刪除對應的磁碟檔案（見 write-files.mjs 的 removeUploadedFile）。
 *
 * 安全性：
 * - 僅在 dev server 掛載，正式 build 產物完全不含這個寫檔 API。
 * - 輸出路徑固定為 public/uploads/{app}/{id}{ext}，app / id 只允許安全字元
 *   （見 write-files.mjs 的 resolveUploadPath），避免路徑穿越。
 * - 不使用任何第三方 multipart 解析套件（專案未安裝 multer/busboy 之類的
 *   依賴，且本次要求不執行環境安裝），改用下方最小可用的
 *   multipart/form-data 手動解析，僅支援本頁面實際會送出的欄位組合
 *   （app、id、file 三個 part，file 為唯一的二進位欄位）。
 */
import { writeUploadedFile, removeUploadedFile } from './write-files.mjs';

const API_PATH = '/__api/upload-file';
// 單檔上傳大小上限（bytes）。本地開發模擬情境，設一個寬鬆但非無限的上限，
// 避免單一請求把伺服器記憶體吃爆（body 會先完整讀進記憶體再解析）。
const MAX_UPLOAD_SIZE = 200 * 1024 * 1024; // 200MB

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

/** 把 request body 完整讀成 Buffer，超過 MAX_UPLOAD_SIZE 會提早中止。 */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_UPLOAD_SIZE) {
        reject(new Error(`檔案過大，單檔上限 ${Math.floor(MAX_UPLOAD_SIZE / 1024 / 1024)}MB`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * 解析 Content-Type header 中的 boundary（例如
 * `multipart/form-data; boundary=----WebKitFormBoundaryXXX`）。
 */
function parseBoundary(contentType) {
  if (!contentType || !contentType.startsWith('multipart/form-data')) return null;
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) return null;
  return (match[1] || match[2] || '').trim();
}

/**
 * 最小可用的 multipart/form-data 解析器：把整個 body 依 boundary 切成多個
 * part，每個 part 解析出 `name`、選填的 `filename`、選填的 `contentType`，
 * 以及該 part 的二進位內容（Buffer）。
 *
 * 刻意不處理巢狀 multipart / 非 CRLF 換行等邊角案例——本專案唯一的呼叫端
 * （files-disk-api.ts 用瀏覽器原生 `FormData` + `fetch`）一定會產生標準、
 * 單層的 multipart/form-data，足以涵蓋實際使用情境。
 */
function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = [];

  let start = buffer.indexOf(boundaryBuf);
  if (start === -1) return parts;
  start += boundaryBuf.length;

  while (true) {
    // 分隔線後緊接著 `--`（結尾）或 CRLF（還有下一個 part）
    if (buffer.slice(start, start + 2).toString() === '--') break;
    if (buffer.slice(start, start + 2).toString() === '\r\n') start += 2;

    const nextBoundaryIdx = buffer.indexOf(boundaryBuf, start);
    if (nextBoundaryIdx === -1) break;

    // part 內容結尾的 CRLF 是 boundary 前綴的一部分，要扣掉
    const partEnd = nextBoundaryIdx - 2;
    const partBuf = buffer.slice(start, partEnd);

    const headerEndIdx = partBuf.indexOf('\r\n\r\n');
    if (headerEndIdx !== -1) {
      const headerRaw = partBuf.slice(0, headerEndIdx).toString('utf-8');
      const content = partBuf.slice(headerEndIdx + 4);

      const nameMatch = /name="([^"]*)"/i.exec(headerRaw);
      const filenameMatch = /filename="([^"]*)"/i.exec(headerRaw);
      const contentTypeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerRaw);

      parts.push({
        name: nameMatch ? nameMatch[1] : '',
        filename: filenameMatch ? filenameMatch[1] : undefined,
        contentType: contentTypeMatch ? contentTypeMatch[1].trim() : undefined,
        content,
      });
    }

    start = nextBoundaryIdx + boundaryBuf.length;
  }

  return parts;
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  if (raw.length === 0) return {};
  return JSON.parse(raw.toString('utf-8'));
}

export function writeFilesPlugin() {
  return {
    name: 'write-files-api',
    configureServer(server) {
      server.middlewares.use(API_PATH, async (req, res) => {
        if (req.method === 'POST') {
          try {
            const contentType = req.headers['content-type'] || '';
            const boundary = parseBoundary(contentType);
            if (!boundary) {
              sendJson(res, 400, { ok: false, error: '請求必須是 multipart/form-data 格式' });
              return;
            }

            const raw = await readRawBody(req);
            const parts = parseMultipart(raw, boundary);

            const appPart = parts.find((p) => p.name === 'app' && !p.filename);
            const idPart = parts.find((p) => p.name === 'id' && !p.filename);
            const filePart = parts.find((p) => p.name === 'file' && p.filename !== undefined);

            if (!appPart || !idPart || !filePart) {
              sendJson(res, 400, { ok: false, error: '缺少必要欄位：app / id / file' });
              return;
            }

            const app = appPart.content.toString('utf-8').trim();
            const id = idPart.content.toString('utf-8').trim();

            const result = writeUploadedFile({
              app,
              id,
              originalName: filePart.filename,
              buffer: filePart.content,
            });

            if (!result.ok) {
              sendJson(res, 422, result);
              return;
            }
            sendJson(res, 200, result);
          } catch (err) {
            sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
          }
          return;
        }

        if (req.method === 'DELETE') {
          try {
            const body = await readJsonBody(req);
            const { app, storedName } = body ?? {};
            if (typeof app !== 'string' || typeof storedName !== 'string') {
              sendJson(res, 400, { ok: false, error: '缺少必要欄位：app / storedName' });
              return;
            }
            const result = removeUploadedFile({ app, storedName });
            sendJson(res, result.ok ? 200 : 422, result);
          } catch (err) {
            sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
          }
          return;
        }

        sendJson(res, 405, { ok: false, error: 'Only POST/DELETE are supported' });
      });
    },
  };
}
