# AI 協作指南：組件與資料

> 這份 zip 只包含兩個可編輯的目錄：`packages/ui/**`（組件）與 `data/**`（網站內容資料）。
> 沒有其他目錄（例如管理後台或產生出的網站），所以不用判斷「這個檔案能不能碰」——
> 你看到的檔案都在範圍內。

## 資料流（心智模型）

```
packages/ui/src/components/<group>/*.tsx  ← 你寫組件 + JSDoc + default.ts
              │
              ▼
data/components.json          ← 每個組件的 props 表格
data/component-types.json     ← props 用到的具名 type/interface 完整展開
              │
              ▼
data/<workspace>/sources/*.json   ← 值從哪裡來：i18n / file / route / typedData
data/<workspace>/pages/*.json     ← 頁面用了哪些組件、順序、props 綁定
data/<workspace>/locales.json
data/<workspace>/style-sheets.json
```

`<workspace>` 目前是 `default`（可能有多份，結構相同）。

**核心分離原則**：
- 組件是純 UI，不含「值從哪裡來」的邏輯。
- 頁面資料只描述「用了哪些組件、順序、slot 巢狀關係」。
- 內容資料（i18n/file/route/typedData）只描述「值本身」。

---

## 1. 新增/修改一個組件

### 檔案結構（一個「群組」= 一個資料夾）

```
packages/ui/src/components/<group>/
  types.ts        群組共用型別（NavItem、BrandData…），非必要不重複定義
  <component>.tsx 單一組件：interface XxxProps + export function Xxx(...)
  default.ts      群組內每個組件的一份 demo/預設 props
```

現有群組：`landing1`（頁面型組件）、`site`（純資料型 SEO/SiteInfo，無渲染邏輯）。

### 核心原則：同一份 props 要能被自由抽換

組件要能被塞進不同 workspace / locale / 頁面，只要換一份 props，畫面內容（文字、圖片、連結……）就該完全跟著換，不能有任何「這個組件自己內部知道的值」卡在裡面。判斷準則就這一句：

> **會決定畫面顯示什麼內容的值，一定要來自 props；不會決定顯示內容的行為，組件可以自由做。**

- **一定要來自 props**：文案、圖片/檔案來源、連結目標、任何「換一個 workspace/locale 結果就該不一樣」的內容。不要在組件內部寫死字串，也不要用 fetch/localStorage 之類的方式繞過 props 去決定這些內容。
- **組件可以自由使用**：`useState`、`useEffect`、`fetch`、寫 localStorage/cookie 等——只要它們做的是「使用者互動觸發的行為」（送出表單、呼叫 API、記錄選單開關/主題等 UI 狀態），而不是「決定這個組件要顯示什麼內容」。例如表單送出時 `fetch` 一個 API 完全沒問題；但如果是「组件自己 fetch 一段文案來顯示」，那段文案就該是 props，不該用 fetch 取得。
- 一個簡單自測：把這個組件塞進兩個不同 workspace（不同 props），畫面該顯示的內容是否也跟著正確替換？如果某段內容不管 props 給什麼都不會變（因為是組件內部寫死或自己取得的），這就是問題。

### 撰寫規則（會被生成器解析）

1. 每個組件一個具名 export 函式 + 一個同名/`XxxProps` 具名 export interface：

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

2. **每個欄位都要寫 `/** ... */` 單行 JSDoc**，會原封不動變成 `components.json` 該 prop 的 `description`。沒寫就是空字串。

3. 型別怎麼寫決定會不會展開進 `component-types.json`：
   - 具名 `interface`，或底層是物件字面量的 `type`（如 `type Wordmark = { lead: string; accent: string }`）→ 收進 `component-types.json`，id 是 `{檔案路徑}#{型別名稱}`。
   - 純 union/primitive 別名（如 `type FlexAlign = "start" | "center"`）→ 不收進去，直接內聯進 `components.json` 該 prop 的 `type` 字串。
   - 陣列 `Foo[]` 對應型別 id 慣例是單數 `Foo`；typedData 表示「一整組」時用 `Foo[]` 當 `typeId`。

4. 可選欄位用 `?:`。生成器輸出的 `required` 布林值照這個判斷。

5. 共用型別放 `types.ts`，不要在每個 `.tsx` 各自重複宣告——同一概念名稱不同會導致資料綁不進去。

6. **`ReactNode` 型別的欄位＝這個 prop 是「slot」**（判斷式：字串是 `ReactNode` / `React.ReactNode` / `JSX.Element`，含陣列、含 union 分支）。slot 欄位在頁面資料裡存法跟一般欄位不同（見 2.3）。不要把「應該是一組子組件」的欄位寫成 `string[]` 之類的純值。

