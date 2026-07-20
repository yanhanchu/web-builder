# Monorepo（turbo / vite / pnpm / typescript）

多個獨立開發的 app（可能是純前端、也可能含 Node dev-server 端點），
共用一組 `packages/*` 裡的邏輯與元件。這份文件的目的：

1. 讓你在**開始開發某個 app 之前**，30 秒內知道它引用了哪些 packages、
   進入點在哪，不會改錯地方。
2. 讓你在**要修某個共用邏輯**（資料庫/S3 上傳/Google 登入/UI 元件）之前，
   知道那段邏輯實際定義在哪個 package、有哪些 app 依賴它，改了會不會
   波及別人。

## Workspace 結構

```
apps/                   每個都是可獨立開發、可獨立 build/deploy 的專案
  demo/                   純前端 demo：PGlite/Drizzle + S3 + Google 登入
  web-builder/            多頁面網站建置器，含 Node dev-server 端點（/__api/*）

packages/                共用邏輯與元件，app 之間互不重複實作
  browser/                @workspace/browser — 瀏覽器端共用邏輯（DB/S3/Google）
  server/                 @workspace/server  — Node 端共用邏輯（目前只有 S3 簽章）
  ui/                     @workspace/ui      — React UI 元件 + 元件/函式文件產生器
```

`pnpm-workspace.yaml` 只認 `apps/*` 和 `packages/*` 這兩層，新增專案時
放進對應資料夾即可自動被 workspace 抓到。

## Packages 總覽 — 各自提供什麼、怎麼用

| Package | 執行環境 | 提供什麼 | 詳細文件 |
|---|---|---|---|
| **`@workspace/browser`** | 瀏覽器 | PGlite/Drizzle 資料庫 + Web Worker（`client`, `worker/*`, `db/schema`）、S3 相容上傳（`s3` 純前端版 / `s3-upload-client` 搭配 dev-server 版）、Google 登入 + Drive token（`google`） | [packages/browser/README.md](./packages/browser/README.md) |
| **`@workspace/server`** | Node（僅供 Vite plugin / `.mjs` script import，**絕不進瀏覽器 bundle**） | S3 SigV4 Presigned URL 簽章（`presign`, `s3-presign-service`） | [packages/server/README.md](./packages/server/README.md) |
| **`@workspace/ui`** | 瀏覽器 | React UI 元件（`components/*`）+ 元件/函式自動文件產生器（`pages/generator/*` 等，選用） | [packages/ui/README.md](./packages/ui/README.md) |

**快速判斷「我需要哪個 package」：**

- 要在瀏覽器裡存資料（不架後端）→ `@workspace/browser` 的 `client` + `db`
- 要做多檔案上傳到 S3/R2，且**沒有** Node dev-server → `@workspace/browser` 的 `s3`
- 要做多檔案上傳到 S3/R2，且**有** Node dev-server（vite plugin 可以掛端點）→ `@workspace/browser` 的 `s3-upload-client` + `@workspace/server`
- 要 Google 登入 / 拿 Drive token → `@workspace/browser` 的 `google`
- 要畫面元件（按鈕、卡片…）→ `@workspace/ui` 的 `components/*`
- 要幫元件/函式自動長出文件頁面 → `@workspace/ui` 的 generator 系列（選用，見該 README）

## Apps 總覽 — 各自引用了什麼

| App | 型態 | 引用的 packages | 詳細文件 |
|---|---|---|---|
| **`apps/demo`** | 純前端 | `@workspace/browser`（`client` / `s3` / `google`） | [apps/demo/README.md](./apps/demo/README.md) |
| **`apps/web-builder`** | 前端 + Node dev-server 端點 | `@workspace/ui`（元件 + 文件系統）、`@workspace/browser`（`s3-upload-client`）、`@workspace/server`（S3 簽章） | [apps/web-builder/README.md](./apps/web-builder/README.md) |

開始開發某個 app 前，**先讀該 app 自己的 README**，裡面有「這個 app 引用了
哪些 packages」的表格，對應到各 package 的進入點與 README。改共用邏輯前
同樣先讀對應 package 的 README，確認有哪些 app 依賴它。

## 新增 app 時

1. 在 `apps/{name}/` 建立新專案，`package.json` 的 `name` 要唯一
2. 決定要不要 Node dev-server 端點（`vite dev` 的 `configureServer`）：
   - 不需要 → 保持純前端，S3 上傳走 `@workspace/browser/s3`
   - 需要（例如要簽 S3 URL、寫本機檔案）→ 仿照 `apps/web-builder` 的
     `scripts/write-xxx-plugin.mjs` 模式，S3 簽章邏輯放
     `@workspace/server`，不要在 app 裡重寫一份
3. 需要資料庫（PGlite/Drizzle）→ 引用 `@workspace/browser/client` +
   `@workspace/browser/db/schema`，**不要**另外複製一份 worker/schema
4. 需要 UI 元件 → 引用 `@workspace/ui/components/*`，若元件庫不夠用，
   優先考慮在 `packages/ui` 新增元件，而不是在 app 裡各自刻一份
5. 在 `apps/{name}/README.md` 補上「這個 app 引用了哪些 packages」表格
   （比照 `apps/demo/README.md` / `apps/web-builder/README.md` 的格式），
   並在這份根 README 的「Apps 總覽」加上一列
6. 若某段邏輯被**兩個以上**的 app 需要，考慮把它從 app 搬進對應的
   `packages/*`，而不是複製貼上

## Commands

```bash
pnpm install                 # 安裝所有 workspace 套件（在 repo 根目錄執行一次即可）
pnpm dev                     # turbo dev：同時啟動所有 app 的 dev server
pnpm --filter demo dev       # 只啟動 apps/demo
pnpm --filter web-builder dev  # 只啟動 apps/web-builder
pnpm build                   # turbo build：依賴順序建置所有專案
pnpm lint                    # turbo lint
pnpm typecheck                # turbo typecheck
```

各 app / package 若有專屬指令（例如 `db:generate`、`docs:generate`），
列在各自的 README 裡，不重複寫在這裡。
