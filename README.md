# Component & Function Docs (trimmed)

這是從原專案抽出的精簡版本，只保留 `docs:generate` 與 `functions:generate` 兩個功能：

- `packages/ui/scripts/generate-docs.mjs` — 掃描 `packages/ui/src/components/demo/*.tsx`，
  產生 `packages/ui/data/components.json`、`packages/ui/data/component-types.json`、
  `packages/ui/src/lib/generator/component-map.ts`。
- `packages/ui/scripts/generate-functions-docs.mjs` — 掃描 `packages/ui/src/functions/**/*.ts`，
  產生 `packages/ui/data/functions.json`、`packages/ui/src/types/generator/function-types.ts`。

## id 規則調整

- `ComponentDoc.id`：改為 `{filePath}#{componentName}`（例如
  `src/components/demo/card.tsx#CardHeader`），避免同一檔案內多個具名匯出
  （例如 `card.tsx` 同時匯出 `Card` 與 `CardHeader`）或不同目錄同名組件互相撞名。
- `ComponentTypeDoc.id`：改為 `{型別宣告所在檔案的 filePath}#{型別名稱}`（例如
  `src/components/demo/types.ts#BrandData`），避免不同檔案定義的同名型別互相覆蓋。

## 已移除的功能

原本 `apps/web-builder` 的頁面編輯、i18n 管理、路由管理、主題產生器、檔案管理、
就地寫回原始碼（write-back）等 UI Builder 功能皆未保留。`apps/web-app` 目前只是
一個可以跑起來的空殼 Vite + React + react-router 專案，掛載了 Components /
Functions 兩個文件瀏覽頁面（首頁列表 + 詳情頁），其餘功能尚未實作。

## 使用方式

```bash
npm install
npm run docs:generate
npm run functions:generate
npm run dev --workspace=web-app
```

> 本次交付未執行 `npm install`、未做型別編譯檢查、未跑測試。
