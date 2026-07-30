// ============================================================
// Vite dev server plugin：匯出攤平資料，直接寫檔到專案的 /data/{appName}/
//
// 提供路由：
//
//   POST /api/data-export
//     body: { files: Record<string, string>, appName?: string }
//       - files  key 是相對路徑（相對於輸出資料夾），例如
//         "sources/route.json"、"pages/home.json"，跟 buildFlatDataFiles()
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
//     寫檔成功之後，額外把 apps/web-builder/public/{appName}/static/
//     （這個 app 專屬的本機上傳落地目錄，見 local-upload.ts 的
//     getStaticDir(appName) + saveLocalUpload() 的實際寫檔位置）覆寫
//     複製到 data/{appName}/files/——「寫入資料到本地」這個操作的語意
//     本來就是「把目前這份資料整包搬進專案」，上傳過的檔案也屬於這份
//     資料的一部分，理應跟著攤平 JSON 一起帶走，不然回頭用 GET 從別的
//     環境讀回來時會少了實際檔案本體。
//
//     回傳 { ok: true, dir, files: string[] }，dir 是寫入的資料夾
//     （相對於 monorepo 根目錄的路徑，例如 "data/my-app"），
//     files 是實際寫入的相對路徑清單（不含 files/ 底下複製過去的上傳
//     檔案——那些是整個目錄複製，不逐檔列舉）。
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
//
//     讀檔之前，額外把 data/{appName}/files/ 整個覆寫複製到
//     apps/web-builder/public/{appName}/static/（見上方 POST 說明）——
//     「從本地讀取資料」的語意是把 server 上這份資料整包搬回來取代目前
//     瀏覽器端的狀態，上傳過的檔案本體也要跟著換成 data/{appName}/files/
//     裡的內容，否則畫面上引用的上傳檔案網址（/{appName}/static/...）
//     還會停留在切換 app 之前的舊檔案。
// ============================================================

import type { Plugin, ViteDevServer, Connect } from "vite";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { copyDirRecursive } from "./copy-dir";
import { getStaticDir } from "./local-upload";

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
 *
 * 刻意略過頂層的 `files/` 子目錄：那是本機上傳檔案本體（二進位），改由
 * copyDirRecursive() 整個目錄覆寫複製到 public/{appName}/static/（見
 * GET handler），不透過這裡的「當成 utf-8 文字讀出、包進 JSON 回應」
 * 流程——用 utf-8 讀二進位檔案會讀壞內容，而且沒有必要塞進這個本來只給
 * 攤平 JSON 檔案用的回應裡。
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
      if (relPath === "files") continue;
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

            // 「從本地讀取資料」：先把這個 app 的上傳檔案本體
            // （data/{appName}/files/）覆寫複製回 public/{appName}/static/，
            // 讓畫面上引用的 /{appName}/static/... 網址跟著換成這份資料
            // 實際帶的檔案，再讀攤平 JSON 回傳（見檔案開頭 GET 路由說明）。
            //
            // 複製目的地用 getStaticDir(appName)（= public/{appName}/static/），
            // 對應 local-upload.ts 的 saveLocalUpload() 實際寫檔位置 ——
            // appName 這個 namespace 現在體現在 public/ 底下的目錄本身，
            // 不是 static/ 底下的子目錄，兩邊要用同一套解析邏輯，否則會
            // 變成路徑對不上或多一層巢狀結構。
            await copyDirRecursive(path.join(outDir, "files"), getStaticDir(appName));

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

          // 「寫入資料到本地」：攤平 JSON 都寫完之後，額外把這個 app 專屬
          // 的本機上傳落地目錄（public/{appName}/static/，對應
          // local-upload.ts 的 getStaticDir(appName) + saveLocalUpload()
          // 實際寫檔位置）覆寫複製到 data/{appName}/files/，讓這份資料夾
          // 也帶著實際上傳過的檔案本體（見檔案開頭 POST 路由說明）。
          await copyDirRecursive(getStaticDir(appName), path.join(outDir, "files"));

          return json(res, 200, { ok: true, dir: dirName, files: written });
        } catch (err) {
          json(res, 500, { error: err instanceof Error ? err.message : "未預期的伺服器錯誤" });
        }
      };

      server.middlewares.use(middleware);
    },
  };
}