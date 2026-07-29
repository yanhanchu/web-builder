# Component & Function Docs (trimmed)

這是從原專案抽出的精簡版本，只保留 `docs:generate` 與 `functions:generate` 兩個功能：

- `packages/ui/scripts/generate-docs.mjs` — 掃描 `packages/ui/src/components/landing1/*.tsx`，
  產生 `packages/ui/data/components.json`、`packages/ui/data/component-types.json`、
  `packages/ui/src/lib/generator/component-map.ts`。
- `packages/ui/scripts/generate-functions-docs.mjs` — 掃描 `packages/ui/src/functions/**/*.ts`，
  產生 `packages/ui/data/functions.json`、`packages/ui/src/types/generator/function-types.ts`。

## id 規則調整

- `ComponentDoc.id`：改為 `{filePath}#{componentName}`（例如
  `src/components/landing1/card.tsx#CardHeader`），避免同一檔案內多個具名匯出
  （例如 `card.tsx` 同時匯出 `Card` 與 `CardHeader`）或不同目錄同名組件互相撞名。
- `ComponentTypeDoc.id`：改為 `{型別宣告所在檔案的 filePath}#{型別名稱}`（例如
  `src/components/landing1/types.ts#BrandData`），避免不同檔案定義的同名型別互相覆蓋。

## 已移除的功能

原本 `apps/web-builder` 的頁面編輯、i18n 管理、路由管理、主題產生器、檔案管理、
就地寫回原始碼（write-back）等 UI Builder 功能皆未保留。`apps/web-builder` 目前只是
一個可以跑起來的空殼 Vite + React + react-router 專案，掛載了 Components /
Functions 兩個文件瀏覽頁面（首頁列表 + 詳情頁），其餘功能尚未實作。

## 新增：資料管理核心（`packages/ui/src/lib/data-model/`）

這次加入的是資料管理系統的核心模型，用來銜接「components 生成的定義」與「頁面編輯
時的資料綁定」，取代原本 `components/landing1/default.ts` 手動重複填值的做法。
**components 生成流程（`scripts/generate-docs.mjs`）完全沒有變動**，這層只是讀取
它的輸出、疊加一層可綁定的抽象。

### 檔案

- `schema.ts` — 核心型別與 resolver：
  - `FieldType` / `ValueNode`：遞迴的型別定義與對應的值結構（`primitive` /
    `ref` / `array` / `object` / `slot`，`ValueNode` 每一層都可以是
    `literal`（純值）或 `bound`（綁定到某個 `DataSource`））。
  - `DataSource`：統一的資料來源節點，`i18n` / `file` / `typedData` / `route`
    四種 kind 共用同一套綁定介面。`i18n` 是「基本型別容器」
    （`string`/`number`/`boolean` 皆可，不只是文字）。
  - `resolveValue()`：照著 `FieldType` 走訪 `ValueNode`，把綁定解成最終純值，
    是靜態產生階段唯一需要走的路徑。
  - `BindingPolicy` / `getCandidateSources()`：「這個欄位可以綁哪些種類的資料」
    的判斷機制。因為生成器（乃至任何工具）無法從 TS 型別字串判斷語意
    （一個 `string` 究竟是不是 i18n 文案、是不是檔案路徑），這裡不武斷分類，
    改用可替換的 policy 決定候選綁定種類；目前用
    `permissiveBindingPolicy`：無法判定就全部開放。之後要精細化（人工標註、
    或用其他方式判斷欄位語意）只要換一顆 policy，其餘程式碼不用動。
- `from-generated.ts` — 讀取 `data/components.json` /
  `data/component-types.json`，把 TS 型別字串（`"BrandData"`、`"NavItem[]"`、
  `"ReactNode"`⋯）轉換成 `FieldType`。型別 id 直接沿用生成器已提供的複合 id
  （`{filePath}#{TypeName}`），不需要額外處理撞名。`ReactNode` 一律轉成
  `{ kind: 'slot' }`，代表插槽、不參與資料綁定。
- `FieldEditor.tsx` — 遞迴表單元件：依 `FieldType` 自動渲染 literal input /
  binding 下拉選單 / 巢狀 object 子表單 / array 項目增刪，候選綁定來源
  透過 `BindingPolicy` 決定。
- `sample-data.ts` — 示範資料：模擬「已經建好的 i18n / 檔案 / 型別資料」，
  並組出 `Header` / `Footer` 兩個真實 component 的初始 `ValueNode`。重點對照
  `components/landing1/default.ts`：那裡 `header` 和 `footer` 各自手動填了一份
  `brandData`；這裡兩者的 `brand` 欄位都改成 `{ mode: 'bound', sourceId:
  'typedData:brand:main' }`，整格引用同一筆資料，之後要換 LOGO 只要改一處。
- `index.ts` — 對外的統一匯出（barrel）。

### 示範頁面

`apps/web-builder/src/pages/data-model-demo.tsx`，掛在 `/data-model-demo`
路由。左側是依 `FieldType` 遞迴渲染的編輯表單，右側即時顯示
`resolveValue()` 解算出的最終 JSON（component 實際會拿到的 props），並可切換
locale 觀察 i18n 綁定同步變化。

## 使用方式

```bash
npm install
npm run docs:generate
npm run functions:generate
npm run dev --workspace=web-builder
```

> 本次交付未執行 `npm install`、未做型別編譯檢查、未跑測試。
