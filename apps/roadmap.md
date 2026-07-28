# Roadmap：site-generator 改為輸出「.tsx 頁面 + 每 locale 一份資料 JSON」

## 背景與目標

現有 `apps/site-generator` 的設計目標是輸出**純靜態 HTML**（`renderToStaticMarkup`，不 hydrate），
概念上跟 Astro 的 "zero JS by default" 一致。但這不是你現在要的東西。

你要的是：每個 page 產出**一份 `.tsx` 檔案**，長得像現有
`apps/web-builder/src/pages/index.tsx` 那樣——一個可以直接被其他專案（之後的 Astro）
`import` 的 React 組件原始碼，而不是一段 HTML 字串。差別在於：

- `index.tsx` 現在是**手寫、寫死資料**（`import { header, footer, hero, ... } from ".../default"`）。
- 你要的版本，資料要來自「攤平資料 + data-model resolve」這一套機制，
  跟 `web-builder` 編輯器裡看到的內容保持一致，而不是手動維護。

另外把 頁面要用的資料 每種 locale 編成一份獨立的 json（要拆再細也可以）,
`.tsx` 頁面, 只做一份預設語系的即可——**locale 在產出當下就 resolve 死，
不需要、也不做「瀏覽器裡動態切換 locale」這件事**。每種語系各自的資料 JSON
單純是「這個 locale 底下頁面資料長什麼樣」的靜態產出物，不是給 `.tsx`
在 runtime 讀取切換用的。

之後你會把這些產出的 `.tsx` 檔案，或它們代表的資料/邏輯，搬進一個新的 **Astro** 專案做真正的靜態化。
這份文件只涵蓋「產出 .tsx + 每 locale 一份資料 JSON」這一步，不涵蓋 Astro 專案本身怎麼架設。

---

## 現況：哪些東西已經有、哪些完全沒有

### 已經有、可以直接重用

| 東西 | 位置 | 說明 |
|---|---|---|
| 攤平資料讀取 | `apps/site-generator/src/load-static-data.ts` | 讀 `data/` 底下的 JSON，還原成 `sources` / `pages` / `locales` / `styleSheets` |
| `InMemoryDataStore` / `resolveValue` | `packages/ui/src/lib/data-model/schema.ts` | 核心 resolve 引擎，吃 `(type, node, store, { locale })`，code generator 直接拿它把 ValueNode 解成純值 |
| `resolvePlainProps` | `packages/ui/src/lib/site-renderer/resolve-props.ts` | 把一整組 block props（可能是 ValueNode，也可能是舊資料的裸值）解析成純值 props，畫布 / 靜態 HTML / code generator 三處共用 |
| 組件中繼資料查表 | `packages/ui/src/lib/generator/component-registry.ts`（`getComponentById`） | 查 `componentId -> importPath/componentName`，code generator 組 JSX 需要的 import 語句跟標籤名稱都從這裡拿 |
| Route 解析（page → path） | `apps/site-generator/src/resolve-route.ts` | 跟輸出格式無關，繼續可用 |
| 匯出腳本（web-builder → data/ 攤平檔案） | `apps/web-builder/src/lib/export-flat-data.ts` + `download-flat-data-zip.ts` + `data-manager.tsx` 的「匯出 data.zip」按鈕 | 可以正常把 sources/pages/locales/styleSheets 匯出成 `data/` 目錄結構 |

### 已完成（Step 1，本次實作範圍）

