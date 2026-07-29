# site-generator

讀取「攤平匯出」的資料（i18n / route / file / typedData / pages / locales /
styleSheets），驅動 `@workspace/ui` **既有、未修改**的 `page-model` +
`site-renderer` + `data-model` 模組，產出全靜態網站：每個 `locale x page`
組合各自 render 成一份完整 HTML（含 `<head>` SEO / OG / 主題腳本 / 樣式），
不是塞進單一 SPA bundle。

這是 React 版本；因為所有邏輯都集中在 `@workspace/ui` 的框架無關層
（`schema.ts` / `page-model` / `resolve-props.ts`），日後要接 Astro，
改的只會是 `render-page.ts` 這一層「怎麼把 blocks 轉成 HTML」，
`load-static-data.ts` / `resolve-route.ts` 完全不用動。

## 為什麼「組件、頁面、資料」要分離

- **組件**：`packages/ui/src/components/**`，這次完全沒有改動，直接沿用。
- **頁面（page-model）**：`PageItem` / `PageBlock`，描述「這個頁面用了哪些
  組件、順序、props 綁定」，本身是純資料，不含任何 render 邏輯。
- **資料（data-model）**：`DataSource`（i18n / file / route / typedData）+
  `ValueNode`，描述「值從哪裡來」，一樣是純資料。

三者本來就已經在 `@workspace/ui` 裡分開維護；`site-generator` 只是額外加一層
「怎麼把攤平的 JSON 檔案讀回這三種資料形狀」，讓之後要直接編輯 JSON、
或用別的系統匯出這份資料再匯入，都不需要碰 `packages/ui` 或這個套件的程式碼，
只需要照著 `data/` 底下的檔案格式提供資料。

## 目錄結構

```
apps/site-generator/
  src/
    load-static-data.ts   讀攤平匯出的 JSON 檔案，組回 sources/pages/locales/styleSheets
    resolve-route.ts      page + locale -> 輸出路徑
    render-page.ts         單頁 render 成完整 HTML（含 <head> SEO/樣式/主題腳本）
    generate.ts             主流程：走訪 locale x page，寫檔案
    cli.ts                   Node 進入點
    site.css          Tailwind CSS 建置入口（不被任何頁面 import，只給 generate.ts 用）

    render-page-jsx.ts      單頁產出 .tsx 原始碼字串（見下方「.tsx 輸出流程」）
    render-page-data.ts     單頁單 locale 產出 resolved 資料 JSON
    generate-jsx.ts          主流程（.tsx 輸出版）：走訪 locale x page，寫 .tsx + JSON
    cli-jsx.ts                Node 進入點（.tsx 輸出版）
    jsx-codegen/
      render-block-tree-to-jsx.ts  遞迴把 PageBlock 樹轉成 JSX 原始碼文字
      stringify-literal.ts          純值 -> 合法 JS/JSX literal 原始碼字串
      import-collector.ts           收集/去重/排序組件 import 語句
  package.json
  README.md（這份文件）

data/                       範例攤平資料（可直接替換成你自己匯出的資料）
  sources/
    i18n.zh-TW.json
    i18n.en.json
    route.json
    file.json
    typedData.json
  pages.json
  locales.json
  style-sheets.json
```

## 資料格式

所有攤平格式都直接對應 `packages/ui/src/lib/data-model/i18n-flat.ts` 與
`flat-export.ts` 既有的轉換函式，**不是**這個套件自訂的新格式：

### `data/sources/i18n.<locale>.json`

單一語系、key 攤平成點分字串的物件（跟 next-intl / react-i18next 的
`en.json` 同格式）：

```json
{ "hero.title.lead": "打造更快的", "footer.copyright": "© 2026 OZSV." }
```

每個 locale 一個檔案，檔名決定 locale（`i18n.zh-TW.json` -> locale
`"zh-TW"`）。用 `flatI18nToSources()` 逐檔疊加回 `I18nDataSource`。

### `data/sources/route.json` / `file.json` / `typedData.json`

