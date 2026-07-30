# AI 協作指南：組件與資料

> 給負責維護這個 monorepo 的 AI 或人類貢獻者看。
> 目的：讓「新增/修改組件」與「新增/修改資料」這兩件事，即使不能實際跑
> `npm run docs:generate` 或 `pnpm generate:astro`，也能憑肉眼比對規則
> 產生出跟工具產生結果一致、格式正確的檔案。

## 0. 一句話總結你能碰什麼

```
✅ packages/ui/src/components/**     組件本體（含 default.ts / types.ts）
✅ data/**                            網站內容資料（i18n / 頁面 / 路由 / 檔案 / typedData）
🚫 apps/web-builder/**                管理後台本體，不要碰、不要為了完成任務去改它
🚫 apps/astro/** apps/react/**        產生出來的網站，是「產物」，不要手改，
                                       改了也會在下次生成時被覆蓋
```

`apps/web-builder` 是一個「編輯這兩份東西的 GUI」。它自己內部怎麼實作
（React state、localStorage、拖拉互動……）跟你的任務無關；你的任務永遠
是「把組件寫好」跟「把資料填對」，讓 web-builder／site-generator 之後
能正確讀到、正確生成。

如果一個任務看起來非要改 `apps/web-builder` 不可（例如新增一種欄位型別的
編輯器 UI），先跟使用者確認這是不是真的在範圍內——預設假設是不用。

> **例外（唯讀查閱，不代表可編輯）**：`ValueNode` / `DataSource` /
> `PageBlock` / `PageItem` 這幾個「資料形狀」的**權威定義**目前實際上
> 放在 `apps/web-builder/src/lib/data-model/schema.ts` 與
> `apps/web-builder/src/lib/page-model/index.ts` 裡（這是目前的程式碼
> 現況，跟「web-builder 只是個 GUI」的長期方向有落差，但還沒重構過去）。
> 附錄 D 已經把這兩份檔案裡跟「怎麼寫 `data/` JSON」有關的型別定義原文
> 節錄進來，**平常查格式只需要看附錄 D，不需要、也不要去讀
> `apps/web-builder` 其餘任何檔案**。只有在附錄 D 明顯跟你手上這份
> zip 的實際內容對不上時，才唯讀開這兩個檔案本身核對，且核對完不要
> 順手修改它們。

---

## 1. 整體資料流（先建立心智模型）

```
packages/ui/src/components/<group>/*.tsx   ← 你手寫組件 + JSDoc + default.ts
              │
              │  (概念上等同 scripts/docs/generate-docs.mjs 會做的事)
              ▼
        data/components.json          ← 每個組件的 props 表格（給人看/給生成器比對型別）
        data/component-types.json     ← props 用到的具名 interface/type 完整展開
              │
              ▼
data/<workspace>/sources/*.json       ← 「值从哪裡來」：i18n / file / route / typedData
data/<workspace>/pages/*.json         ← 「頁面用了哪些組件、順序、props 綁定」
data/<workspace>/locales.json
data/<workspace>/style-sheets.json
              │
              │  (site-generator 讀取以上資料，套用組件本身)
              ▼
apps/astro/**  或  apps/react/**      ← 生成出的實際網站（產物，不手改）
```

`<workspace>` 目前看到的是 `default` 跟 `test` 兩份平行資料（多租戶/多環境
的概念），結構完全一樣。

**核心分離原則**（來自 `apps/web-builder/scripts/site-generator/readme.md`，
這份文件本身也建議先讀一次）：
- **組件**是純 UI，不含任何「這個值從哪裡來」的邏輯。
- **頁面資料**只描述「用了哪些組件、順序、slot 巢狀關係」。
- **內容資料**（i18n/file/route/typedData）只描述「值本身」。

三者分離，代表你改組件時完全不用管資料長什麼樣，改資料時也完全不用碰
組件程式碼——只要「形狀」對得上。

---

## 2. 怎麼新增/修改一個組件

### 2.1 檔案結構慣例（一個「群組」= 一個資料夾）

```
packages/ui/src/components/<group>/
  types.ts        群組內共用的型別（NavItem、BrandData…），非必要不要重複定義
  <component>.tsx 單一組件：interface XxxProps + export function Xxx(...)
  default.ts       群組內每個組件的一份 demo/預設 props（給預覽與新增組件時的初始值用）
```

現有範例群組：`landing1`（頁面型組件）、`site`（純資料型的 SEO / SiteInfo，
無渲染邏輯）。新增組件優先看能不能放進既有群組；真的是全新的一組風格
才開新資料夾。

### 2.2 核心原則：組件盡量是純展示、無 side effect

因為多語系／多環境資料都是從外部（`data/`）以純值形式傳進來的，組件
本身理想上就是「輸入 props → 輸出畫面」的純函式，不應該自己再產生
額外的、跟顯示無關的 side effect。具體來說：

