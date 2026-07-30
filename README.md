# Web Builder Monorepo

一個「組件庫 + 資料驅動頁面編輯器 + 靜態網站生成器」的 pnpm workspace 專案。
核心理念：**組件（UI）、頁面結構（page-model）、內容資料（data-model）三者分離**，
頁面編輯器在瀏覽器裡組裝三者，生成器再把同一份資料轉成靜態網站原始碼。

## Workspace 結構

```
packages/ui/            組件庫（真正的 UI 原始碼）
  src/components/<group>/*.tsx   各群組的組件（目前：landing1、site）
  src/lib/                       page-model / data-model / site-renderer 等框架無關核心邏輯
  src/styles/, src/utils/

apps/web-builder/       頁面編輯器（Vite + React SPA）+ 靜態網站生成器（Node script）
  src/pages/admin/                編輯器 UI：頁面管理、共用區塊、樣式、App 設定、檔案同步
  src/lib/                        page-model / data-model 的編輯器端狀態（localStorage）、匯出/匯入
  scripts/docs/                   掃描 packages/ui，產生 data/components.json 等文件
  scripts/site-generator/         讀 data/ 底下的攤平 JSON，產出 .tsx（React）或 .astro 網站原始碼
  server/                         開發用 Vite plugin：檔案上傳、data/ 目錄讀寫（回寫到專案 / 從本機讀取）

data/                    組件文件（生成物）+ 網站內容資料（人工/編輯器維護）
  components.json, component-types.json, functions.json   ← 由 scripts/docs 生成，不要手改
  default/                 一個 workspace 的網站內容（可能有多份，結構相同）
    sources/                i18n / route / file / typedData 四種資料來源
    pages/<id>.json         每個頁面的 blocks 樹
    shared-blocks/<id>.json 可被多個頁面引用的共用區塊定義
    locales.json, style-sheets.json, style-sheets/*.css
```

## 資料流（心智模型）

```
packages/ui 組件 + JSDoc
        │  pnpm --filter web-builder docs:generate
        ▼
data/components.json / component-types.json   ← 組件的 props 表格（機器可讀）
        │
        ▼
data/<workspace>/sources/*.json     ← 值從哪裡來（i18n / file / route / typedData）
data/<workspace>/pages/*.json       ← 頁面用了哪些組件、順序、props 綁定、slot 巢狀關係
data/<workspace>/shared-blocks/*.json  ← 共用組件實例（例如全站頁首頁尾），頁面用引用節點取代整包複製
        │
        ├─▶ apps/web-builder 編輯器（瀏覽器 + localStorage，可視化編輯上面三種資料）
        └─▶ scripts/site-generator（讀檔案系統，產出靜態網站原始碼：.tsx 或 .astro）
```

**核心分離原則**：組件是純 UI，不知道值從哪裡來；頁面資料只描述組合關係；內容資料只描述值本身。
詳細規則（怎麼寫組件、怎麼編輯各種 JSON 格式）見 [`AGENTS.md`](./AGENTS.md)。

## 開發

```bash
pnpm install

# 產生/更新組件文件（第一次跑、或改過 packages/ui 組件之後）
pnpm --filter web-builder docs:generate
pnpm --filter web-builder functions:generate

# 啟動編輯器（會先自動跑一次上面兩個 generate）
pnpm --filter web-builder dev
```

其餘 monorepo 層級指令（跑在所有 workspace 上）：

```bash
pnpm build       # turbo build
pnpm lint        # turbo lint
pnpm typecheck   # turbo typecheck
pnpm format      # turbo format
```

## 靜態網站生成器

編輯器裡把 `wb.pages` / `wb.sharedBlocks`（localStorage）「回寫到專案」後，
`data/<workspace>/` 底下就有完整的攤平資料，可以在不啟動編輯器的情況下單獨生成靜態網站：

```bash
cd apps/web-builder

# React（.tsx，拆分資料檔案）
pnpm generate:tsx

# Astro（.astro + client:* island 指令）
pnpm generate:astro
```

兩套生成器（`scripts/site-generator/{jsx-codegen,astro-codegen}/`）共用同一份
`load-static-data.ts`（讀 `data/`）、`page-model` 的 `resolveSharedBlockRef`（共用區塊
展開邏輯）、以及 `scripts/site-generator/shared/`（block 樹遞迴走訪、資料 export 抽取），
只有輸出語法（JSX vs Astro template、client 指令）各自實作。細節見
[`apps/web-builder/scripts/site-generator/readme.md`](./apps/web-builder/scripts/site-generator/readme.md)。

## 其他文件

- [`AGENTS.md`](./AGENTS.md) —— 給 AI／協作者的組件與資料格式規範（最詳細、最常查）
- [`roadmap.md`](./roadmap.md) —— 共用區塊（Shared Blocks）機制的設計與各 Phase 進度
- [`apps/web-builder/scripts/site-generator/readme.md`](./apps/web-builder/scripts/site-generator/readme.md) —— 生成器的資料格式、路由規則、兩套 codegen 差異