去掉 `id`/`kind` 外層、以 key 對應剩餘欄位的攤平物件，用 `flatKindToSources()`
還原成完整 `DataSource`。例如 `route.json`：

```json
{
  "about": { "target": "page", "pageId": "about", "value": "/about", "noindex": false }
}
```

還原後 id 會是 `route:about`。`file.json` / `typedData.json` 同理，
id 分別是 `file:<key>` / `typedData:<key>`。

`typedData.json` 裡每一筆的 `value` 是遞迴的 `ValueNode`
（`{ mode: "literal" | "bound" | "array" | "object", ... }`），`bound` 節點
用 `sourceId` 引用其他 source（i18n / file / typedData 皆可），沒有限制引用
深度。

### `data/pages.json`

`PageItem[]`，直接對應 `packages/ui/src/lib/page-model/index.ts` 的形狀。
每個 `PageBlock.props` 的每個 **top-level prop** 各自可以是：

- 一般純值（string / number / boolean / plain object/array）
- 一個 `ValueNode`（`resolvePlainProps` 會依該 prop 的 `FieldType`
  用 `resolveValue()` 解析成純值）

**重要**：`ValueNode` 是逐 prop 各自成立的，不是整個 `props` 物件包一層
`ValueNode`。例如 `Layout` 的 `header` prop 型別是 `HeaderProps`
（一個具名 interface），要整格綁定時，`header` 的值必須是
`{ mode: "object", fields: { brand: {...}, primaryNav: {...}, ... } }`，
逐欄位展開、對齊 `HeaderProps` 的每個欄位，而不是 `{ mode: "bound",
sourceId: "..." }` 指向單一 typedData（除非那個 typedData 剛好整包就是
`HeaderProps` 型別）。可以參考 `data/pages.json` 裡完整的範例。

`ReactNode` / slot 型別的 prop（例如 `Layout.children`）用
`{ "__slot": true, "blocks": [...] }`（`SlotValue` 的 JSON 形狀），裡面是
巢狀的 `PageBlock[]`。

`PageItem.seo` 是純值 `SeoData`（不是 `ValueNode`）——頁面的 SEO 由頁面管理
直接編輯，不透過綁定機制；全站預設 SEO（`typedData:seo:default`）才是綁定
的 typedData，兩者由 `render-page.ts` 合併（頁面值優先）。

### `data/locales.json`

```json
["zh-TW", "en"]
```

字串陣列。若省略此檔，會退回用 `sources/` 底下掃描到的 `i18n.*.json`
檔名當語系清單。

### `data/style-sheets.json`

```json
[{ "id": "global", "name": "全域樣式", "css": ":root { --brand: #2d9c74; }" }]
```

對應 `apps/web-builder` 樣式管理頁的 `StyleSheet` 形狀。`PageItem.styleSheetIds`
是這份清單裡 `id` 的引用陣列，`render-page.ts` 依序把對應的 `css` 內容
用 `<style>` 注入該頁 `<head>`。

## 路由規則

輸出路徑的權威來源是 `route.json` 裡 `target: "page"` 的那幾筆：
`pageId` 對應 `PageItem.id`，`value` 就是這個頁面（在預設語系下）的路徑。
非預設語系會自動加上 `/<locale>` 前綴（例如預設語系 `zh-TW` 的 `/about`，
在 `en` 底下會變成 `/en/about`）；預設語系哪個由 App 設定的 `SiteInfoData
.defaultLocale`（`typedData:siteInfo:main`）決定。

某個頁面在 `route.json` 裡找不到對應項目時，`resolve-route.ts` 會退回用
`/<pageId>` 當路徑，並回報一則 warning（不會中斷整個產生流程），建議
之後補上正確的路由設定。

只有 `status: "published"` 的頁面會被產出；`"draft"` 會被略過。

## 執行

```bash
# 在 monorepo 根目錄先安裝好依賴（pnpm install），本文件不涵蓋安裝步驟
cd apps/site-generator
pnpm generate                       # 讀 ../../data，輸出到 ./dist
pnpm generate -- --data ../../data --out ./dist   # 明確指定路徑
```

