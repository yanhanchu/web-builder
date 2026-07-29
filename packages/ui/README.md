# @workspace/ui

React UI 元件庫。純粹提供**實際可用的 UI 元件**（`Avatar`, `Badge`,
`Button`, `Card`, `Input`, `components/ui/button.tsx`）給任何 app 拿來
組畫面用。

> 元件/函式**文件產生器**（掃描這裡的 `src/components/**`、輸出
> `components.json` 等 build-time 資料）已經搬到
> [`apps/web-builder/scripts/docs`](../../apps/web-builder/scripts/docs)，
> 不再放在這個套件裡。這個套件本身只是「被掃描的來源」，不擁有產生器
> 邏輯，也不擁有產生出來的資料。詳見下方說明。

## 這個套件提供什麼

| 子模組 | 路徑 | 提供什麼 | 誰在用 |
|---|---|---|---|
| `components/*` | `src/components/**/*.tsx` | 實際 UI 元件（`Avatar`, `Badge`, `Button`, `Card`, `Input` 等） | 任何要組畫面的 app |
| `utils/*` | `src/utils/index.ts` | `cn()` 等共用工具 | 元件內部 + 任何用 Tailwind 的 app |
| `lib/theme` | `src/lib/theme.ts` | 主題相關工具 | 需要深色模式等主題功能的 app |
| `globals.css` | `src/styles/globals.css` | Tailwind base + CSS 變數（顏色、字體） | 每個用到這個套件元件的 app，需自行 import 一次 |

## 文件產生器在哪裡

以下這些，全部都住在 `apps/web-builder`，不在這個套件裡：

| 東西 | 路徑 |
|---|---|
| `docs:generate` / `functions:generate` 腳本 | `apps/web-builder/scripts/docs/generate-docs.mjs`、`generate-functions-docs.mjs` |
| 網站產生器（`.astro` / split-jsx 輸出） | `apps/web-builder/scripts/site-generator/**` |
| 產生出來的文件 JSON | monorepo 根目錄的 `/data/components.json`、`/data/component-types.json`、`/data/functions.json`（跟 `/data/default` 平行，不是站台內容資料，是產生出來的文件資料） |
| 動態 import map / 型別定義 | `apps/web-builder/src/lib/generator/component-map.ts`、`apps/web-builder/src/types/generator/*.ts` |
| 文件頁面 UI（Live Preview 等） | `apps/web-builder/src/components/generator/*`、`apps/web-builder/src/pages/admin/**` |

這兩支腳本仍然是「掃描 `packages/ui/src/components/**`（以及未來的
`src/functions/**`），輸出文件資料」——只是腳本本體、輸出目的地、以及
消費這些資料的程式碼，現在都在 `apps/web-builder`，`packages/ui`
單純只是被掃描的來源套件。

## 怎麼引用

```json
{
  "dependencies": {
    "@workspace/ui": "workspace:*"
  }
}
```
```tsx
import { Button } from '@workspace/ui/components/landing1/button';
import { cn } from '@workspace/ui/utils';
import '@workspace/ui/globals.css'; // 在 app 入口引入一次
```

## 新增 UI 元件

1. 在 `src/components/{group}/{ComponentName}.tsx` 新增元件，
   props 型別記得寫 JSDoc（會被 `apps/web-builder` 的
   `docs:generate` 抽出來當文件說明）
2. 在 `apps/web-builder` 跑 `npm run docs:generate`（或
   `pnpm --filter web-builder run docs:generate`），確認
   monorepo 根目錄的 `/data/components.json` 有正確產生對應項目
3. 若 props 型別參照到專案內定義的 interface / type（例如
   `items: CardItem[]`），`docs:generate` 會額外把 `CardItem` 的詳細欄位
   展開進 `/data/component-types.json`（`ComponentTypeDoc`，含每個欄位完整
   型別字串如 `string[]`、是否必填、JSDoc 說明），並給這個型別一個獨立
   id（`{filePath}#{typeName}`），不同組件參照到同一個型別時會共用同一筆
   `ComponentTypeDoc`，不會重複展開。這份型別資料同時也是
   `apps/web-builder` 的「資料管理（/data）」子功能選型別時的資料來源。
4. 若元件需要暴露新的 import 路徑，到 `package.json` 的 `exports`
   欄位確認 `./components/*` 這類萬用規則能涵蓋到，通常不需要額外新增

## 新增可被文件化的函式

1. 在 `src/functions/{functionName}.ts` 新增純函式（避免 side effect）
2. 在 `apps/web-builder` 跑 `npm run functions:generate`，確認
   `/data/functions.json` 有正確產生對應項目

參考完整用法：
[apps/web-builder/scripts/docs](../../apps/web-builder/scripts/docs)、
[apps/web-builder/package.json](../../apps/web-builder/package.json)