- **不要**在組件內部發 network request、寫 `localStorage`/`cookie`、
  操作全域狀態、或依賴組件外部的可變狀態來決定渲染結果——這些都會讓
  同一份 `props` 在 SSG／不同 locale／不同 workspace 下渲染出不一樣的
  結果，跟「資料驅動畫面」的設計整個衝突，也會讓 Astro 的靜態輸出跟
  實際執行結果不一致。
- **允許、且已經在用**的例外是「純粹跟顯示互動有關」、不影響資料或
  跨組件狀態的 local UI state，例如：
  - `ThemeToggle` / `Header` 行動選單用 `useState` 記錄選單開關、
    當前主題選項——這些只影響這個組件實例自己的顯示，重新整理或換
    locale 都不會留下痕跡，也不寫回任何資料來源。
  - 依 `props` 計算衍生的顯示邏輯（格式化文字、決定 class name）。
- 判斷準則：**這個 side effect 停止之後，資料/其他組件的行為會不會
  跟著改變？** 如果只影響「這個組件自己畫面看起來怎樣」，可以接受；
  如果會影響到資料本身、其他組件、或下次渲染的結果，就不該放進組件裡
  ——那應該是資料層或生成器該處理的事。
- 新增組件時，如果發現非得靠 side effect 才能做到某個效果，先想一下
  這件事能不能透過「多一個 prop（讓呼叫端決定）」來解決，而不是讓
  組件自己動手做。

### 2.3 撰寫規則（這些會被生成器解析，寫錯格式會影響 data/components.json）

1. **每個組件一個具名 export 的函式 + 一個同名（或 `XxxProps`）具名 export 的
   interface**，例如：

```tsx
export interface HeroProps {
  /** Small pill of text above the headline */
  eyebrow: string;
  title: {
    /** Non-highlighted lead-in of the headline */
    lead: string;
    /** Highlighted/gradient portion of the headline */
    accent: string;
  };
  secondaryCta?: { label: string; to: string };
}

/**
 * 組件本身一句話功能描述（會變成 components.json 的 description）。
 */
export function Hero({ eyebrow, title }: HeroProps) { ... }
```

2. **每個欄位都要寫 JSDoc 單行註解**（`/** ... */`），這行文字會原封不動
   變成 `data/components.json` 裡該 prop 的 `description`。沒寫的欄位
   `description` 就是空字串——維護組件的人請不要留空。

3. **型別怎麼寫決定了 `data/component-types.json` 會不會展開**：
   - 具名 `interface` 或「底層是物件字面量」的 `type`（例如
     `type Wordmark = { lead: string; accent: string }`）→ 會被收進
     `component-types.json`，id 是 `{檔案路徑}#{型別名稱}`。
   - 純 union / primitive 別名（例如 `type FlexAlign = "start" | "center"`）
     → **不會**被收進 component-types.json，而是直接被展開內聯進
     `components.json` 該 prop 的 `type` 字串裡。這種型別適合拿來做
     「幾個固定選項」的欄位。
   - 陣列型別 `Foo[]` 對應的相關型別 id 慣例上就是 `Foo`（單數形式），
     實際綁定資料（typedData）若要表示「一整組」則用 `Foo[]` 當
     `typeId`（見第 3 節）。

4. **可選欄位用 `?:`**。生成器輸出的 `required` 布林值就是照這個來，
   `data/components.json` 裡 required 的欄位會排在前面。

5. **共用型別放 `types.ts`，不要在每個 `.tsx` 裡各自重複宣告**。
   `data-model` 的綁定機制是用「型別 id 是否一致」判斷這筆資料能不能塞進
   這個 prop，同一個概念如果散落成好幾個名字不同但長得一樣的 interface，
   會導致資料明明結構相符卻綁不進去。

6. **`ReactNode` 型別的欄位＝這個 prop 是「slot」**（可以放子組件，例如
   `Layout.children`）。判斷規則很單純：型別字串是
   `ReactNode` / `React.ReactNode` / `JSX.Element`（含陣列、含 union 分支）
   就算 slot。slot 欄位在頁面資料裡的存法跟一般欄位完全不同（見 3.3）。
   不要把「應該是一組子組件」的欄位型別寫成 `string[]` 之類的純值——
   那樣就無法承載巢狀組件樹了。

### 2.4 `default.ts` 怎麼寫

`default.ts` 是**唯一一個不會被當成組件本體解析**、但一樣要維護好的檔案。
它提供：
- web-builder 預覽面板的初始 demo 資料
- 新增一個組件實例到頁面時，自動帶入的預設 props

寫法：對每個組件的 `XxxProps` 匯出一個同名（camelCase）常數，型別直接標
`XxxProps`，這樣寫錯欄位 TypeScript 會直接報錯：

```ts
import { type HeroProps } from "./hero";

export const hero: HeroProps = {
  eyebrow: "New: v2.0 is here",
  title: { lead: "Build faster with ", accent: "OZSV" },
  subtitle: "...",
  primaryCta: { label: "Get started", to: "/product" },
  secondaryCta: { label: "Learn more", to: "/about" },
};
```

