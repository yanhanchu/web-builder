// ============================================================
// Vite dev server plugin：匯出攤平資料，直接寫檔到專案的 /data/{appName}/
//
// 提供路由：
//
//   POST /api/data-export
//     body: { files: Record<string, string>, appName?: string }
//       - files  key 是相對路徑（相對於輸出資料夾），例如
//         "sources/route.json"、"pages.json"，跟 buildFlatDataFiles()
//         回傳的 ExportedFiles 一致；value 是檔案內容（字串，通常是
//         格式化過的 JSON）
//       - appName 對應「App 設定」頁的 App Name 欄位；未提供或空字串
//         （trim 後）一律視為 "default"
//     這裡會把每一筆內容寫到（monorepo 根目錄）：
//
//       data/{appName}/<key>
//
//     例如 appName = "my-app"、body.files["sources/route.json"] 會寫到
//     data/my-app/sources/route.json（需要的話自動建立子目錄）。
//
//     這是未打包（非 zip）的版本：目的是讓使用者不用手動解壓縮，
//     dev server 執行時直接把攤平資料寫進專案檔案系統，方便本機開發
//     時 apps/site-generator 直接讀最新的 data/{appName}/ 內容。
//
//     回傳 { ok: true, dir, files: string[] }，dir 是寫入的資料夾
//     （相對於 monorepo 根目錄的路徑，例如 "data/my-app"），
//     files 是實際寫入的相對路徑清單。
//
//   GET /api/data-export?appName=my-app
//     反向操作：把 data/{appName}/ 目錄底下所有檔案讀回來，回傳
//     { ok: true, dir, files: Record<string, string> }，files 的 key
//     是相對路徑（跟 POST 的 body.files 同一套慣例），value 是檔案內容
//     字串。給前端 import-flat-data-to-storage.ts 呼叫，用來把 server
//     上已經寫好的攤平檔案整包讀回瀏覽器、蓋掉 localStorage。
//     appName 沒帶或空字串同樣視為 "default"；目錄不存在時回傳
//     { ok: true, dir, files: {} }（視為「這個 app 還沒有任何匯出資料」，
//     不當成錯誤）。
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

/**
 * 整理前端傳來的 appName：非字串、空字串、trim 後為空、或包含路徑
 * 分隔符 / ".." 等逃逸字元，一律退回預設值 "default"，避免寫到
 * data/ 目錄以外的地方。
 */
function sanitizeAppName(raw: unknown): string {
  const DEFAULT_APP_NAME = "default";
  if (typeof raw !== "string") return DEFAULT_APP_NAME;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return DEFAULT_APP_NAME;
  if (path.isAbsolute(trimmed)) return DEFAULT_APP_NAME;
  if (trimmed === "." || trimmed === "..") return DEFAULT_APP_NAME;
  if (trimmed.includes("/") || trimmed.includes("\\")) return DEFAULT_APP_NAME;
  return trimmed;
}

/** 拒絕會逃出輸出資料夾的相對路徑（".."、絕對路徑）。 */
function isSafeRelativePath(relativePath: string): boolean {
  if (typeof relativePath !== "string" || relativePath.length === 0) return false;
  if (path.isAbsolute(relativePath)) return false;
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) return false;
  return true;
}

/**
 * 遞迴讀出 dir 底下所有檔案，回傳 { 相對於 dir 的路徑（一律用 "/" 分隔）: 內容 }。
 * dir 不存在時回傳空物件（視為「這個 app 還沒有任何匯出資料」，不是錯誤）。
 */
async function readDirRecursive(dir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  async function walk(current: string, prefix: string) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    for (const entry of entries) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath, relPath);
      } else if (entry.isFile()) {
        result[relPath] = await fs.readFile(absPath, "utf-8");
      }
    }
  }

  await walk(dir, "");
  return result;
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

          if (req.method === "GET") {
            const appName = sanitizeAppName(fullUrl.searchParams.get("appName"));
            const dirName = path.posix.join("data", appName);
            const outDir = path.join(REPO_ROOT, "data", appName);
            const files = await readDirRecursive(outDir);
            return json(res, 200, { ok: true, dir: dirName, files });
          }

          if (req.method !== "POST") {
            return json(res, 405, { error: "Method Not Allowed" });
          }

          const body = await readJsonBody<{ files?: Record<string, string>; appName?: string }>(req);
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

          const appName = sanitizeAppName(body.appName);
          const dirName = path.posix.join("data", appName);
          const outDir = path.join(REPO_ROOT, "data", appName);

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