# component-docs-monorepo

原本單一專案（Vite + React 19 + TypeScript + React Router v7 的元件文件系統）
拆分成 pnpm + turborepo 的 monorepo，**功能完全不變**，只是把程式碼依「誰擁有它」
重新分配到不同的 workspace 套件：

```
mono/
  apps/
    web-builder/      ← 原本的整個 app（App 管理 / 頁面預覽 / i18n / 路由 / 檔案管理）
  packages/
    ui/                ← 文件生成器：scripts + UI 元件 + 範例組件/函式（原 generator 領域）
    server/            ← S3 / R2：server 端邏輯（SigV4 簽章、presign 產生，純 Node）
    browser/           ← S3 / R2：browser 端邏輯（presign 請求 + PUT/DELETE 直傳）
```

`apps/web-builder` 透過 `@workspace/ui`、`@workspace/server`、`@workspace/browser`
三個 workspace 套件的方式使用其他三塊程式碼，實際跑起來的**只有一個 Vite dev server**
（`apps/web-builder`），其他三個套件都是「原始碼直接被 import」，不需要各自 build。

---

## 怎麼跑起來

```bash
pnpm install
pnpm --filter web-builder dev
```

或在 repo 根目錄：

```bash
pnpm install
pnpm dev   # turbo 會找出 apps/* 底下有 dev script 的套件並執行
```

打開 http://localhost:5173。

第一次啟動（或修改了 `packages/ui/src/components/**`、`src/functions/**` 之後）
`web-builder` 的 `predev` / `prebuild` 會自動依序執行：

1. `@workspace/ui` 的 `docs:generate`（掃描組件，產生 `packages/ui/data/components.json`）
2. `@workspace/ui` 的 `functions:generate`（掃描函式，產生 `packages/ui/data/functions.json`）
3. `web-builder` 自己的 `pages:generate`（讀 `packages/ui/data/components.json` +
   `data/{app}/pages.json`，固化成 `apps/web-builder/src/pages/generated/*.tsx`）

不需要手動個別執行，`pnpm dev` / `pnpm build` 會自動觸發。

---

## 每個 package 在幹嘛

### `apps/web-builder` —— App 管理（原本的整個 app）

管「app / workspace」這個概念本身，以及底下的頁面預覽、路由、i18n、檔案管理
子功能。資料落在 `apps/web-builder/data/{app}/` 底下（`app.json` / `pages.json` /
`routes.json` / `i18n/{locale}.json`）。

**這裡是唯一真的在跑 Vite dev server 的地方**——所有 `write-*-plugin.mjs`
（含 `@workspace/ui` 提供的 `write-back-plugin.mjs`）都掛載在
`apps/web-builder/vite.config.ts`，因為 middleware 要掛在正在跑的那個 server 上，
跟程式碼邏輯本身歸屬哪個套件是兩件事。

### `packages/ui` —— 文件生成器（原本的 generator 領域）

負責「掃描組件/函式原始碼 → 產生文件資料 → 渲染文件頁面」這整套系統，
包含：
- 範例組件本體（`Avatar` / `Badge` / `Button` / `Card` / `Input`）與 shadcn 基礎元件（`ui/button.tsx`）
- 範例函式本體（`calculateOrderTotal.ts` / `validateRegistrationForm.ts`）
- 文件頁面（首頁列表、單一組件/函式詳情頁）與其子元件（props 表格、type pill、live preview 等）
- 產生文件資料的 build script（`docs:generate` / `functions:generate`）
- dev-only 的「props 就地編輯寫回原始碼」（`write-back-plugin.mjs`）
- 整個共用設計系統（Tailwind tokens、`globals.css`、`cn()` 工具、主題切換 Provider）

`apps/web-builder` 依賴這個套件來取得共用元件與設計系統，也依賴它的
`component-registry` 來動態渲染「頁面預覽」功能裡使用者自訂的頁面節點樹。

### `packages/server` —— S3 / R2，server 端

純邏輯，不依賴任何特定 app 的資料夾結構：呼叫端自己讀出 `storage` 設定物件
（例如 `apps/web-builder` 從 `data/{app}/app.json` 讀出來），傳進來，這裡只負責
SigV4 簽章、組出 presigned PUT/DELETE URL。這樣未來想給別的 app 重用也不用改這個套件。

### `packages/browser` —— S3 / R2，browser 端

瀏覽器端呼叫 `/__api/s3-presign` 拿到 presigned URL 後，直接對 S3/R2 發
PUT（上傳）或 DELETE（刪除），檔案本體不經過 dev server 中轉。

---

## 路線總覽（路由 → 在哪個套件）

