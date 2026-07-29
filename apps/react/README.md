# react

Vite + React + TypeScript + Tailwind CSS v4 的簡單起始專案，已接上 monorepo 的 `@workspace/ui`。

## 開發

```bash
pnpm --filter react dev
```

## 建置

```bash
pnpm --filter react build
```

## @workspace/ui

`vite.config.ts` 的 `resolve.alias` 與 `tsconfig.app.json` 的 `paths` 都已指到
`../../packages/ui/src`，可直接引用：

```ts
import { cn } from "@workspace/ui/utils";
import { Button } from "@workspace/ui/components/demo/button";
```

全域樣式（Tailwind v4 + `@workspace/ui` 的 `globals.css`）已在 `src/index.css` 中匯入。
