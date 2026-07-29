# astro

Vite（Astro 內建）+ Astro + React + TypeScript 的簡單起始專案，已接上 monorepo 的 `@workspace/ui`。

## 開發

```bash
pnpm --filter astro dev
```

## 建置

```bash
pnpm --filter astro build
```

## React 支援

已透過 `@astrojs/react` integration 啟用 React，範例見 `src/components/ReactCounter.tsx`，
在 `.astro` 頁面中以 `client:load` 等 client directive 掛載為 island。

## @workspace/ui

`astro.config.mjs` 的 `vite.resolve.alias` 與 `tsconfig.json` 的 `paths` 都已指到
`../../packages/ui/src`，可直接引用：

```ts
import { cn } from "@workspace/ui/utils";
import { Button } from "@workspace/ui/components/landing1/button";
```

全域樣式（Tailwind v4 + `@workspace/ui` 的 `globals.css`）已在 `src/styles/global.css`
中匯入，並由 `Layout.astro` 載入。

Astro 本身就是以 Vite 為底層建置工具，`astro.config.mjs` 可透過 `vite` 欄位擴充原生
Vite 設定（alias、plugins 等）。