| 路徑 | 頁面元件 | 所在套件 | 說明 |
|---|---|---|---|
| `/` | `pages/generator/home.tsx` | `@workspace/ui` | 組件卡片列表 |
| `/components/:id`、`/components/by-index/:index` | `component-detail.tsx` | `@workspace/ui` | 單一組件文件頁（Props 表格、Live Preview） |
| `/functions`、`/functions/:id`、`/functions/by-index/:index` | `functions-home.tsx` / `function-detail.tsx` | `@workspace/ui` | 函式列表 / 單一函式文件頁 |
| `/admin` | `settings.tsx`（`AppListPage`） | `apps/web-builder` | app 清單、新增表單 |
| `/app` | `settings.tsx`（`AppEditPage`） | `apps/web-builder` | 目前選定 app 的設定表單（含刪除/重新命名） |
| `/live`、`/live/:pageId` | `dynamic-page.tsx` | `apps/web-builder` | runtime 動態渲染頁面（讀 `pages.json`，用到 `@workspace/ui` 的 `component-registry` 解析節點） |
| `/live/edit`、`/live/:pageId/edit` | `page-editor.tsx` | `apps/web-builder` | 頁面內容表單編輯器 |
| `/i18n` | `i18n-manager.tsx` | `apps/web-builder` | 多語系翻譯管理 |
| `/routes` | `route-manager.tsx` | `apps/web-builder` | 路由對照表管理（跟 `/live` 動態渲染系統無關，純路徑管理） |
| `/files` | `file-manager.tsx` | `apps/web-builder` | 檔案管理，上傳目的地可選 OPFS（本機）/ S3(R2)，S3 部分呼叫 `@workspace/browser` |
| `/pages/*` | `pages-map.ts` 產生的清單 | `apps/web-builder` | build-time 固化的靜態頁面（`npm run pages:generate` 的輸出） |

> `/live`、`/i18n`、`/routes`、`/app`、`/files` 都不帶 `:app` 路由參數，一律作用於
> 最外層導覽列切換的「目前 app」（見 `apps/web-builder/src/hooks/app/context.tsx`）。

---

## 常用指令

在 repo 根目錄執行（透過 turbo 分派給對應套件）：

```bash
pnpm dev          # 啟動 web-builder 的 dev server（含自動 docs:generate / pages:generate）
pnpm build        # build 所有套件（依 turbo.json 的 dependsOn 決定順序）
pnpm lint         # 各套件的 lint
pnpm format       # 各套件的 format
pnpm typecheck    # 各套件的型別檢查
```

只想針對單一套件下指令，用 `pnpm --filter <package-name> <script>`，例如：

```bash
pnpm --filter @workspace/ui run docs:generate
pnpm --filter web-builder run pages:generate
```

---

## 加入你自己的組件 / 函式

跟原本一樣，只是路徑換到 `packages/ui` 底下：

**組件**（`packages/ui/src/components/YourComponent/YourComponent.tsx`）：

```tsx
export interface YourComponentProps {
  /** 這段 JSDoc 會被抽出來當作 props 說明 */
  label: string;
}

/** 這段 JSDoc 會被抽出來當作組件說明 */
export function YourComponent({ label }: YourComponentProps) {
  return <div>{label}</div>;
}
```

執行 `pnpm --filter @workspace/ui run docs:generate` 重新產生文件資料，
（可選）在 `packages/ui/src/content/generator/demo-props.ts` 補一筆示範 props。

**函式**（`packages/ui/src/functions/yourFunction.ts`）：同樣寫上 JSDoc，執行
`pnpm --filter @workspace/ui run functions:generate` 重新產生文件資料。

新增後，`apps/web-builder` 的 `pnpm dev` / `pnpm build` 會自動重新讀取
`packages/ui/data/components.json`，不需要手動同步。

---

## 這次拆分做了什麼決策（給之後維護的人）

- **`packages/server` 不讀任何 app 的 `data/` 資料夾**：`createS3UploadPresign` /
  `createS3DeletePresign` 改成接收呼叫端已經讀出來的 `storage` 設定物件，而不是自己
  用 app 名稱去讀 `app.json`。這樣這個套件才可能被其他（非 web-builder）的 app 重用。
- **`write-back-plugin.mjs`（props 就地編輯寫回）邏輯留在 `packages/ui`，但掛載點在
  `apps/web-builder`**：因為它操作的檔案（`packages/ui/src/components/**`）屬於 ui
  套件，但實際在跑的 Vite dev server 是 web-builder，middleware 得掛在真正跑起來的
  server 上，這兩件事本來就不必然是同一個套件。
- **`component-map.ts`（自動產生的 import map）不再包含 `components/app/*`**：
  `collapsible-section.tsx`、`dynamic-renderer.tsx` 是 web-builder 專屬的結構性元件，
  不是文件生成器要展示的「範例組件」，本來就不該被 ui 套件掃到。
- **`components.json`（shadcn CLI 設定）整份搬到 `packages/ui`**：因為
  `ui`/`utils`/`components` 這些 alias 現在都指向 `packages/ui`，之後
  `npx shadcn add` 要在 `packages/ui` 底下執行才會落在正確位置。

---

## 已知限制（延續自拆分前）

- `demo-props.ts` 手動維護，新增組件後記得補一筆。
- `React.forwardRef` 包裝的組件，`react-docgen-typescript` 支援度依版本而異。
- app / pages / 路由 / i18n 的編輯內容只存在單一瀏覽器的 `localStorage`，換瀏覽器、
  清除資料、無痕模式都不會保留；「從檔案系統讀取（覆蓋）」是整批覆蓋、不會 merge。
- 檔案管理（`/files`）「上傳目的地管理」面板勾選的自動同步目標，已改為以 app 為 key
  存進 `localStorage`（`file-manager:auto-sync-targets`），重新整理頁面、切換分頁
  不會再遺失勾選狀態；app 刪除／重新命名時會一併清除／搬移這份設定。
- i18n 的 key 若包含點號會被誤判為巢狀路徑。
- 路由管理的「自訂網址」（`targetUrl`）不做格式或可達性驗證，只檢查非空字串。
- **本次 monorepo 重構未執行實際環境安裝、型別編譯與測試**，所有路徑正確性透過
  靜態文字比對驗證；正式使用前建議在本機執行一次 `pnpm install && pnpm build`
  做最終確認。
