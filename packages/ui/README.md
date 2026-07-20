# @workspace/ui

React UI 元件 + 一套「元件 / 函式自動文件產生器」。跟其他兩個
package（`browser`、`server`）不同，這裡**同時有兩種東西混在一起**，用途
不太一樣，引用時要分清楚：

1. **實際可用的 UI 元件**（`Avatar`, `Badge`, `Button`, `Card`,
   `Input`, `components/ui/button.tsx`）— 給任何 app 拿來組畫面用
2. **文件產生器本身的元件/頁面/工具**（`components/generator/*`,
   `pages/generator/*`, `lib/generator/*`, `styles/generator/*`,
   `types/generator/*`）— 只給「想要顯示元件文件頁面」的 app 用
   （目前是 `apps/web-builder`），一般 app **不需要**引用這些

## 這個套件提供什麼

| 子模組 | 路徑 | 提供什麼 | 誰在用 |
|---|---|---|---|
| `components/*` | `src/components/**/*.tsx` | 實際 UI 元件（`Avatar`, `Badge`, `Button`, `Card`, `Input` 等） | 任何要組畫面的 app |
| `utils/*` | `src/utils/utils.ts` | `cn()` 等共用工具 | 元件內部 + 任何用 Tailwind 的 app |
| `hooks/*` | `src/hooks/theme-provider.tsx` | 主題 provider | 需要深色模式等主題功能的 app |
| `globals.css` | `src/styles/globals.css` | Tailwind base + CSS 變數（顏色、字體） | 每個用到這個套件元件的 app，需自行 import 一次 |
| `functions/*` | `src/functions/*.ts` | 純函式範例（`calculateOrderTotal` 等），用來展示「函式文件」產生器的效果 | `apps/web-builder` 的函式文件頁 |
| `pages/generator/*`、`components/generator/*`、`lib/generator/*`、`styles/generator/*`、`types/generator/*` | `src/**/generator/**` | 元件/函式文件產生器本身（掃描 `.tsx`/`.ts`、產生 `data/*.json`、渲染文件頁面、就地編輯寫回原始碼） | 只有 `apps/web-builder` 用它來長出 `/components`、`/functions` 這類文件頁 |
| `docs:generate` / `functions:generate` script | `scripts/generate-docs.mjs` / `scripts/generate-functions-docs.mjs` | 掃描 `src/components/**` / `src/functions/**`，產生 `data/components.json` / `data/functions.json` + `src/lib/generator/component-map.ts` | build/dev 前置作業，見下方 |
| `write-back-plugin` | `scripts/write-back-plugin.mjs` | Vite plugin：文件頁面上「就地編輯 props/JSDoc 說明」直接寫回原始碼的 dev-only API | 掛在使用這個套件文件功能的 app 的 `vite.config.ts` |

## 怎麼引用

只想用 UI 元件的 app（**不需要**文件產生器功能）：
```json
{
  "dependencies": {
    "@workspace/ui": "workspace:*"
  }
}
```
```tsx
import { Button } from '@workspace/ui/components/Button/Button';
import { cn } from '@workspace/ui/utils/utils';
import '@workspace/ui/globals.css'; // 在 app 入口引入一次
```

想要「元件文件頁面」功能（像 `apps/web-builder` 的 `/components`、
`/functions` 頁面）的 app，除了上面的引用方式，還要：

1. `package.json` 的 `predev` / `prebuild` 加上：
   ```json
   "predev": "pnpm --filter @workspace/ui run docs:generate && pnpm --filter @workspace/ui run functions:generate"
   ```
2. `vite.config.ts` 掛上 `writeBackPlugin()`（來自
   `packages/ui/scripts/write-back-plugin.mjs`）
3. 自己的頁面 import `@workspace/ui/pages/generator/*`、
   `@workspace/ui/lib/generator/*` 等 generator 子模組

參考完整用法：
[apps/web-builder/vite.config.ts](../../apps/web-builder/vite.config.ts)、
[apps/web-builder/src/pages/](../../apps/web-builder/src/pages/)

## 新增 UI 元件

1. 在 `src/components/{ComponentName}/{ComponentName}.tsx` 新增元件，
   props 型別記得寫 JSDoc（會被 `docs:generate` 抽出來當文件說明）
2. 在自己套件根目錄跑 `pnpm --filter @workspace/ui run docs:generate`，
   確認 `data/components.json` 有正確產生對應項目
3. 若元件需要暴露新的 import 路徑，到 `package.json` 的 `exports`
   欄位確認 `./components/*` 這類萬用規則能涵蓋到，通常不需要額外新增

## 新增可被文件化的函式

1. 在 `src/functions/{functionName}.ts` 新增純函式（避免 side effect，
   方便 `live-preview.tsx` 之類的功能展示）
2. 跑 `pnpm --filter @workspace/ui run functions:generate`
