# apps/web-builder

多頁面「網站建置器」：在瀏覽器裡編輯頁面內容、路由、i18n 翻譯、多個
app（多站台）設定、檔案管理（本機 or S3），並附帶一套元件/函式的自動
文件系統（`/components`、`/functions`）。

**開發模式（`vite dev`）本身就是「假後端」**：所有寫入操作都是透過
Vite plugin 掛的 `/__api/*` middleware，把資料直接寫進這個 app 目錄下的
`data/` 資料夾（JSON 檔）；`vite build` 的正式產物不包含這些寫入端點。

## 這個 app 引用了哪些 packages

| Package | 用來做什麼 | 進入點 |
|---|---|---|
| `@workspace/ui` | 畫面所有 UI 元件（Button/Card/…）+ 元件/函式文件產生器（`/components`、`/functions` 頁面） | `src/App.tsx` 直接 import `@workspace/ui/pages/generator/*`；[packages/ui/README.md](../../packages/ui/README.md) |
| `@workspace/browser` | 檔案上傳的瀏覽器端邏輯（`s3-upload-client`，呼叫本 app 自己的 `/__api/s3-presign`） | `src/lib/files-disk-api.ts` 等；[packages/browser/README.md](../../packages/browser/README.md) |
| `@workspace/server` | S3 SigV4 presigned URL 簽章（Node 端），只被 `scripts/write-s3-presign-plugin.mjs` 呼叫 | [packages/server/README.md](../../packages/server/README.md) |

> `@workspace/browser` 這裡只用到 `s3-upload-client`，**沒有用**
> `client`/`db`/`worker`（PGlite 資料庫）那一組 —— 這個 app 的資料落地
> 方式是 `data/{app}/*.json`（見下方），不是 IndexedDB。若之後要幫這個
> app 加上瀏覽器內建資料庫，才需要引用 `@workspace/browser/client`。

## 目錄一覽

```
data/                       執行期資料（會被 dev server 的 /__api/* 讀寫）
  apps.json                   目前有哪些 app（多站台）
  {app}/app.json               單一 app 的設定（SEO、storage provider 等）
  {app}/pages.json             單一 app 的頁面內容
  {app}/i18n/{locale}.json     單一 app 的翻譯

scripts/                    只在 `vite dev` 執行的 Node 端邏輯
  app-fs.mjs                   共用的安全檔案讀寫工具（路徑限制在 data/ 底下）
  write-*.mjs                  各功能（apps/pages/i18n/routes/files/s3-presign）的實際讀寫邏輯
  write-*-plugin.mjs           對應的 Vite plugin，掛載 /__api/* middleware
  generate-pages.mjs           build 前把 data/{app}/pages.json 轉成靜態 route（pages-map.ts）

src/
  App.tsx                     路由表（含 @workspace/ui 的文件頁 + 這個 app 自己的頁面）
  pages/                       各功能頁面（設定/頁面編輯/i18n/路由/檔案管理）
  store/                       localStorage 讀寫（跟 data/*.json 是兩份，dev 時可互相同步）
  lib/                         disk-api（呼叫 /__api/*）+ opfs-file-store 等瀏覽器端邏輯
  hooks/app/                   AppProvider context（目前正在編輯哪個 app）
  types/                       AppSettings / PageDef / RouteEntry / FileEntry 等型別
```

## 開發前要知道的事

- **不要**把 `scripts/*.mjs` 裡讀寫 `data/` 的邏輯複製貼上到別的 app —— 若
  第二個 app 也需要類似「多站台 + 寫回 JSON」的能力，考慮把共用部分抽到
  `packages/` 底下（目前這套邏輯還沒抽出來，因為只有這一個 app 在用）。
- 新增一個「/__api/xxx」端點的標準流程：
  1. `scripts/write-xxx.mjs`：實際讀寫邏輯（純函式，不碰 HTTP）
  2. `scripts/write-xxx-plugin.mjs`：包成 Vite plugin，只在
     `configureServer` 掛 middleware
  3. `vite.config.ts` 的 `plugins` 陣列加進去
- S3 上傳走的是 `@workspace/browser/s3-upload-client` +
  `@workspace/server`，**不是** `@workspace/browser/s3`（那是給
  `apps/demo` 純前端模擬版用的），別搞混，細節見
  [packages/browser/README.md](../../packages/browser/README.md#⚠️-兩套-s3-上傳邏輯不要混用)。

## 指令

```bash
pnpm --filter web-builder dev      # 啟動 dev server（含所有 /__api/* 端點）
pnpm --filter web-builder build    # 型別檢查 + production build（產物不含 /__api/*）
pnpm --filter @workspace/ui run docs:generate       # 手動重新產生元件文件資料
pnpm --filter @workspace/ui run functions:generate  # 手動重新產生函式文件資料
```