輸出結構範例（`locales.json = ["zh-TW", "en"]`、`zh-TW` 為預設語系）：

```
dist/
  index.html            # zh-TW 首頁（route.json 的 "/"）
  about/index.html      # zh-TW 關於我們
  en/index.html         # en 首頁（加了 /en 前綴）
  en/about/index.html
  assets/site.css       # Tailwind 掃過 packages/ui/src 之後的單一 CSS 產物
```

## `.tsx` 輸出流程（新，見 `roadmap.md`）

上面「執行」一節的 `pnpm generate` 輸出的是**完整 HTML**（`renderToStaticMarkup`，
不 hydrate）。另外提供一條平行的產出路徑，輸出的是**可以直接被其他專案 `import`
的 `.tsx` 原始碼**，長得像 `apps/web-builder/src/pages/index.tsx` 手寫的樣子，
差別是資料來自「攤平資料 + data-model resolve」，不是手寫 import 寫死物件。
背景與設計考量見 `apps/roadmap.md`，這裡只說明現況範圍：

- **locale 在產出當下就 resolve 死**：i18n 綁定欄位用 `resolveValue()`
  解成純值，直接 dump 成 JSX attribute。輸出的 `.tsx` 是固定某個 locale 的
  靜態內容，**不支援、也不做「瀏覽器裡動態切換 locale」**。
- **`.tsx` 只產出一份（預設語系）**：跟 `roadmap.md` 的需求一致——`.tsx`
  只做一份預設語系的即可。
- **只有一個節點時不多包一層 `<>...</>`**：不管是頁面內容區最外層，還是
  slot 底下的子節點，只有「多個 sibling 節點」才會用 `<>...</>` 包起來，
  單一節點直接輸出，跟真人手寫 JSX 的習慣一致。
- **資料 JSON 每個 locale 各自一份**：`data/<locale>/<pageId>.json`，內容是
  該 (page, locale) 底下每個 block 的 resolved 純值 props（攤平成
  `instanceId -> { componentId, componentName, props, slots }`，`slots` 記錄
  巢狀子 block 的 `instanceId` 清單，用來還原樹狀結構）。這份 JSON 純粹是
  靜態產出物，方便檢視/比對某個 locale 的資料內容，不是給 `.tsx` 在瀏覽器
  裡讀取、動態切換 locale 用的 runtime 資料。

```bash
cd apps/site-generator
pnpm generate:jsx                                  # 讀 ../../data，輸出到 ./dist-jsx
pnpm generate:jsx -- --data ../../data --out ./dist-jsx   # 明確指定路徑
```

輸出結構範例（`locales.json = ["zh-TW", "en"]`、`zh-TW` 為預設語系）：

```
dist-jsx/
  pages/
    HomePage.tsx     # 頁面 id "home" -> 元件名稱 HomePage，只用 zh-TW（預設語系）resolve
    AboutPage.tsx
  data/
    zh-TW/
      home.json       # { pageId, locale, blocks: { <instanceId>: {...} }, rootBlockIds, warnings }
      about.json
    en/
      home.json
      about.json
```

程式碼結構（`load-static-data.ts` / `resolve-route.ts` 完全沿用、不用動）：

- `jsx-codegen/render-block-tree-to-jsx.ts`：對應
  `@workspace/ui/lib/site-renderer/render-block-tree.tsx` 的
  `renderBlockTreeSync`，但輸出 JSX 原始碼字串而不是渲染結果；遞迴處理巢狀
  slot、正確縮排，單一子節點不多包 `<>...</>`。
- `jsx-codegen/stringify-literal.ts`：把 `resolveValue()` 解出的純值
  pretty-print 成合法 JS/JSX literal 語法（不是 `JSON.stringify`——物件 key
  不加引號、字串優先用雙引號等）。
- `jsx-codegen/import-collector.ts`：收集這個頁面用到的所有組件 import，
  去重、排序，避免同一個組件用了兩次卻 import 兩次；也支援 `import type`
  （見下方拆分資料版）。