### `default.ts` 怎麼寫

對每個組件的 `XxxProps` 匯出一個同名（camelCase）常數，型別標 `XxxProps`：

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

- 必填欄位一定要給值；可選欄位視情況。
- 有 slot 的組件（例如 `Layout`），`children` 給 `undefined` 即可。
- 群組共用資料（`brandData`、`primaryNav`……）在檔案頂部各自宣告一次，多個組件互相引用，避免內容重複又不同步。

### 新增組件檢查清單

- [ ] 檔案放對群組資料夾，檔名 kebab-case
- [ ] `export interface XxxProps` + `export function Xxx`
- [ ] 每個欄位都有 `/** ... */` 說明
- [ ] 共用型別複用 `types.ts`
- [ ] slot 型欄位用 `ReactNode`
- [ ] 畫面顯示的內容（文案/圖片/連結）都來自 props，沒有寫死或組件自己 fetch 取得
- [ ] `default.ts` 補上這個組件的預設值

---

## 2. 新增/修改資料（`data/` 目錄）

### 目錄結構

```
data/<workspace>/
  locales.json                 ["zh-TW", "en"]
  style-sheets.json            [{ id, name, cssFile }]  ← 只存指標
  style-sheets/<id>.css        實際 CSS 內容，一份樣式表一個檔案
  sources/
    i18n.<locale>.json         單一語系，key 攤平成點分字串 -> 值
    route.json                 路由表
    file.json                  已上傳/引用的檔案
    typedData.json             具名型別資料（可綁定 i18n/file/巢狀 typedData）
  pages/<pageId>.json          單一頁面：seo + blocks 樹
```

### 2.1 `sources/` 四種資料來源

**i18n：`sources/i18n.<locale>.json`**

```json
{ "brand.ariaLabel": "OZSV home", "nav.product": "Product", "nubmer1": 100 }
```
- 檔名決定 locale（`i18n.zh-TW.json` → `"zh-TW"`）。
- key 是點分字串，值可以是 string/number/boolean。還原後的 id 是 `i18n:<key>`。

> **預設語系是 `en`，只新增/修改 `sources/i18n.en.json`。**
> - 新增/調整 key 時一定要補上 `i18n.en.json` 對應項目。
> - **不要動其他語系檔案**（如 `i18n.zh-TW.json`）——文案在地化由使用者自己調整。
> - en 新增了、其他語系還沒對應是預期中的暫時缺漏，不用主動補上或警告。

**route：`sources/route.json`**

```json
{
  "route1": { "label": "route1", "target": "page", "value": "/test", "noindex": false, "pageId": "home" },
  "route2": { "label": "route2", "target": "url", "value": "https://example.com", "noindex": false }
}
```
- key 是路由 id，還原後是 `route:route1`。
- `target: "page"`：`pageId` 對應 `pages/{pageId}.json`，`value` 是預設語系下路徑（非預設語系會自動加 `/<locale>` 前綴）。
- `target: "url"`：外部連結，`value` 是完整 URL，不加語系前綴，不需要 `pageId`。
- 這份檔案是輸出路徑的權威來源：`published` 頁面若找不到對應 route，會退回 `/<pageId>` 並產生警告——新增頁面記得補一筆路由。

**file：`sources/file.json`**

```json
{
  "logo-main": {
    "label": "檔案: 主要 Logo", "url": "http://localhost:5173/uploads/default/xxx.webp",
    "mimeType": "image/webp", "size": 294486, "uploadedAt": "2026-07-27T02:31:16.056Z",
    "caption": "test", "fileName": "xxx.webp"
  }
}
```
- key 是檔案 id，還原後是 `file:<key>`。只有 `url` 必要，其餘可選。
- 引用一張已存在網路上的圖時，可以只給 `label` + `url`，不用假造 `uploadedAt`/`size`。

**typedData：`sources/typedData.json`**

用來表示「某個具名 interface/type 的一整包結構化資料」，每個欄位可各自綁定到 i18n/file/另一筆 typedData。

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
- key（如 `brand:main`）還原後是 `typedData:<key>`。
- `typeId`：單一物件型別用 `component-types.json` 裡的型別 id；「一整組」（陣列）在型別 id 後加 `[]`。
- `value` 是遞迴的 **ValueNode**，四種 `mode`：

| mode | 形狀 | 意義 |
|---|---|---|
| `literal` | `{ mode: "literal", value: string\|number\|boolean\|null }` | 寫死的值 |
| `bound` | `{ mode: "bound", sourceId: "i18n:xxx"\|"file:xxx"\|"typedData:xxx", path?: string[] }` | 引用另一筆資料來源；`path` 可選，挖一層欄位 |
| `object` | `{ mode: "object", fields: { key: ValueNode, ... } }` | 對應具名型別/巢狀物件每個欄位 |
| `array` | `{ mode: "array", items: ValueNode[] }` | 對應陣列型別 |