- **必填欄位一定要給值**；可選欄位視情況給或不給。
- 有 slot 的組件（例如 `Layout`），`children` 給 `undefined` 即可
  （slot 的內容是頁面組合時才決定的，不屬於「預設值」的範疇）。
- 群組內共用的資料（`brandData`、`primaryNav`……）在 `default.ts`
  頂部各自宣告一次，多個組件的預設值互相引用，避免重複貼一樣的內容
  卻悄悄不同步。

### 2.5 新增組件時的檢查清單

- [ ] 檔案放對群組資料夾，檔名 kebab-case（例如 `contact-card.tsx`）
- [ ] `export interface XxxProps` + `export function Xxx`
- [ ] 每個欄位都有 `/** ... */` 說明
- [ ] 共用型別複用 `types.ts`，不重複定義
- [ ] slot 型欄位用 `ReactNode`
- [ ] 沒有引入跟顯示無關的 side effect（network / storage / 全域狀態）
- [ ] `default.ts` 補上這個組件的預設值，型別標注正確
- [ ] 心裡對照過一次：如果現在跑 `npm run docs:generate`，
      `data/components.json` 會多出一筆什麼樣的物件？（可參考本文件
      附錄 A 的真實範例現場核對格式）

---

## 3. 怎麼新增/修改資料（`data/` 目錄）

### 3.1 目錄結構

```
data/<workspace>/
  locales.json                 ["zh-TW", "en"]
  style-sheets.json             [{ id, name, cssFile }]  ← 只存指標，見 3.3
  style-sheets/
    <id>.css                    實際 CSS 內容，一份樣式表一個檔案
  sources/
    i18n.<locale>.json          單一語系，key 攤平成點分字串 -> 值
    route.json                  路由表
    file.json                   已上傳/引用的檔案
    typedData.json               具名型別資料（可綁定 i18n/file/巢狀 typedData）
  pages/
    <pageId>.json                單一頁面：seo + blocks 樹
```

`<workspace>` 就是像 `default`、`test` 這樣的一份完整站台資料，彼此獨立、
結構相同。新增一個新環境/站台就是複製整個結構到新的 workspace 名稱下。

### 3.2 `sources/` 四種資料來源

#### i18n：`sources/i18n.<locale>.json`

```json
{
  "brand.ariaLabel": "OZSV home",
  "nav.product": "Product",
  "nubmer1": 100
}
```
- 一個檔案一個 locale，檔名決定 locale（`i18n.zh-TW.json` → `"zh-TW"`）。
- key 是點分字串（人為命名，跟哪個組件用它沒有強制對應關係，但建議照
  `<情境>.<欄位>` 的慣例命名，方便管理介面分類）。
- 值可以是 string / number / boolean（不是每個 i18n 條目都一定是文字）。
- 還原後的 id 是 `i18n:<key>`。

> **語系規則：預設語系是 `en`，AI 只新增/修改 `sources/i18n.en.json`。**
> 新增或調整一筆 i18n key 時：
> - **一定要**在 `i18n.en.json` 補上對應的 key/value（這是預設語系，
>   缺了會讓解析在其他語系找不到 key 時退回「missing locale」）。
> - **不要**去動 `i18n.en.json` 以外的其他語系檔案（例如 `i18n.zh-TW.json`），
>   即使知道怎麼翻譯，也不要順手幫忙填——文案的在地化由使用者自己
>   手動調整，AI 自動生成的翻譯品質不受控，容易產生跟品牌語氣不符的
>   文案，也會讓使用者難以追蹤「這句話是不是被 AI 動過」。
> - 新增了 en 的 key 但其他語系檔案還沒有對應項目，是**預期中的暫時
>   缺漏**，不用主動補上或特別提出警告，使用者會自行處理；只要 en
>   那份是完整、正確的就好。

#### route：`sources/route.json`

```json
{
  "route1": {
    "label": "route1",
    "target": "page",
    "value": "/test",
    "noindex": false,
    "pageId": "home"
  },
  "route2": {
    "label": "route2",
    "target": "page",
    "value": "/v2",
    "noindex": false,
    "pageId": "page_1akvhp"
  }
}
```
- key（`route1`）是這筆路由的 id，還原後變成 `route:route1`。
- `target: "page"`：連到站內某頁，`pageId` 對應 `pages/{pageId}.json`
  的 `id`，`value` 是這頁在**預設語系**下的路徑；非預設語系會自動加
  `/<locale>` 前綴，不用你手動處理。
- `target: "url"`：外部連結，`value` 就是完整 URL，不會被加語系前綴，
  也不需要 `pageId`。
- **這份檔案同時是「輸出路徑的權威來源」**：某個 `status: "published"`
  的頁面如果在這裡找不到對應的 route，生成器會退回用 `/<pageId>` 當
  路徑，並產生警告——新增頁面時記得同步在這裡補一筆路由。

#### file：`sources/file.json`

