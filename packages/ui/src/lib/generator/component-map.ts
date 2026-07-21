// 此檔案由 scripts/generate-docs.mjs 自動產生，請勿手動編輯。
// 執行 `npm run docs:generate` 以重新產生。

export type ComponentLoader = () => Promise<Record<string, unknown>>;

export const componentMap: Record<string, ComponentLoader> = {
  'components/demo/avatar': () => import('@workspace/ui/components/demo/avatar.tsx'),
  'components/demo/badge': () => import('@workspace/ui/components/demo/badge.tsx'),
  'components/demo/button': () => import('@workspace/ui/components/demo/button.tsx'),
  'components/ui/button': () => import('@workspace/ui/components/ui/button.tsx'),
  'components/demo/card': () => import('@workspace/ui/components/demo/card.tsx'),
  'components/generator/doc-tree-view': () => import('@workspace/ui/components/generator/doc-tree-view.tsx'),
  'components/generator/function-signature': () => import('@workspace/ui/components/generator/function-signature.tsx'),
  'components/demo/input': () => import('@workspace/ui/components/demo/input.tsx'),
  'components/generator/live-preview': () => import('@workspace/ui/components/generator/live-preview.tsx'),
  'components/generator/nav-filter-input': () => import('@workspace/ui/components/generator/nav-filter-input.tsx'),
  'components/generator/params-table': () => import('@workspace/ui/components/generator/params-table.tsx'),
  'components/generator/props-table': () => import('@workspace/ui/components/generator/props-table.tsx'),
  'components/generator/type-card': () => import('@workspace/ui/components/generator/type-card.tsx'),
  'components/generator/type-pill': () => import('@workspace/ui/components/generator/type-pill.tsx'),
};