- `render-page-jsx.ts`：組出一份完整 `.tsx` 檔案（import 語句 + `export default`
  組件），對應 `render-page.ts` 但輸出原始碼而非 HTML；頁面頂層只有一個
  block 時不包 Fragment。
- `render-page-data.ts`：把一個 (page, locale) 的每個 block resolved 成純值，
  攤平成一份 JSON（不含元件邏輯，純資料）。
- `generate-jsx.ts` / `cli-jsx.ts`：主流程與進入點，跟既有 `generate.ts` /
  `cli.ts`（HTML 輸出）平行存在、互不影響，也不需要 `renderToStaticMarkup` /
  `preloadBlockTreeComponents` / `buildCss` 這一整套「真的執行組件」的機制——
  code generator 只需要 `ComponentDoc`（`componentId -> importPath/componentName`）
  跟 `resolveValue`。

## `.tsx` + 拆分資料檔案輸出流程

上面「`.tsx` 輸出流程」產出的頁面 `.tsx` 是把每個 block 的純值 props 直接
inline 寫成 JSX attribute。這裡提供另一個變體：**把純值 props 抽成獨立的
資料檔案**，頁面 `.tsx` 改成 import 資料變數、用 `{...變數}` spread 進組件，
長得像 `apps/web-builder/src/pages/index.tsx` 手寫的樣子：

```tsx
import { Layout } from "@workspace/ui/components/landing1/layout";
import { Hero } from "@workspace/ui/components/landing1/hero";
import { ValueProps } from "@workspace/ui/components/landing1/value-props";
import { CtaBanner } from "@workspace/ui/components/landing1/cta-banner";
import { layout, hero, valueProps, ctaBanner } from "../data/zh-TW/home/data";

export default function HomePage() {
  return (
    <Layout
      {...layout}
      children={
        <>
          <Hero {...hero} />
          <ValueProps {...valueProps} />
          <CtaBanner {...ctaBanner} />
        </>
      }
    />
  );
}
```

（`Layout` 的 `children` 是 slot prop，仍然是活的巢狀 JSX 結構，不會被抽成
資料；`header`/`footer` 是純值 object prop，會跟其他組件一樣被抽成
`layout` 這筆資料。）

資料檔案本身長得像 `packages/ui/src/components/landing1/default.ts`：

```ts
import type { HeroProps } from "@workspace/ui/components/landing1/hero";

export const hero: HeroProps = {
  eyebrow: "...",
  title: { lead: "...", accent: "..." },
  // ...
};
```

**檔案怎麼分不是寫死的**——「可能 by 區塊或語系分開」用
`DataFileGroupingStrategy`（`jsx-codegen/data-file-writer.ts`）決定：

- `groupAllInOneFile`（預設）：整頁所有 block 的資料塞進同一份 `data.ts`。
- `groupByComponentName`：每個組件名稱各自一份檔案（`hero.ts`、`footer.ts`
  ……），同一頁用了兩次同組件時，兩筆 export 會落在同一個檔案裡。
- 語系本身一律各自分開（`data/<locale>/<pageId>/...`），不會混在一起。

```bash
cd apps/site-generator
pnpm generate:split-jsx                                    # 預設 groupAllInOneFile，輸出到 ./dist-split-jsx
pnpm generate:split-jsx -- --group by-component             # 每個組件名稱各自一份資料檔案
pnpm generate:split-jsx -- --data ../../data --out ./dist-split-jsx --group all-in-one
```

輸出結構範例（`locales.json = ["zh-TW", "en"]`、`zh-TW` 為預設語系、
`--group all-in-one`）：

```
dist-split-jsx/
  pages/
    HomePage.tsx        # 只用 zh-TW（預設語系），import ../data/zh-TW/home/data
    AboutPage.tsx
  data/
    zh-TW/
      home/
        data.ts          # 這個 (page, locale) 拆出的所有資料 export
      about/
        data.ts
    en/
      home/
        data.ts          # 其餘 locale 只產資料檔案，不產 .tsx（頁面只需要一份）
      about/
        data.ts
```