```json
{
  "logo-main": {
    "label": "檔案: 主要 Logo",
    "url": "http://localhost:5173/uploads/default/xxx.webp",
    "mimeType": "image/webp",
    "size": 294486,
    "uploadedAt": "2026-07-27T02:31:16.056Z",
    "caption": "test",
    "fileName": "xxx.webp"
  }
}
```
- key 是檔案 id，還原後是 `file:<key>`。
- 只有 `url` 是必要欄位，其餘（`mimeType`/`size`/`uploadedAt`/`caption`/
  `description`/`fileName`/`focusX`/`focusY`）都是可選的中繼資訊。
- **AI 新增資料時**：如果是「引用一張已存在網路上的圖」，可以只給
  `label` + `url`，不用假造 `uploadedAt`/`size` 之類的欄位。

#### typedData：`sources/typedData.json`

這是最複雜、也最強大的一種——用來表示「某個具名 interface/type 的一整包
結構化資料」，而且每個欄位都可以各自綁定到 i18n / file / 另一筆 typedData。

```json
{
  "brand:main": {
    "label": "型別資料: 主品牌 (BrandData)",
    "typeId": "src/components/landing1/types.ts#BrandData",
    "value": {
      "mode": "object",
      "fields": {
        "toHome":    { "mode": "literal", "value": "/" },
        "ariaLabel": { "mode": "bound", "sourceId": "i18n:brand.ariaLabel" },
        "logoSrc":   { "mode": "bound", "sourceId": "file:logo-main" },
        "wordmark": {
          "mode": "object",
          "fields": {
            "lead":   { "mode": "bound", "sourceId": "i18n:brand.wordmark.lead" },
            "accent": { "mode": "bound", "sourceId": "i18n:brand.wordmark.accent" }
          }
        }
      }
    }
  },
  "nav:primary": {
    "label": "型別資料: 主導覽 (NavItem[])",
    "typeId": "src/components/landing1/types.ts#NavItem[]",
    "value": {
      "mode": "array",
      "items": [
        { "mode": "object", "fields": {
            "label": { "mode": "bound", "sourceId": "i18n:nav.product" },
            "to":    { "mode": "literal", "value": "/product" }
        }}
      ]
    }
  }
}
```

規則：
- key（例如 `brand:main`）是這筆資料的 id，還原後是 `typedData:<key>`。
- `typeId`：
  - 單一物件型別 → 直接用 `component-types.json` 裡那個型別的 id，
    例如 `src/components/landing1/types.ts#BrandData`。
  - 「一整組」某型別（陣列）→ 在型別 id 後面加 `[]`，
    例如 `src/components/landing1/types.ts#NavItem[]`。
- `value` 是遞迴的 **ValueNode**，只有四種 `mode`：

| mode | 形狀 | 意義 |
|---|---|---|
| `"literal"` | `{ mode: "literal", value: string\|number\|boolean\|null }` | 寫死的值 |
| `"bound"` | `{ mode: "bound", sourceId: "i18n:xxx" \| "file:xxx" \| "typedData:xxx", path?: string[] }` | 引用另一筆資料來源；`path` 可選，用來從被引用資料裡再挖一層欄位 |
| `"object"` | `{ mode: "object", fields: { key: ValueNode, ... } }` | 對應一個具名型別/巢狀物件欄位的每個欄位 |
| `"array"` | `{ mode: "array", items: ValueNode[] }` | 對應陣列型別，每個 item 各自是一個 ValueNode |

  **`value` 的結構必須跟該 `typeId` 對應型別的欄位結構一致**——`object`
  節點的 `fields` key 要對得上 interface 的欄位名稱，巢狀多深都要展開，
  不能只用一個 `bound` 打包整個物件（除非那個 bound 目標本身剛好就是
  同型別的另一筆 typedData）。
- 綁定可以任意深、也可以互相引用（`typedData` 綁 `typedData`），沒有
  深度限制，但**不要造成循環引用**。

### 3.3 `style-sheets.json` + `style-sheets/<id>.css`

```json
// style-sheets.json
[
  { "id": "global", "name": "全域樣式", "cssFile": "style-sheets/global.css" },
  { "id": "css_j4i11o", "name": "Test", "cssFile": "style-sheets/css_j4i11o.css" }
]
```

- `style-sheets.json` **只存指標**（`id` / `name` / `cssFile`），實際 CSS
  內容各自放在 `style-sheets/<id>.css`——一份樣式表一個檔案，用正常的
  `.css` 語法寫（正常換行、正常縮排），不是塞在 JSON 字串裡的跳脫版本。
- **這是刻意的設計，不要把 CSS 內容改回內嵌進 JSON 裡**：CSS 若直接放進
  JSON 字串，每個換行都要跳脫成 `\n`，人眼難編輯，git diff 也幾乎沒有
  意義（改一行會讓整個字串在 diff 裡顯示成整段換掉）。拆成獨立 `.css`
  檔案後可以正常編輯、正常 diff。
