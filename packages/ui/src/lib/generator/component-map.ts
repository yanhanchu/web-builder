// 此檔案由 scripts/generate-docs.mjs 自動產生，請勿手動編輯。
// 執行 `npm run docs:generate` 以重新產生。

export type ComponentLoader = () => Promise<Record<string, unknown>>;

export const componentMap: Record<string, ComponentLoader> = {
  'components/demo/avatar': () => import('@workspace/ui/components/demo/avatar.tsx'),
  'components/demo/badge': () => import('@workspace/ui/components/demo/badge.tsx'),
  'components/demo/brand': () => import('@workspace/ui/components/demo/brand.tsx'),
  'components/demo/button': () => import('@workspace/ui/components/demo/button.tsx'),
  'components/demo/card': () => import('@workspace/ui/components/demo/card.tsx'),
  'components/demo/header': () => import('@workspace/ui/components/demo/header.tsx'),
  'components/demo/input': () => import('@workspace/ui/components/demo/input.tsx'),
};
