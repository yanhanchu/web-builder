# @workspace/browser

瀏覽器端「假後端」共用邏輯：PGlite（WASM Postgres）+ Drizzle ORM + Web
Worker、S3 相容檔案上傳（含 presigned URL 簽章）、Google 登入 / Drive
token。任何 app 只要想要「不架真後端也能有資料庫 / 檔案上傳 / Google
登入」，都應該從這裡引用，而不是各自重寫一份。

> 這個套件本身**不含 UI**，只有邏輯（hooks、client、worker、schema）。畫面
> 交給各自的 app 或 `@workspace/ui`。

## 這個套件提供什麼

| 子模組 | 路徑 | 提供什麼 | 誰在用 |
|---|---|---|---|
| `client` | `src/client.ts` | 建立 Web Worker、用 Comlink 包成 `api`，`ensureDbReady()` | 想用 PGlite/Drizzle 資料庫的 app |
| `worker/*` | `src/worker/` | Comlink-exposed 的「後端」本體：`worker.ts`、`migrate.ts`、`repositories/*.repo.ts` | 只被 `client.ts` 內部使用（`new Worker(...)`），一般不會被 app 直接 import |
| `db/schema` | `src/db/schema.ts` | Drizzle table 定義（`users`, `posts`）+ 型別 | 想操作/擴充資料表結構時 |
| `s3` | `src/s3/index.ts` | 瀏覽器端 S3 相容多檔上傳（單檔 PUT + multipart），走 **Worker 模擬後端簽章** 的流程 | `apps/demo` 的示範 S3 上傳面板 |
| `s3-upload-client` | `src/s3-upload-client.ts` | 瀏覽器端 fetch 邏輯，呼叫 **Vite dev server 的 `/__api/s3-presign`** 端點取得 presigned URL 並上傳 | `apps/web-builder` 的檔案管理頁 |
| `google` | `src/google/index.ts` | Google 登入（GIS）+ Drive access token 管理，`useAuth()` hook | 需要 Google 登入的 app |

### ⚠️ 兩套 S3 上傳邏輯，不要混用

這個套件裡有 **兩種**「S3 上傳」實作，用途不同：

- **`s3/`**（`useS3Upload`）：presigned URL 的簽章邏輯活在 **Web Worker**
  裡（`s3/workerPresign.ts`），整個流程完全在瀏覽器端模擬，不需要任何
  Node/Vite dev server 端點。適合「純前端 demo，沒有 Node 後端」的場景，
  見 `apps/demo`。
- **`s3-upload-client.ts`**：只負責呼叫 `/__api/s3-presign`（一個 **由
  Vite dev server 掛載的 middleware**，簽章邏輯在 `@workspace/server`），
  瀏覽器端本身不碰密鑰。適合「app 本身就有 Node 端（vite plugin/dev
  server）可以放密鑰」的場景，見 `apps/web-builder`。

新增 app 時，先決定你的 app 有沒有自己的 Node dev-server 端點：
- **沒有**（純靜態前端）→ 用 `s3`
- **有**（有 vite plugin 可以掛 `/__api/*`）→ 用 `s3-upload-client` +
  `@workspace/server`（見 [packages/server/README.md](../server/README.md)）

## 怎麼引用

package.json：
```json
{
  "dependencies": {
    "@workspace/browser": "workspace:*"
  }
}
```

vite.config.ts 需要的兩個設定（PGlite / Worker 專用，**不要拿掉**，
理由見 [apps/demo/docs/constraints.md](../../apps/demo/docs/constraints.md)）：
```ts
export default defineConfig({
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
  worker: {
    format: 'es',
  },
});
```

Import 範例：
```ts
// 資料庫（PGlite + Drizzle + Worker）
import { api, ensureDbReady } from '@workspace/browser/client';
await ensureDbReady();
const users = await api.userList();

// S3 上傳（純前端模擬版，見上方說明）
import { useS3Upload } from '@workspace/browser/s3';

// S3 上傳（呼叫 dev server presign 端點版）
import { requestS3Presign } from '@workspace/browser/s3-upload-client';

// Google 登入
import { useAuth } from '@workspace/browser/google';
```

## 新增/修改資料表

1. 編輯 `src/db/schema.ts`
2. 在套件根目錄執行 `pnpm --filter @workspace/browser db:generate`
   （會呼叫 `drizzle-kit generate`，讀 `drizzle.config.ts`）
3. 產生的 migration 落在 `src/db/migrations/`，**不要手動編輯**已產生的
   migration（有 hash 檢查，見 `src/worker/migrate.ts`）
4. 在 `src/worker/repositories/` 新增/修改對應的 repo
5. 在 `src/worker/worker.ts` 補上對應的扁平 API 方法（Comlink 不支援
   nested object，方法必須是扁平的 `<entity><Action>`）

更完整的資料庫架構說明（含圖示）目前放在
[apps/demo/docs/architecture.md](../../apps/demo/docs/architecture.md) /
[worker-api.md](../../apps/demo/docs/worker-api.md) /
[workflow.md](../../apps/demo/docs/workflow.md) /
[constraints.md](../../apps/demo/docs/constraints.md) ——
這些文件是以 `apps/demo` 的視角寫的，但描述的都是這個套件本身的行為，
之後若有第二個 app 也用到資料庫模組，這些文件應該搬來這裡
（`packages/browser/docs/`）。

## 環境變數

這個套件的程式碼會讀取 `import.meta.env.VITE_*`（型別定義見
`src/vite-env.d.ts`），但**不提供 `.env` 檔案本身** —— 由使用它的 app
自行提供 `.env.local`：

| 變數 | 用途 | 對應模組 |
|---|---|---|
| `VITE_LOGIN_URL` | Google 登入導轉網址 | `google` |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | Google OAuth Client ID | `google` |
| `VITE_S3_KIND` / `VITE_S3_ENDPOINT` / `VITE_S3_REGION` / `VITE_S3_BUCKET` / `VITE_S3_ACCESS_KEY_ID` / `VITE_S3_SECRET_ACCESS_KEY` / `VITE_S3_FORCE_PATH_STYLE` | S3 相容連線設定 | `s3`（worker 端讀取，密鑰不進主執行緒） |