- 新增一份樣式表：在 `style-sheets/` 底下新增一個 `<id>.css` 檔案，再到
  `style-sheets.json` 補一筆 `{ id, name, cssFile }` 指向它。
- 修改既有樣式表內容：直接編輯對應的 `.css` 檔案，`style-sheets.json`
  不用動（除非要改 `name` 或換 `id`）。
- `id` 命名沒有強制格式，現有範例用 `global`（語意化）跟 `css_j4i11o`
  （隨機字串），兩種都可以，新增時挑一個好辨識的名字即可。
- 頁面資料（`pages/<pageId>.json`）的 `styleSheetIds` 欄位只存這裡的
  `id` 引用，不會、也不需要複製 CSS 內容本身（見 3.4）。
- **對應的程式碼**：這個「JSON 指標 + 獨立內容檔案」的拆分，只影響
  「資料在磁碟上怎麼存」這一層，`load-static-data.ts` 的 `loadStyleSheets()`
  會把 `cssFile` 指到的內容讀出來，還原成程式內部（跟 web-builder 編輯器
  UI）用的 `{ id, name, css }` 形狀——這一步已經處理好，你只需要維護
  `.css` 檔案本身跟 `style-sheets.json` 的指標，不需要自己組合這個還原
  邏輯。

### 3.4 `pages/<pageId>.json` 頁面資料

```json
{
  "id": "home",
  "name": "首頁",
  "status": "published",
  "seo": {
    "title": "首頁",
    "titleTemplate": "%s | Web Builder",
    "description": "網站首頁",
    "keywords": "web, builder, cms",
    "ogImage": "/og-image.png",
    "ogType": "website",
    "twitterCard": "summary_large_image",
    "twitterSite": "@webbuilder",
    "canonicalUrl": "",
    "robots": "index, follow"
  },
  "styleSheetIds": ["global"],
  "blocks": [
    {
      "instanceId": "blk_wyfojbu0",
      "componentId": "src/components/landing1/layout.tsx#Layout",
      "componentName": "Layout",
      "props": {
        "header": { "brand": { "...": "..." }, "primaryNav": [ "..." ] },
        "footer": { "...": "..." },
        "children": {
          "__slot": true,
          "blocks": [
            {
              "instanceId": "blk_xxxxxxx1",
              "componentId": "src/components/landing1/hero.tsx#Hero",
              "componentName": "Hero",
              "props": { "eyebrow": "...", "title": { "lead": "...", "accent": "..." } }
            }
          ]
        }
      }
    }
  ]
}
```

規則：
- 檔名＝`id`（例如 `home.json` 的 `id` 是 `"home"`）。
- `status`：只有 `"published"` 的頁面會被生成器輸出成實際網站頁面；
  `"draft"` 會被略過。新增草稿頁面請設成 `"draft"`。
- `seo` 是**純值**（不是 ValueNode）——每頁各自寫死自己的 SEO 內容，
  不透過綁定機制。全站預設 SEO（`typedData:seo:default`）只在頁面沒有
  自訂時當退回值，兩者由生成流程合併（頁面值優先）。
- `blocks` 是**組件實例樹**，每個節點：
  - `instanceId`：唯一亂數 id，慣例前綴 `blk_` + 隨機字串，
    自己新增節點時隨便取一個沒被用過的字串即可，不需要跟任何規則對齊。
  - `componentId`：**必須完全等於** `data/components.json` 裡該組件的
    `id`（`{檔案路徑}#{組件名稱}`），拼錯或版本不對會找不到對應組件。
  - `componentName`：純顯示用途，跟 `componentId` 的組件名稱那段一致即可。
  - `props`：**只需要放「這個實例要覆寫的欄位」**，沒放的欄位會沿用
    組件的 `default.ts` 值——不是每個 prop 都要填好填滿。
- **top-level 每個 prop 各自決定要不要用綁定**：
  - 一般值：直接寫純值（string / number / boolean / plain object / array）。
  - 要綁定：整個 prop 的值換成一個 `ValueNode`（跟 3.2 typedData 的
    `value` 是同一種形狀），且要逐欄位展開對齊該 prop 的型別
    （例如 `header` prop 型別是 `HeaderProps`，要綁定就得整個 `header`
    寫成 `{ "mode": "object", "fields": { "brand": {...}, "primaryNav": {...}, ... } }`，
    不能只給 `{ "mode": "bound", "sourceId": "typedData:xxx" }`
    ——除非那筆 typedData 剛好整包就是 `HeaderProps` 型別）。
  - **絕大多數情況下，直接寫純值就夠了**；只有真的需要「這個頁面的這個
    欄位要跟著全站某筆共用資料走」時才需要寫成 ValueNode。
- **slot 型欄位**（組件 prop 型別是 `ReactNode`，例如 `Layout.children`）
  一律寫成：
  ```json
  { "__slot": true, "blocks": [ /* 巢狀的 PageBlock[] */ ] }
  ```
  裡面遞迴放子組件實例，結構跟頂層 `blocks` 完全一樣，可以無限巢狀。
