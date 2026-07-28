# Roadmap：site-generator 改為輸出「可動態切換 locale 的 .tsx 頁面」

## 背景與目標

現有 `apps/site-generator` 的設計目標是輸出**純靜態 HTML**（`renderToStaticMarkup`，不 hydrate），
概念上跟 Astro 的 "zero JS by default" 一致。但這不是你現在要的東西。

你要的是：每個 page 產出**一份 `.tsx` 檔案**，長得像現有
`apps/web-builder/src/pages/index.tsx` 那樣——一個可以直接被其他專案（之後的 Astro）
`import` 的 React 組件原始碼，而不是一段 HTML 字串。差別在於：

- `index.tsx` 現在是**手寫、寫死資料**（`import { header, footer, hero, ... } from ".../default"`）。
- 你要的版本，資料要來自「攤平資料 + data-model resolve」這一套機制，
  跟 `web-builder` 編輯器裡看到的內容保持一致，而不是手動維護。

另外把 頁面要用的資料 每種 locale 編成一份獨立的 json (要拆再細也可以), 
`.tsx` 頁面, 先做一份預設語系的即可。

之後你會把這些產出的 `.tsx` 檔案，或它們代表的資料/邏輯，搬進一個新的 **Astro** 專案做真正的靜態化。
這份文件只涵蓋「產出可動態切換 locale 的 .tsx」這一步，不涵蓋 Astro 專案本身怎麼架設。

---

## 現況：哪些東西已經有、哪些完全沒有

### 已經有、可以直接重用

| 東西 | 位置 | 說明 |
|---|---|---|
| 攤平資料讀取 | `apps/site-generator/src/load-static-data.ts` | 讀 `data/` 底下的 JSON，還原成 `sources` / `pages` / `locales` / `styleSheets` |
| `InMemoryDataStore` / `resolveValue` | `packages/ui/src/lib/data-model/schema.ts` | 核心 resolve 引擎，吃 `(type, node, store, { locale })` |
| **`RenderBlockTree`（React 組件版）** | `packages/ui/src/lib/site-renderer/render-block-tree.tsx` | **這是關鍵**：`locale` 是 `RenderBlockTreeOptions` 的一個 prop，內部用 `resolvePlainProps` 即時 resolve。只要外層把 `locale` 包成 React state 傳進去，改 state 就會重新 resolve + 重新 render，**動態切換 locale 這件事不需要新寫任何邏輯，直接借用這個既有組件** |
| 組件動態載入 | `packages/ui/src/lib/generator/component-registry.ts`（`loadComponentModule` / `getComponentById`） | `RenderBlockTree` 用它來動態 `import()` 對應的 `.tsx` 組件模組 |
| Header/Footer 綁定 resolve | `resolveValue(headerPropsType, initialHeaderProps, store, { locale })` 這套呼叫模式 | `data-manager.tsx` 裡已經在用，可以直接照搬到新頁面上 |
| Route 解析（page → path） | `apps/site-generator/src/resolve-route.ts` | 跟輸出格式無關，繼續可用 |
| 匯出腳本（web-builder → data/ 攤平檔案） | `apps/web-builder/src/lib/export-flat-data.ts` + `download-flat-data-zip.ts` + `data-manager.tsx` 的「匯出 data.zip」按鈕 | 上一輪剛做完，可以正常把 sources/pages/locales/styleSheets 匯出成 `data/` 目錄結構 |

### 完全沒有、需要新寫

| 東西 | 說明 |
|---|---|
| 「page → .tsx 原始碼字串」的產生器 | 現有 `render-page.ts` 只會產出 HTML 字串（`renderToStaticMarkup`），沒有任何地方會把 `page.blocks` 轉成**可讀的 JSX 原始碼文字**。這是全新工作，難度也最高（見下方「核心難點」）。 |
| Header/Footer 綁定資料要怎麼進到新頁面 | `index.tsx` 目前是直接 `import { header, footer } from ".../default"`（寫死）。新版要嘛也 import 一份 resolve 過的資料檔，要嘛把 locale-aware 的 resolve 邏輯 inline 進頁面本身。需要新設計一個「resolved data 的載入方式」。 |
| CLI / script 進入點 | 目前 `cli.ts` 呼叫 `generate()` 產生 HTML；新流程需要一個新的（或改造既有的）進入點，跑「讀資料 → 產生 .tsx 檔案」，且不再需要 Vite SSR + `renderToStaticMarkup` 那一整套（因為輸出的是原始碼而不是渲染結果）。 |
| 「動態 locale」執行環境 | `.tsx` 頁面如果要在瀏覽器裡動態切換 locale，代表它執行時需要能存取 `store`（`InMemoryDataStore`）跟 `typeRegistry`——這代表 sources 資料本身也要被打包進最終產物（例如序列化成 JSON 一起 import），而不是像現在 build-time 就 resolve 光、之後完全不需要 data-model。這件事目前完全沒有雛形，需要設計「資料怎麼隨 .tsx 一起交付」。 |

---

## 核心難點（老實說：這幾塊我大概率做不完，需要你接手判斷）

### 1. 「把 block 樹轉成 JSX 原始碼文字」是全新的程式碼產生器

現在 `renderBlockListSync` 做的事情是：走訪 `page.blocks` → 動態 `import()` 對應組件模組 →
呼叫 `React.createElement(Component, resolvedProps)` → 最後用 `renderToStaticMarkup` 轉成
HTML 字串。**這整條路徑產出的是「渲染結果」，不是「原始碼」。**

