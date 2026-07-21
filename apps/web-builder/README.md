# apps/web-builder

多頁面「網站建置器」：在瀏覽器裡編輯頁面內容、路由、i18n 翻譯、多個
app（多站台）設定、檔案管理（本機 or S3）、資料管理（依 @workspace/ui
組件共用型別做簡單 JSON 資料的 CRUD），並附帶一套元件/函式的自動
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
  {app}/theme.json             單一 app 的主題產生器（/theme）設定
  {app}/styles.css             單一 app 的主題產生器輸出的 CSS（theme.json 的衍生檔）
  {app}/i18n/{locale}.json     單一 app 的翻譯
  {app}/records/{typeId}.json  單一 app 底下、某個 @workspace/ui 共用型別的資料紀錄（資料管理 /data）

example.css                 tailwindcss v4 主題設定檔範例（/theme 產生器即是模仿此格式輸出）

scripts/                    只在 `vite dev` 執行的 Node 端邏輯
  app-fs.mjs                   共用的安全檔案讀寫工具（路徑限制在 data/ 底下）
  write-*.mjs                  各功能（apps/pages/i18n/routes/data-records/files/s3-presign）的實際讀寫邏輯
  write-*-plugin.mjs           對應的 Vite plugin，掛載 /__api/* middleware
  generate-pages.mjs           build 前把 data/{app}/pages.json 轉成靜態 route（pages-map.ts）

src/
  App.tsx                     路由表（含 @workspace/ui 的文件頁 + 這個 app 自己的頁面）
  pages/                       各功能頁面（設定/頁面編輯/i18n/路由/資料管理/檔案管理）
  store/                       localStorage 讀寫（跟 data/*.json 是兩份，dev 時可互相同步）
  lib/                         disk-api（呼叫 /__api/*）+ opfs-file-store 等瀏覽器端邏輯
  hooks/                   AppProvider context（目前正在編輯哪個 app）
  types/                       AppSettings / PageDef / RouteEntry / FileEntry / DataRecordEntry 等型別
```

## 主題產生器（/theme）

用「主色 hue/chroma + 中性色 hue + 圓角 + 兩個字型」幾個輸入，生成一份跟
`example.css` 相同格式的 tailwindcss v4 主題設定檔（`@theme inline` +
`:root`/`.dark` 的 oklch 變數），即時預覽淺色/深色色票與範例元件，可複製或
下載 `theme.css`。

- `src/types/theme-types.ts`：`ThemeConfig` 型別、預設值、配色預設清單、字型清單
- `src/lib/theme-css-generator.ts`：純函式，`ThemeConfig` → CSS 字串（不碰 DOM）
- `src/pages/theme-generator.tsx`：頁面本體（資料同步 + 表單 + 預覽 + 產生的 CSS）
- `src/lib/theme-disk-api.ts`：呼叫 `/__api/write-theme` 的讀寫 API 呼叫層
- `scripts/write-theme.mjs` / `scripts/write-theme-plugin.mjs`：驗證並讀寫
  `data/{app}/theme.json` + `data/{app}/styles.css`

跟 routes/pages/i18n 一致：主題設定改為「每個 app 各自一份」，落在
`data/{app}/theme.json`（不再是全域共用一份）。「資料同步」區塊放在**頁面最
上方**，一進頁面就能看到目前正在同步哪個 app；「寫入檔案系統」除了寫
`data/{app}/theme.json`，也會把前端已經算好的 CSS 字串一併寫成
`data/{app}/styles.css`（純粹落地檔案，不是任何頁面的讀取來源——「從檔案
系統讀取（覆蓋）」一律讀 `theme.json` 再由前端重新產生 CSS，避免兩份資料
不同步）。僅 `npm run dev` 環境有效，跟頁面管理/路由管理同一套模式。

**Shuffle / 鎖定**：每個可調整欄位（主色 hue/chroma、中性色 hue、圓角、
內文/標題字型）旁都有鎖頭按鈕，按下「Shuffle」時，被鎖定的欄位維持原值、
其餘欄位重新隨機取樣（見 `shuffleTheme()`）。鎖定狀態只存在畫面上，不會
寫進 `data/{app}/theme.json`。字型清單已擴充至 20 種常見
`@fontsource-variable` 字型（見 `FONT_OPTIONS`），除了 15 種常用無襯線字型，
另外加了 Fraunces、Playfair Display、Bricolage Grotesque、Newsreader、
Instrument Serif 等 5 種較有個性的展示型襯線/展示字體，適合當標題字。

**UI 組件展示**：頁面下方用 `@workspace/ui` 的真實組件（Button/Badge/Card/
Input/Avatar）展示套用目前主題設定後的實際樣子（見 `ComponentShowcase`），
另外補了幾種常見的樣式呈現元件（Tabs 分頁切換、Toggle 開關、Progress 進度
條、可移除的 Chips 標籤），同樣純粹用 CSS 自訂屬性局部套用，不依賴額外套件、
不影響頁面其他部分的樣式。

## 資料管理（/data）

app 底下的子功能，跟「路由管理（/routes）」同一種最簡單的管理模式，
只是這裡管理的資料形狀不是寫死的，而是使用者從 `@workspace/ui` 的
「組件共用型別」清單裡選一個之後動態組出來的表單。

流程：**選型別 => 編輯資料**

- 型別來源：`@workspace/ui` 的 `allComponentTypes`（`packages/ui/data/component-types.json`，
  由 `packages/ui/scripts/generate-docs.mjs` 掃描 `src/components/**` 的
  props 型別後產生，見該套件 README）。每個型別有一個獨立的 `id`
  （目前實作等於 TypeScript 型別名稱），不同組件的 props 若參照到同一個
  interface/type，會共用同一筆型別定義，因此「資料管理」裡選到的型別
  也是跨組件共用的。
- 資料形狀：v1 只支援「簡單物件」欄位（`string` / `number` / `boolean`）
  與「陣列<簡單物件>」（`string[]` / `number[]` / `boolean[]`）的編輯；
  欄位型別若指向巢狀 interface、`ReactNode`、函式等複雜型別，表單會把
  該欄位標示為「不支援編輯」，先讓使用者看得到、之後再完善。
- 選定型別後，`/data` 會依該型別的欄位清單動態組一份表單，對這個
  型別底下的資料做新增 / 修改 / 刪除，一個型別可以有多筆資料
  （即整體效果等同「陣列<該型別>」）。

檔案：

- `src/types/data-manager-types.ts`：`DataRecordEntry` / `DataManagerData`、
  簡單型別判斷（`classifySimpleType`）、陣列型別字串解析（`getArrayElementType`）
- `src/store/data-manager-storage.ts`：localStorage 存取層（`app -> typeId -> DataRecordEntry[]`）
- `src/pages/data-manager.tsx` + `src/styles/data-manager-styles.ts`：頁面本體（選型別 + CRUD 表單）
- `src/lib/data-manager-disk-api.ts`：呼叫 `/__api/write-data-records` 的讀寫 API 呼叫層
- `scripts/write-data-records.mjs` / `scripts/write-data-plugin.mjs`：驗證並讀寫
  `data/{app}/records/{typeId}.json`

跟路由管理同一套模式：編輯即時同步進瀏覽器 `localStorage`，「寫入檔案
系統」「從檔案系統讀取（覆蓋）」兩個按鈕才會跟
`data/{app}/records/{typeId}.json` 互動，僅 `npm run dev` 環境有效。

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