- `clientDirective`（可選欄位，跟 `props` 平行、不要塞進 `props` 裡）：
  給 Astro 產生器決定這個組件實例要不要 hydrate 成互動元件。
  未設定＝純靜態（預設、零 JS）。值可以是
  `"only" | "visible" | "idle" | "load" | "media"`。純展示用的組件
  （大部分 landing1 組件）不需要這個欄位；有 `useState`/`onClick` 等
  互動邏輯的組件（例如 `ThemeToggle`、`Header` 的行動選單）才需要考慮。

### 3.5 新增/修改資料時的檢查清單

- [ ] 內容文字（會隨語系變化）放 `i18n.en.json`（預設語系），**不要動其他語系檔案**
- [ ] 圖片/檔案放 `file.json`，只填實際知道的欄位
- [ ] 新頁面記得在 `route.json` 補一筆對應路由，否則會退回 `/<pageId>`
- [ ] 新頁面 `id`、檔名、`route.json` 的 `pageId` 三者一致
- [ ] `blocks[].componentId` 完全對應 `data/components.json` 的 `id`
- [ ] slot 型 prop 用 `{ "__slot": true, "blocks": [...] }` 包，不是純陣列
- [ ] 需要綁定的 prop 才寫 ValueNode，其餘直接寫純值即可，不要為了「看起來規範」而硬套綁定
- [ ] 沒特別需要 hydrate 的組件不要加 `clientDirective`
- [ ] CSS 內容改在 `style-sheets/<id>.css`，**不要**塞回 `style-sheets.json` 裡

---

## 4. 這份工作流刻意不管的部分（範圍外）

- `apps/web-builder/**` 的 React/UI 實作細節：不用理解它怎麼渲染
  屬性面板、怎麼存 localStorage、怎麼做拖拉互動。
- `apps/astro/**`、`apps/react/**` 底下的實際檔案：這些是
  `site-generator` 讀 `data/` 產生的**輸出**，手改了下次生成會被蓋掉；
  如果生成結果不對，該回頭檢查的是 `packages/ui` 的組件定義或 `data/`
  的資料，而不是去修產物本身。
- `apps/web-builder/scripts/site-generator/**` 的產生器程式碼本身：
  除非任務明確是「改生成邏輯」，否則把它當黑盒子，只要保證
  `packages/ui` 與 `data/` 的格式符合本文件描述，它自然能正確運作。

若不確定某個檔案算不算「範圍內」，判斷準則就是：這個檔案是不是
`packages/ui/src/components/**` 或 `data/**` 底下的內容？是→可以改；
不是→先跟使用者確認，預設不要主動改。

> **例外情況：`data/` 的檔案格式本身變動時，需要連鎖同步。**
> `apps/web-builder` 底下有幾支程式碼專門負責「把 `data/` 的攤平格式
> 讀進 web-builder（匯入）」與「把 web-builder 的內容寫成 `data/`
> 攤平格式（匯出）」——目前是
> `apps/web-builder/scripts/site-generator/load-static-data.ts`（生成器
> 讀取端）、`apps/web-builder/src/lib/export-flat-data.ts`（匯出端）、
> `apps/web-builder/src/lib/import-flat-data-to-storage.ts`（匯入端）。
> 如果任務是「調整 `data/` 某種資料的檔案格式」（例如 3.3 節
> `style-sheets.json` 從內嵌 CSS 改成 `cssFile` 指標的這次變動），
> 這三處對格式的假設要一起同步更新，否則會出現「生成器看得懂新格式，
> 但 web-builder 匯出的還是舊格式」這種靜默不一致。純粹「新增/修改
> 某一筆資料內容」（不改格式本身）則不受影響，不需要碰這幾支程式碼。

---

## 附錄 A：`data/components.json` 單筆真實範例（供比對格式用）

```json
{
  "id": "src/components/landing1/brand.tsx#Brand",
  "componentName": "Brand",
  "filePath": "src/components/landing1/brand.tsx",
  "importPath": "components/landing1/brand",
  "description": "Site logo + wordmark, linking back to the homepage.\nPure presentation — all strings and the logo image come from `data`.",
  "props": [
    {
      "name": "data",
      "required": true,
      "type": "BrandData",
      "defaultValue": null,
      "description": "Brand strings and logo image, fully i18n-ready"
    },
    {
      "name": "className",
      "required": false,
      "type": "string",
      "defaultValue": null,
      "description": "Additional class names merged onto the root anchor"
    }
  ],
  "relatedTypeNames": [
    "src/components/landing1/brand.tsx#BrandProps",
    "src/components/landing1/types.ts#BrandData"
  ]
}
```

## 附錄 B：`data/component-types.json` 單筆真實範例