- `value` 結構必須跟 `typeId` 對應型別的欄位結構一致——`object` 節點的 `fields` key 要對得上 interface 欄位名稱，不能用一個 `bound` 打包整個物件（除非那個 bound 目標本身剛好就是同型別的另一筆 typedData）。
- 綁定可以任意深、互相引用，但不要造成循環引用。

### 2.2 `style-sheets.json` + `style-sheets/<id>.css`

```json
[
  { "id": "global", "name": "全域樣式", "cssFile": "style-sheets/global.css" },
  { "id": "css_j4i11o", "name": "Test", "cssFile": "style-sheets/css_j4i11o.css" }
]
```

- `style-sheets.json` 只存指標，實際 CSS 各自放 `style-sheets/<id>.css`，用正常 CSS 語法（不要塞進 JSON 字串裡跳脫）。
- 新增樣式表：在 `style-sheets/` 新增 `<id>.css`，再到 `style-sheets.json` 補一筆 `{ id, name, cssFile }`。
- 修改既有樣式表：直接編輯對應 `.css` 檔案，`style-sheets.json` 不用動（除非要改 `name`/`id`）。
- 頁面資料的 `styleSheetIds` 只存這裡的 `id` 引用，不複製 CSS 內容。

### 2.3 `pages/<pageId>.json` 頁面資料

```json
{
  "id": "home",
  "name": "首頁",
  "status": "published",
  "seo": {
    "title": "首頁", "titleTemplate": "%s | Web Builder", "description": "網站首頁",
    "keywords": "web, builder, cms", "ogImage": "/og-image.png", "ogType": "website",
    "twitterCard": "summary_large_image", "twitterSite": "@webbuilder",
    "canonicalUrl": "", "robots": "index, follow"
  },
  "styleSheetIds": ["global"],
  "blocks": [
    {
      "instanceId": "blk_wyfojbu0",
      "componentId": "src/components/landing1/layout.tsx#Layout",
      "componentName": "Layout",
      "props": {
        "header": { "brand": "...", "primaryNav": "..." },
        "footer": "...",
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
- 檔名＝`id`（`home.json` 的 `id` 是 `"home"`）。
- `status`：只有 `"published"` 會被生成器輸出成實際頁面；`"draft"` 會被略過。
- `seo` 是純值（不是 ValueNode）——每頁各自寫死，不透過綁定機制。
- `blocks` 是組件實例樹，每個節點：
  - `instanceId`：唯一亂數 id，慣例前綴 `blk_`。
  - `componentId`：必須完全等於 `data/components.json` 裡該組件的 `id`（`{檔案路徑}#{組件名稱}`）。
  - `componentName`：純顯示用途。
  - `props`：只放「這個實例要覆寫的欄位」，沒放的沿用組件 `default.ts` 值。
- top-level 每個 prop 各自決定要不要綁定：
  - 一般值：直接寫純值（string/number/boolean/plain object/array）。
  - 要綁定：整個 prop 換成 ValueNode，且要逐欄位展開對齊該 prop 的型別（不能只給 `{ mode: "bound", sourceId: "typedData:xxx" }`，除非那筆 typedData 剛好整包就是該 prop 型別）。
  - **絕大多數情況直接寫純值就夠了**，只有真的需要跟全站共用資料連動時才用 ValueNode。
- slot 型欄位（prop 型別是 `ReactNode`）一律寫成 `{ "__slot": true, "blocks": [ /* 巢狀 PageBlock[] */ ] }`，可無限巢狀。
- `clientDirective`（可選，跟 `props` 平行，不要塞進 `props`）：決定這個組件實例要不要 hydrate。未設定＝純靜態（預設、零 JS）。值：`"only" | "visible" | "idle" | "load" | "media"`。純展示組件不需要；有 `useState`/`onClick` 等互動邏輯的組件（如 `ThemeToggle`）才需考慮。

### 2.4 新增/修改資料檢查清單

- [ ] 內容文字放 `i18n.en.json`（預設語系），**不要動其他語系檔案**
- [ ] 圖片/檔案放 `file.json`，只填實際知道的欄位
- [ ] 新頁面記得在 `route.json` 補一筆路由，否則退回 `/<pageId>`
- [ ] 新頁面 `id`、檔名、`route.json` 的 `pageId` 三者一致
- [ ] `blocks[].componentId` 完全對應 `data/components.json` 的 `id`
- [ ] slot 型 prop 用 `{ "__slot": true, "blocks": [...] }` 包，不是純陣列
- [ ] 需要綁定的 prop 才寫 ValueNode，其餘直接寫純值
- [ ] 沒特別需要 hydrate 的組件不要加 `clientDirective`
- [ ] CSS 內容改在 `style-sheets/<id>.css`，不要塞回 `style-sheets.json`

