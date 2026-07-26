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
  'components/landing1/brand': () => import('@workspace/ui/components/landing1/brand.tsx'),
  'components/landing1/button': () => import('@workspace/ui/components/landing1/button.tsx'),
  'components/landing1/contact-card': () => import('@workspace/ui/components/landing1/contact-card.tsx'),
  'components/landing1/cta-banner': () => import('@workspace/ui/components/landing1/cta-banner.tsx'),
  'components/landing1/flex': () => import('@workspace/ui/components/landing1/flex.tsx'),
  'components/landing1/footer': () => import('@workspace/ui/components/landing1/footer.tsx'),
  'components/landing1/header': () => import('@workspace/ui/components/landing1/header.tsx'),
  'components/landing1/hero': () => import('@workspace/ui/components/landing1/hero.tsx'),
  'components/landing1/layout': () => import('@workspace/ui/components/landing1/layout.tsx'),
  'components/landing1/page-intro': () => import('@workspace/ui/components/landing1/page-intro.tsx'),
  'components/landing1/section-list': () => import('@workspace/ui/components/landing1/section-list.tsx'),
  'components/landing1/theme-toggle': () => import('@workspace/ui/components/landing1/theme-toggle.tsx'),
  'components/landing1/value-props': () => import('@workspace/ui/components/landing1/value-props.tsx'),
  'components/demo/default': () => import('@workspace/ui/components/demo/default.ts'),
  'components/landing1/default': () => import('@workspace/ui/components/landing1/default.ts'),
  'components/site/default': () => import('@workspace/ui/components/site/default.ts'),
};