```json
{
  "id": "src/components/landing1/button.tsx#ButtonProps",
  "name": "ButtonProps",
  "kind": "interface",
  "description": "",
  "fields": [
    { "name": "variant", "required": false, "type": "\"primary\" | \"secondary\" | \"ghost\" | \"danger\"", "description": "Visual style of the button" },
    { "name": "size", "required": false, "type": "\"sm\" | \"md\" | \"lg\"", "description": "Size of the button" },
    { "name": "children", "required": true, "type": "ReactNode", "description": "Button label / content" }
  ]
}
```

## 附錄 C：快速對照表

| 我想做的事 | 該碰的檔案 |
|---|---|
| 新增一個組件 | `packages/ui/src/components/<group>/<name>.tsx` + 更新該群組 `default.ts` |
| 新增組件共用的資料形狀 | `packages/ui/src/components/<group>/types.ts` |
| 改一段網站文字 | `data/<workspace>/sources/i18n.en.json`（預設語系，其他語系不要動） |
| 換一張圖片 | `data/<workspace>/sources/file.json` |
| 新增一個網址路由 | `data/<workspace>/sources/route.json` |
| 新增「全站共用」的一包結構化資料（品牌、導覽列…） | `data/<workspace>/sources/typedData.json` |
| 改網站的全域/自訂樣式 | `data/<workspace>/style-sheets/<id>.css`（內容），`style-sheets.json`（指標，通常不用動） |
| 新增一個頁面 | `data/<workspace>/pages/<id>.json` + `route.json` 補路由 |
| 在頁面裡新增/調整組件組合、順序、巢狀 slot | 對應 `pages/<id>.json` 的 `blocks` |
| 讓某個組件在 Astro 輸出時可互動 | 該 block 的 `clientDirective` 欄位 |

---

## 附錄 D：型別權威定義節錄（唯讀，僅供查閱格式）

> 以下內容原文節錄自
> `apps/web-builder/src/lib/data-model/schema.ts` 與
> `apps/web-builder/src/lib/page-model/index.ts`。
>
> **這是目前程式碼的實際現況**：這兩份「資料形狀」的權威定義住在
> `apps/web-builder` 底下，跟第 0 節「不要碰 apps/web-builder」的
> 原則字面上有落差——之所以仍然收錄在這裡，是因為第 3 節描述的
> `data/` JSON 格式（`ValueNode` / `DataSource` / `PageBlock` /
> `PageItem`）就是照這兩份型別走的，需要精準的欄位名稱與結構才能
> 產生格式正確的 JSON。
>
> **使用方式**：查格式只看這裡就好，**不要**因為要確認型別而去讀
> `apps/web-builder` 的其他檔案（React 元件、UI 邏輯、store 等），
> 也**不要**編輯這兩份檔案本身或其餘 web-builder 程式碼。這兩份型別
> 之後若被重構搬進 `packages/ui`（讓 web-builder 真正只是個 GUI），
> 這裡的節錄應該同步更新來源路徑，內容本身通常不太需要改。

### D.1 `data-model/schema.ts`（`ValueNode` / `DataSource` 相關型別）

```ts
export type PrimitiveType = "string" | "number" | "boolean" | "date";

export type FieldHint = "text" | "url-like" | "unknown";

export type FieldType =
  | { kind: "primitive"; type: PrimitiveType; hint?: FieldHint }
  | { kind: "ref"; typeId: string } // typeId 為生成器提供的複合 id，例如 "src/components/landing1/types.ts#BrandData"
  | { kind: "array"; item: FieldType }
  | { kind: "object"; fields: Record<string, FieldType> }
  | { kind: "slot" }; // ReactNode / children，不可綁定，交由「插入子組件」機制處理

// ------------------------------------------------------------
// ValueNode —— 實際值（跟著 FieldType 同構遞迴）
// ------------------------------------------------------------

export type ValueNode = LiteralNode | BoundNode | ArrayNode | ObjectNode;

export interface LiteralNode {
  mode: "literal";
  value: string | number | boolean | null;
}

export interface BoundNode {
  mode: "bound";
  sourceId: string;
  path?: string[];
}

export interface ArrayNode {
  mode: "array";
  items: ValueNode[];
}

export interface ObjectNode {
  mode: "object";
  fields: Record<string, ValueNode>;
}

// ------------------------------------------------------------
// DataSource —— 統一的資料來源節點
// ------------------------------------------------------------

export type DataSourceKind = "i18n" | "file" | "typedData" | "route";

export interface DataSourceMetaBase {
  id: string;
  kind: DataSourceKind;
  label?: string;
}

// i18n 是「基本型別的容器」，不只是文字：一筆 i18n 資料可以是 string/number/boolean，
// 不同 locale 各自存一份對應型別的值。
export type I18nPrimitiveValue = string | number | boolean;

export interface I18nDataSource extends DataSourceMetaBase {
  kind: "i18n";
  valueType: PrimitiveType;
  values: Record<string, I18nPrimitiveValue>; // locale -> value
}

export interface FileDataSource extends DataSourceMetaBase {
  kind: "file";
  url: string;
  mimeType?: string;
  caption?: string;
  description?: string;
  size?: number;
  uploadedAt?: string;
  fileName?: string;
  focusX?: number;
  focusY?: number;
  preferredDestId?: string;
}

// target === "page"：連到站內某頁（pageId 對應頁面），value 由該頁路由推得
// target === "url"： 外部/絕對網址，value 就是自由輸入的字串
export type RouteTarget = "page" | "url";

export interface RouteDataSource extends DataSourceMetaBase {
  kind: "route";
  target: RouteTarget;
  pageId?: string;
  value: string;
  noindex: boolean;
}

export interface TypedDataSource extends DataSourceMetaBase {
  kind: "typedData";
  // 對應某個具名 FieldType 的複合 id；若是陣列型資料（例如「一整組導覽連結」），
  // 慣例上用 "<refTypeId>[]" 表示。
  typeId: string;
  value: ValueNode; // 型別資料本身也是一棵遞迴值樹（可以內含 bound 到 i18n/file）
}

export type DataSource =
  I18nDataSource | FileDataSource | RouteDataSource | TypedDataSource;
```

