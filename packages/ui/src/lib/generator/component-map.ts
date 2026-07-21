// 此檔案由 scripts/generate-docs.mjs 自動產生，請勿手動編輯。
// 執行 `npm run docs:generate` 以重新產生。

export type ComponentLoader = () => Promise<Record<string, unknown>>;

export const componentMap: Record<string, ComponentLoader> = {
  'components/ozsv/brand': () => import('@workspace/ui/components/ozsv/brand.tsx'),
  'components/ozsv/button': () => import('@workspace/ui/components/ozsv/button.tsx'),
  'components/ozsv/contact-card': () => import('@workspace/ui/components/ozsv/contact-card.tsx'),
  'components/ozsv/cta-banner': () => import('@workspace/ui/components/ozsv/cta-banner.tsx'),
  'components/ozsv/footer': () => import('@workspace/ui/components/ozsv/footer.tsx'),
  'components/ozsv/header': () => import('@workspace/ui/components/ozsv/header.tsx'),
  'components/ozsv/hero': () => import('@workspace/ui/components/ozsv/hero.tsx'),
  'components/ozsv/page-intro': () => import('@workspace/ui/components/ozsv/page-intro.tsx'),
  'components/ozsv/section-list': () => import('@workspace/ui/components/ozsv/section-list.tsx'),
  'components/ozsv/site-shell': () => import('@workspace/ui/components/ozsv/site-shell.tsx'),
  'components/ozsv/value-props': () => import('@workspace/ui/components/ozsv/value-props.tsx'),
};