要產出 `.tsx` 原始碼，需要另外寫一個「code generator」：走訪同一棵 `page.blocks` 樹，
但不是呼叫 `createElement`，而是要吐出字串，例如：

```tsx
import { Hero } from "@workspace/ui/components/landing1/hero";
// ...
<Hero title="..." subtitle="..." primaryCta={{ label: "...", href: "..." }} />
```

這裡最麻煩的地方：
- **巢狀 slot 組件**（block 底下還有 block）需要遞迴組出巢狀 JSX，縮排、換行都要處理。
- **props 值的字串化**：字串要處理跳脫、多行文案要不要用模板字串、物件/陣列 prop 要 pretty-print
  成合法 JS 語法（不是單純 `JSON.stringify` 就好，因為 JSX attribute 裡的物件 literal
  跟 JSON 語法規則不完全一樣，例如 key 不用加引號、單引號 vs 雙引號慣例等）。
- **import 語句去重與排序**：一個頁面可能用到十幾個組件，每個組件各自要 import 一次，
  同一個組件如果用了兩次不能重複 import。
- **動態 locale 版本更複雜**：如果 i18n 綁定的欄位不能 resolve 死，那 JSX 裡對應的
  attribute 不能是字串常數，而要是類似 `title={t("hero.title")}` 或
  `title={resolveValue(..., { locale })}` 這種「還留著綁定關係、在 render 當下才決定值」的寫法——
  這代表 code generator 對於「純 literal 值」跟「i18n 綁定值」要輸出**兩種完全不同的 JSX 語法**，
  複雜度比單純 dump 一份純值物件高出不少。

這一塊是全新的、沒有任何既有程式碼可以參考或延伸的部分，工作量最大、風險最高，
**建議你親自設計「i18n 綁定值在 JSX 裡要長什麼樣子」這個介面**，我可以協助寫 code generator 本身，
但這個介面設計最好由你拍板（會直接決定之後 Astro 那邊要怎麼接）。

### 2. 動態切換 locale 需要資料「跟著程式碼一起交付」

現在的靜態 HTML 流程，locale 是 build time 就決定好、resolve 完就丟掉 store 了。
但你要的「.tsx 可以動態換 locale」，代表**執行時**（瀏覽器裡）還需要：
- 完整的 `sources`（至少 i18n 那部分）
- `typeRegistry`
- `InMemoryDataStore` + `resolveValue` 這套邏輯

也就是說，光有 `.tsx` 檔案還不夠，還需要一份資料檔案（例如 `sources.json`）跟著一起打包，
`.tsx` 執行時 `fetch` 或直接 `import` 這份資料，在 client 端建立 store 來 resolve。

這牽涉到：
- 資料檔案要放哪裡、用什麼方式載入（build time inline 進 bundle？還是 runtime fetch？）
- 如果之後真的搬進 Astro，Astro 的 island 架構要怎麼接這份 client-side store
  （這部分要看 Astro 那邊怎麼設計，這份文件先不展開）

### 3. Header/Footer 這種「跨頁共用、綁在 Layout 上」的資料要怎麼進新頁面

現在 `index.tsx` 是直接 import `header` / `footer` 這兩個寫死物件。新版如果要讓
Header/Footer 也能動態切換 locale，等於也要走同一套「留著綁定關係」的邏輯，
而不是簡單複製一份 resolve 過的值。這部分邏輯上跟第 1 點的難點相同，只是綁定對象是
`typedData:brand:main` 這種全站共用資料，不是頁面本身的 block。

---

## 建議的分段做法（由簡到難）

1. **Step 1（最簡單，可以先做）**：先做「locale 寫死」版本的 code generator——
   把 `page.blocks` resolve 成純值（跟現在 `render-page.ts` 一樣呼叫 `resolveValue`），
   再把純值 dump 成 JSX attribute 字串，產出一份 `.tsx`。這一步驗證「code generator 骨架」
   可以動，之後再加 locale 動態切換是疊加，不是砍掉重練。

2. **Step 2**：設計「i18n 綁定值在 JSX 裡的表示法」（例如上面提到的 `t("hero.title")` 形式），
   決定資料要怎麼隨 `.tsx` 一起交付（inline JSON？獨立 fetch？）。**這一步建議你主導決策**，
   因為會直接影響 Astro 那邊的介接方式，我只能就技術可行性給選項，不適合替你拍板產品方向。

3. **Step 3**：把 Step 2 的決策套進 code generator，讓 i18n 綁定欄位改輸出「留著綁定關係」的
   JSX 語法，而不是純值字串。

4. **Step 4**：處理 Header/Footer（跨頁共用資料）比照同樣邏輯。

5. **Step 5**：換掉 `cli.ts` / `generate.ts` 的進入點，讓它呼叫新的 code generator
   而不是現有的 `renderPage`（HTML 字串版本），但可以保留 `load-static-data.ts` /
   `resolve-route.ts` 完全不動（這兩個跟輸出格式無關）。

---

## 這份文件沒有涵蓋的部分

- Astro 專案本身要怎麼架設、怎麼吃這批 `.tsx`／資料檔案——等 Step 1~5 做完、有實際產出可以看了再談會更準。
- CSS／Tailwind 產出流程要不要跟著換（目前 `buildCss()` 是配合靜態 HTML 設計的，
  如果換 Astro，CSS pipeline 大概率也要重新設計，但跟本次「產出 .tsx」這個任務關聯不大，
  可以晚一點再處理）。