程式碼結構（新增／取代的部分，其餘跟上面「`.tsx` 輸出流程」共用）：

- `jsx-codegen/var-naming.ts`：`componentName`（PascalCase）轉資料變數名稱
  （camelCase，例如 `Hero -> hero`），同檔案內撞名時自動加數字後綴
  （`hero`、`hero2`……）。
- `jsx-codegen/render-block-tree-to-split-jsx.ts`：取代
  `render-block-tree-to-jsx.ts`，走訪 block 樹時把純值 props 抽成
  `DataExport`（而不是直接 dump 成 JSX attribute），頁面 JSX 改輸出
  `{...varName}` spread；slot 底下的巢狀組合關係仍是結構性的 JSX，不受影響。
- `jsx-codegen/data-file-writer.ts`：把 `DataExport[]` 依
  `DataFileGroupingStrategy` 分組、組成 `.ts` 資料檔案內容（含型別 import）。
- `render-page-split-jsx.ts`：取代 `render-page-jsx.ts`，組出「頁面 `.tsx`
  + 一組資料檔案」，呼叫端提供 `dataImportPath` 決定頁面 `.tsx` 要用什麼
  相對路徑 import 資料檔案。
- `generate-split-jsx.ts` / `cli-split-jsx.ts`：主流程與進入點，跟
  `generate-jsx.ts` / `cli-jsx.ts` 平行存在、互不影響。

## 實作筆記 / 已知限制

- **為什麼透過 Vite SSR，而不是直接 `import()`**：`@workspace/ui` 的
  `package.json` `exports` 直接指向 `.ts`/`.tsx` 原始碼，設計上就是要交給
  bundler（Vite）處理 JSX 轉譯與 `@workspace/ui/*` path alias。
  `apps/web-builder` 本身也是靠 Vite 完成同一件事，`generate.ts` 用
  `vite.createServer({ middlewareMode: true })` + `ssrLoadModule` 沿用同一套
  設定（同樣的 `@workspace/ui` alias、同樣的 `@vitejs/plugin-react`），
  不是另外維護一份轉譯規則。
- **CSS**：目前是「整站一份 CSS」（掃過 `packages/ui/src/**/*.tsx` 全部
  utility class），檔名固定為 `assets/site.css`（未加內容雜湊）。若要做
  長效快取，需要改成讀 Vite `build()` 回傳的 bundle 資訊取得雜湊檔名，
  目前先用最簡單、可預期的固定檔名。
- **互動組件（islands）**：輸出的 HTML 是純靜態 `renderToStaticMarkup`
  結果，不包含任何 hydration。`ThemeToggle`（主題切換按鈕）與 `Header`
  的行動版選單這兩個組件內部用了 `useState`/`useEffect`，SSR 出來的初始
  畫面（選單關閉、主題按鈕未標示 active）雖然正確，但按鈕本身在沒有額外
  client script 的情況下不會回應點擊。`render-page.ts` 已預留
  `islandScriptHrefs` 選項可以掛 `<script type="module">`，但目前
  `generate.ts` 還沒實作「掃描頁面用到哪些互動組件、各自建一份最小 client
  bundle」這一步（跟 Astro islands 的概念一樣，之後補上即可，不影響
  已經寫好的靜態 HTML 產出本身）。主題本身的「不閃爍」效果已經靠
  `themeBootstrapScript`（`packages/ui/src/lib/theme.ts`）用純 DOM/localStorage
  達成，不需要等 hydration。
- **`defaultLocale` 解析**：從 `typedData:siteInfo:main` 這筆 typedData
  用 `resolveValue()` 解出（沿用 App 設定頁真正在用的同一筆資料），找不到
  時退回 `locales.json`（或掃描到的 i18n locale 清單）的第一個語系。
- 沒有做任何型別編譯檢查或執行測試（依需求不執行安裝與 build），
  上述模組之間的呼叫關係已對照 `packages/ui/src` 現有原始碼逐一核對過
  函式簽章與資料形狀，但實際跑起來前建議先 `pnpm install` 後
  `pnpm --filter site-generator typecheck` 過一次。