---

## 附錄 A：`components.json` 單筆真實範例

```json
{
  "id": "src/components/landing1/brand.tsx#Brand",
  "componentName": "Brand",
  "filePath": "src/components/landing1/brand.tsx",
  "importPath": "components/landing1/brand",
  "description": "Site logo + wordmark, linking back to the homepage.\nPure presentation — all strings and the logo image come from `data`.",
  "props": [
    { "name": "data", "required": true, "type": "BrandData", "defaultValue": null, "description": "Brand strings and logo image, fully i18n-ready" },
    { "name": "className", "required": false, "type": "string", "defaultValue": null, "description": "Additional class names merged onto the root anchor" }
  ],
  "relatedTypeNames": [
    "src/components/landing1/brand.tsx#BrandProps",
    "src/components/landing1/types.ts#BrandData"
  ]
}
```

## 附錄 B：`component-types.json` 單筆真實範例

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
| 新增一個組件 | `packages/ui/src/components/<group>/<n>.tsx` + 更新該群組 `default.ts` |
| 新增組件共用的資料形狀 | `packages/ui/src/components/<group>/types.ts` |
| 改一段網站文字 | `data/<workspace>/sources/i18n.en.json`（其他語系不要動） |
| 換一張圖片 | `data/<workspace>/sources/file.json` |
| 新增一個網址路由 | `data/<workspace>/sources/route.json` |
| 新增「全站共用」的結構化資料（品牌、導覽列…） | `data/<workspace>/sources/typedData.json` |
| 改網站的全域/自訂樣式 | `data/<workspace>/style-sheets/<id>.css`（內容），`style-sheets.json`（指標，通常不用動） |
| 新增一個頁面 | `data/<workspace>/pages/<id>.json` + `route.json` 補路由 |
| 頁面裡新增/調整組件組合、順序、巢狀 slot | 對應 `pages/<id>.json` 的 `blocks` |
| 讓某個組件在輸出時可互動 | 該 block 的 `clientDirective` 欄位 |

## 附錄 D：型別參考（`ValueNode` / `DataSource` / `PageBlock` / `PageItem`）

> 第 2 節提到的 JSON 格式（`ValueNode`、`bound`/`literal`/`object`/`array`、`__slot`……）
> 就是照這裡的型別定義走的。查格式看這裡就好。

```ts
export type PrimitiveType = "string" | "number" | "boolean" | "date";

export type ValueNode = LiteralNode | BoundNode | ArrayNode | ObjectNode;

export interface LiteralNode { mode: "literal"; value: string | number | boolean | null; }
export interface BoundNode { mode: "bound"; sourceId: string; path?: string[]; }
export interface ArrayNode { mode: "array"; items: ValueNode[]; }
export interface ObjectNode { mode: "object"; fields: Record<string, ValueNode>; }

export type DataSourceKind = "i18n" | "file" | "typedData" | "route";

export interface DataSourceMetaBase {
  id: string;
  kind: DataSourceKind;
  label?: string;
}

// i18n 是「基本型別的容器」：一筆資料可以是 string/number/boolean，
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
}

// target === "page"：連到站內某頁；target === "url"：外部/絕對網址
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
  // 對應某個具名型別的複合 id；陣列型資料（如「一整組導覽連結」）用 "<typeId>[]"
  typeId: string;
  value: ValueNode;
}

export type DataSource = I18nDataSource | FileDataSource | RouteDataSource | TypedDataSource;

/** 放進某個 ReactNode（slot）prop 裡的值：一組子組件實例，順序即渲染順序。 */
export interface SlotValue {
  __slot: true;
  blocks: PageBlock[];
}

/** Astro island hydration 指令。undefined＝維持靜態（預設）。 */
export type ClientDirective = "only" | "visible" | "idle" | "load" | "media";

/** 一個被放進頁面內容區的組件實例（組合用）。 */
export interface PageBlock {
  instanceId: string;      // 亂數 id，慣例前綴 blk_
  componentId: string;     // 對應 components.json 的 id
  componentName: string;   // 顯示用途
  props: Record<string, unknown>; // 只存有覆寫的欄位；slot prop 存 SlotValue
  clientDirective?: ClientDirective; // 跟 props 平行存放
}

export interface PageItem {
  id: string;
  name: string;
  status: "draft" | "published";
  seo: SeoData;              // 純值，每頁各自寫死
  blocks: PageBlock[];
  styleSheetIds?: string[];  // 只存 id 引用
}
```