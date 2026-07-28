// ============================================================
// Vite dev server plugin：匯出攤平資料，直接寫檔到專案的 data-{mm-dd}/
//
// 提供路由：
//
//   POST /api/data-export
//     body: { files: Record<string, string> }
//       - key   是相對路徑（相對於輸出資料夾），例如 "sources/route.json"、
//         "pages.json"，跟 buildFlatDataFiles() 回傳的 ExportedFiles 一致
//       - value 是檔案內容（字串，通常是格式化過的 JSON）
//     這裡會把每一筆內容寫到（monorepo 根目錄）：
//
//       data-{mm-dd}/<key>
//
//     例如 body.files["sources/route.json"] 會寫到
//     data-07-28/sources/route.json（含有需要的話自動建立子目錄）。
//     mm-dd 用「伺服器當下的本機日期」計算，不是前端傳來的值 —— 避免
//     前端時區跟伺服器不一致時檔名對不上。
//
//     這是未打包（非 zip）的版本：目的是讓使用者不用手動解壓縮，
//     dev server 執行時直接把攤平資料寫進專案檔案系統，方便本機開發
//     時 apps/site-generator 直接讀最新的 data-{mm-dd}/ 內容。
//
//     回傳 { ok: true, dir, files: string[] }，dir 是寫入的資料夾
//     （相對於 monorepo 根目錄的路徑，例如 "data-07-28"），
//     files 是實際寫入的相對路徑清單。
// ============================================================

import type { Plugin, ViteDevServer, Connect } from "vite";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

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

/** monorepo 根目錄：apps/web-builder/server -> ../../.. */
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

/** 產生今天日期的 "mm-dd" 字串（伺服器本機時區）。 */
function todayMmDd(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

/** 拒絕會逃出輸出資料夾的相對路徑（".."、絕對路徑）。 */
function isSafeRelativePath(relativePath: string): boolean {
  if (typeof relativePath !== "string" || relativePath.length === 0) return false;
  if (path.isAbsolute(relativePath)) return false;
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) return false;
  return true;
}

export function dataExportDevPlugin(): Plugin {
  return {
    name: "web-builder:data-export-dev-api",
    configureServer(server: ViteDevServer) {
      const middleware: Connect.NextHandleFunction = async (req, res, next) => {
        try {
          if (!req.url) return next();
          const fullUrl = new URL(req.url, "http://localhost");
          if (fullUrl.pathname !== "/api/data-export") return next();

          if (req.method !== "POST") {
            return json(res, 405, { error: "Method Not Allowed" });
          }

          const body = await readJsonBody<{ files?: Record<string, string> }>(req);
          const files = body.files;
          if (!files || typeof files !== "object" || Array.isArray(files)) {
            return json(res, 400, { error: "body.files 必須是 { 相對路徑: 檔案內容 } 物件" });
          }

          const entries = Object.entries(files);
          if (entries.length === 0) {
            return json(res, 400, { error: "body.files 不可為空物件" });
          }

          for (const [relativePath, content] of entries) {
            if (!isSafeRelativePath(relativePath)) {
              return json(res, 400, { error: `非法的檔案路徑：${relativePath}` });
            }
            if (typeof content !== "string") {
              return json(res, 400, { error: `檔案內容必須是字串：${relativePath}` });
            }
          }

          const dirName = `data-${todayMmDd()}`;
          const outDir = path.join(REPO_ROOT, dirName);

          const written: string[] = [];
          for (const [relativePath, content] of entries) {
            const absolutePath = path.join(outDir, relativePath);
            await fs.mkdir(path.dirname(absolutePath), { recursive: true });
            await fs.writeFile(absolutePath, content, "utf-8");
            written.push(relativePath);
          }

          return json(res, 200, { ok: true, dir: dirName, files: written });
        } catch (err) {
          json(res, 500, { error: err instanceof Error ? err.message : "未預期的伺服器錯誤" });
        }
      };

      server.middlewares.use(middleware);
    },
  };
}