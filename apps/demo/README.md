# apps/demo

`@electric-sql/pglite`（WASM Postgres）+ Drizzle ORM + Web Worker +
Comlink + Google 登入 + S3 相容上傳的**純前端 demo**，沒有真正的
Node/Express 後端 —— 所有「後端」邏輯都在瀏覽器裡跑，資料存在
IndexedDB。是這個 monorepo 裡 `@workspace/browser` 套件的示範/測試場。

> **You are an AI coding agent.** This app is meant to stay a *template*.
> Read this file, then follow the links below before you write or change
> any code.

## 這個 app 引用了哪些 packages

| Package | 用來做什麼 | 進入點 |
|---|---|---|
| `@workspace/browser` | 全部的「後端」邏輯：PGlite/Drizzle 資料庫（`client`）、S3 上傳（`s3`）、Google 登入（`google`） | `src/App.tsx`、`src/components/*`；[packages/browser/README.md](../../packages/browser/README.md) |
| `@workspace/ui` | 畫面用的 UI 元件（`Card`, `Button`, `Input` 等）+ Tailwind 設計系統（`globals.css`） | `src/App.tsx`、`src/components/*`、`src/style.css`；[packages/ui/README.md](../../packages/ui/README.md) |

這個 app 不再有自己的一套 CSS class（原本的 `.s3-*`、`#user-list` 等已移除），
畫面一律用 `@workspace/ui` 的元件 + Tailwind utility class，跟
`apps/web-builder` 用同一套設計系統，**不要**再另外寫 app 專屬的 CSS
class 或引入其他 UI framework。

這個 app **完全不直接** import PGlite、Drizzle、schema 的 query
builder，或任何 S3/Google 密鑰邏輯 —— 一律透過
`@workspace/browser`（`/client`、`/s3`、`/google`）。修改功能前，先確認
「這段邏輯該不該放在這個 app 裡，還是屬於 `packages/browser`」，資料庫
schema、worker、S3 簽章、Google auth 的實作全部都在 `packages/browser`，
不在這裡。

> `@workspace/browser` 裡有兩套 S3 上傳邏輯，這個 app 用的是純前端模擬版
> `s3`（簽章在 Worker 裡完成），不是 `s3-upload-client`（那個要搭配
> Node dev server，見 `apps/web-builder`）。

## 目錄一覽

```
src/
  App.tsx                注意：這是 demo UI，可自由替換/擴充
  main.tsx                React 進入點
  components/
    AuthPanel.tsx           Google 登入示範 UI
    S3UploadPanel.tsx        S3 上傳示範 UI
  style.css, assets/       demo 樣式/圖片，可自由替換
```

## Where to look for what

| Need to...                                                          | Read                                           |
| --------------------------------------------------------------------| ----------------------------------------------- |
| Understand the layers and which file does what                      | [docs/architecture.md](./docs/architecture.md) |
| Add a new table/feature (the step-by-step recipe)                   | [docs/workflow.md](./docs/workflow.md)         |
| Understand `worker.ts`'s flat API design, `client.ts`, `migrate.ts` | [docs/worker-api.md](./docs/worker-api.md)     |
| Work on Google sign-in / Drive access token                         | [docs/auth-module.md](./docs/auth-module.md)   |
| Work on the S3-compatible multi-file upload                        | [docs/storage-module.md](./docs/storage-module.md) |
| Know what must never be changed (Vite config, migrations, etc.)     | [docs/constraints.md](./docs/constraints.md)   |

> `docs/*` 裡的路徑是照 monorepo 化之前的舊結構寫的（`src/auth/*`、
> `src/storage/*`、`src/worker/*`、`src/db/*`）。現在這些邏輯都在
> `packages/browser/src/google/*`、`packages/browser/src/s3/*`、
> `packages/browser/src/worker/*`、`packages/browser/src/db/*`；
> `apps/demo/src/App.tsx`、`apps/demo/src/components/*` 才是現在真正的
> UI 層。這批文件之後若有第二個 app 也用到同一套資料庫/S3/Google 模組，
> 應該搬到 `packages/browser/docs/`（見根目錄
> [README.md](../../README.md#新增-app-時) 的檢查清單）。

## Commands

```bash
cp .env.example .env.local            # 在 apps/demo 下建立，填入 VITE_LOGIN_URL / VITE_GOOGLE_OAUTH_CLIENT_ID / VITE_S3_*
pnpm install                          # 在 repo 根目錄安裝所有 workspace 套件
pnpm --filter demo dev                # 啟動這個 app 的 Vite dev server
pnpm --filter demo build              # 型別檢查 (tsc) + production build
pnpm --filter @workspace/browser db:generate   # 改了 packages/browser/src/db/schema.ts 後，產生新的 SQL migration
```

`db:generate` 實際跑在 `packages/browser`（不是這個 app），詳見
[docs/workflow.md](./docs/workflow.md) 和
[packages/browser/README.md](../../packages/browser/README.md#新增修改資料表)。