### D.2 `page-model/index.ts`（`PageBlock` / `PageItem` / slot 相關型別與判斷式）

```ts
/**
 * 放進某個 ReactNode（slot）prop 裡的值：一組子組件實例，順序即渲染順序。
 * 只有型別為 ReactNode / React.ReactNode / JSX.Element 的 prop 才可能放這種值
 * （見 isSlotPropType），其餘 prop 一律是純值（string / number / boolean...），
 * 不會是 SlotValue。
 */
export interface SlotValue {
  __slot: true;
  blocks: PageBlock[];
}

export function isSlotValue(v: unknown): v is SlotValue {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { __slot?: unknown }).__slot === true &&
    Array.isArray((v as { blocks?: unknown }).blocks)
  );
}

export function makeSlotValue(blocks: PageBlock[] = []): SlotValue {
  return { __slot: true, blocks };
}

const SLOT_REACT_NODE_TYPES = new Set(["ReactNode", "React.ReactNode", "JSX.Element", "React.JSX.Element"]);

// 判斷一個 prop 型別字串是不是可以放子組件的 slot，容許聯集與陣列型別寫法
// （例如 "ReactNode | string"、"ReactNode[]"）。
export function isSlotPropType(type: string): boolean {
  const normalized = type.trim();
  if (SLOT_REACT_NODE_TYPES.has(normalized)) return true;
  const branches = normalized.split("|").map((s) => s.trim());
  if (branches.some((b) => SLOT_REACT_NODE_TYPES.has(b))) return true;
  const withoutArraySuffix = normalized.replace(/\[\]$/, "").trim();
  if (SLOT_REACT_NODE_TYPES.has(withoutArraySuffix)) return true;
  return false;
}

/**
 * Astro island hydration 指令（`client:*` directive）：
 *   - "only"    ：client:only（完全跳過 SSR，只在瀏覽器端渲染）
 *   - "visible" ：client:visible（進入可視範圍才 hydrate）
 *   - "idle"    ：client:idle（瀏覽器 idle 時 hydrate）
 *   - "load"    ：client:load（頁面載入後立即 hydrate）
 *   - "media"   ：client:media（符合指定 media query 時 hydrate）
 * undefined／欄位不存在＝維持靜態（不加任何 client:* 指令），是預設狀態。
 */
export type ClientDirective = "only" | "visible" | "idle" | "load" | "media";

/** 一個被放進頁面內容區的組件實例（組合用）。 */
export interface PageBlock {
  /** 亂數產生的實例 id，用於排序 / 刪除。 */
  instanceId: string;
  /** 對應 components.json 的 ComponentDoc.id，例如 `src/components/landing1/button.tsx#Button`。 */
  componentId: string;
  /** 顯示用的組件名稱（快取一份，方便清單顯示）。 */
  componentName: string;
  /**
   * 此實例的 props 覆寫（只存有設定的欄位，未設定的沿用組件預設值）。
   * 一般 prop 存純值；ReactNode（slot）prop 則存 SlotValue，內含子組件實例陣列。
   */
  props: Record<string, unknown>;
  /**
   * 這個組件實例的 Astro client directive，跟 `props` 刻意分開存放、
   * 不塞進 props 物件裡。undefined＝不加任何 client:* 指令（預設）。
   */
  clientDirective?: ClientDirective;
}

export interface PageItem {
  id: string;
  name: string;
  status: "draft" | "published";
  /** 每頁綁定一筆 SeoData 型別資料（value 即 SEO 內容）。 */
  seo: SeoData;
  /** 頁面內容區的組件組合。預設為空陣列。 */
  blocks: PageBlock[];
  /**
   * 這個頁面套用的樣式表 id 清單（對應 wb.styleSheets 裡 StyleSheet.id）。
   * 只存 id 引用，不複製樣式表內容本身。預設為空陣列。
   */
  styleSheetIds?: string[];
}
```