| 東西 | 位置 | 說明 |
|---|---|---|
| 「page → .tsx 原始碼字串」的產生器 | `apps/site-generator/src/jsx-codegen/render-block-tree-to-jsx.ts` | 走訪 `page.blocks`，用 `resolveValue` 把每個 block 的 props resolve 成純值，pretty-print 成合法 JSX attribute 語法（不是 `JSON.stringify`），遞迴處理巢狀 slot、正確縮排。 |
| 純值 → JS/JSX literal 語法 | `apps/site-generator/src/jsx-codegen/stringify-literal.ts` | object key 不加引號、字串優先用雙引號、undefined 省略等規則。 |
| import 語句收集 | `apps/site-generator/src/jsx-codegen/import-collector.ts` | 去重、排序，避免同一個組件用了兩次卻 import 兩次。 |
| 單頁 `.tsx` 組裝 | `apps/site-generator/src/render-page-jsx.ts` | 組出完整檔案（import 語句 + `export default` 組件），對應 `render-page.ts` 但輸出原始碼而非 HTML；只用預設語系 resolve 一次。 |
| 單頁單 locale 的資料 JSON | `apps/site-generator/src/render-page-data.ts` | 把一個 (page, locale) 的每個 block resolved 成純值，攤平成 JSON（純資料輸出物，不含任何 runtime 邏輯）。 |
| 主流程 / CLI 進入點 | `apps/site-generator/src/generate-jsx.ts` / `cli-jsx.ts` | 讀資料 → 只為預設語系產生 `.tsx` → 為每個 locale 各自產生資料 JSON；跟既有 `generate.ts` / `cli.ts`（HTML 輸出）平行存在、互不影響。 |

### 完全沒有、需要新寫（若之後要做）

| 東西 | 說明 |
|---|---|
| Header/Footer 綁定資料要怎麼進到新頁面 | 目前 code generator 不特別處理 Header/Footer，跟 `render-page.ts` 一致：如果頁面資料本身把 Header/Footer 放進 `page.blocks`，就會自然被包含在輸出的 JSX 裡（跟其他 block 一樣走 resolveValue 解成純值）；沒有的話不會額外加。這部分目前運作正常，不需要新工作。 |

---

## 建議的下一步（由簡到難）

1. **驗證產出結果**：實際跑 `pnpm generate:jsx`，檢視 `dist-jsx/pages/*.tsx` 跟
   `dist-jsx/data/<locale>/*.json` 的內容是否符合預期（縮排、prop 值格式、
   巢狀 slot 結構）。這是目前最值得先做的事——Step 1 的程式碼還沒有實際跑過。

2. **接進 Astro**：把產出的 `.tsx` 檔案搬進新的 Astro 專案，確認 `import` 路徑
   （目前是 `@workspace/ui/components/...`）在 Astro 專案裡要怎麼對應
   （多半需要調整 alias 或改用相對路徑，這部分屬於 Astro 專案本身要怎麼架設，
   不在 `site-generator` 這個套件範圍內）。

3. **CSS／Tailwind 產出流程**：目前 `buildCss()`（`generate.ts`）是配合靜態 HTML
   設計的；`.tsx` 輸出流程目前沒有對應的 CSS 產出步驟。如果 Astro 那邊會自己跑
   Tailwind（掃過 `.tsx` 原始碼），這裡可能完全不需要動；如果不會，需要另外設計
   `.tsx` 輸出流程專屬的 CSS 產出方式。

4. **多語系頁面要不要各自產一份 `.tsx`**：目前只產預設語系那一份。如果之後發現
   「每個 locale 都要各自一份 `.tsx`」（而不是只有預設語系），`render-page-jsx.ts` /
   `generate-jsx.ts` 需要調整成對每個 `(page, locale)` 都呼叫一次
   `renderPageJsx`，而不是只挑預設語系那一組 route——這個改動不大，主要是
   `generate-jsx.ts` 裡 `pickDefaultLocaleRoutes` 那段邏輯要拿掉或改寫。

5. **互動組件（原本 HTML 流程的 islands 機制）**：`.tsx` 輸出本身就是原始碼，
   互動邏輯（`useState`/`useEffect`）會原封不動保留在組件裡，不像 HTML 輸出
   需要另外處理 hydration/islands，這部分不需要額外工作。

---

## 這份文件沒有涵蓋的部分

- Astro 專案本身要怎麼架設、怎麼吃這批 `.tsx`／資料檔案——等實際產出可以看了、
  接進 Astro 之後再談會更準。
- CSS／Tailwind 產出流程要不要跟著換（見上方「建議的下一步」第 3 點）。
