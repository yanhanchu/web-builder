// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/render-page-split-jsx.ts）
// 自動產生，請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：page_1akvhp（Test） · 分組：data
// 語系：en（resolved 純值，此檔案不含任何 i18n/resolve 邏輯）
// 具名 export 逐一保留（給其他地方單獨引用），額外多一個彙總 default
// export：routes.tsx 一行 import 整包（見 render-routes.ts）。
// ============================================================

import type { ButtonProps } from "@workspace/ui/components/landing1/button";
import type { FlexItemProps, FlexProps } from "@workspace/ui/components/landing1/flex";
import type { LayoutProps } from "@workspace/ui/components/landing1/layout";
import type { PageIntroProps } from "@workspace/ui/components/landing1/page-intro";
import type { ValuePropsProps } from "@workspace/ui/components/landing1/value-props";

export const layout: Omit<LayoutProps, "children"> = {
  header: {
    brand: {
      toHome: "/",
      ariaLabel: "OZSV home",
      mark: "OZSV",
      logoSrc: "https://ozsv.au/_astro/logo.Czr5nQmc.webp",
      wordmark: {
        lead: "OZ",
        accent: "SV",
      },
    },
    primaryNav: [
      {
        label: "Product",
        to: "/product",
      },
      {
        label: "About",
        to: "/about",
      },
      {
        label: "Contact",
        to: "/contact",
      },
    ],
    themeOptions: [
      {
        value: "light",
        label: "Light",
      },
      {
        value: "dark",
        label: "Dark",
      },
      {
        value: "system",
        label: "System",
      },
    ],
    themeGroupLabel: "Theme",
    themeLabel: "Theme",
    openMenuLabel: "Open menu",
    closeMenuLabel: "Close menu",
  },
  footer: {
    brand: {
      toHome: "/",
      ariaLabel: "OZSV home",
      mark: "OZSV",
      logoSrc: "https://ozsv.au/_astro/logo.Czr5nQmc.webp",
      wordmark: {
        lead: "OZ",
        accent: "SV",
      },
    },
    tagline: "Building better software, together.",
    email: "hello@example.com",
    emailAriaLabel: "Email us at hello@example.com",
    columns: [
      {
        title: "Product",
        items: [
          {
            label: "Features",
            to: "/features",
          },
          {
            label: "Pricing",
            to: "/pricing",
          },
        ],
      },
      {
        title: "Company",
        items: [
          {
            label: "About",
            to: "/about",
          },
          {
            label: "Contact",
            to: "/contact",
          },
        ],
      },
    ],
    copyright: "© 2026 OZSV. All rights reserved.",
    meta: "Made in Australia",
  },
};

export const flex: Omit<FlexProps, "children"> = {
  direction: "row",
  justify: "start",
  align: "stretch",
  wrap: "nowrap",
  gap: 12,
  minHeight: 100,
};

export const flexItem: Omit<FlexItemProps, "children"> = {
  grow: 0,
  shrink: 1,
  basis: "auto",
};

export const button: Omit<ButtonProps, "icon"> = {
  variant: "primary",
  size: "md",
  children: "test",
};

export const flexItem2: Omit<FlexItemProps, "children"> = {
  grow: 0,
  shrink: 1,
  basis: "auto",
};

export const button2: Omit<ButtonProps, "icon"> = {
  variant: "primary",
  size: "md",
  children: 999,
};

export const pageIntro: PageIntroProps = {
  title: "About us",
  intro: "We build tools that help teams ship better software, faster.",
  eyebrow: "Updated 1 July 2026",
};

export const valueProps: ValuePropsProps = {
  items: [
    {
      title: "Fast",
      body: "Ship in minutes, not weeks.",
    },
    {
      title: "Flexible",
      body: "Adapts to your workflow, not the other way around.",
    },
    {
      title: "Reliable",
      body: "Built on tools you already trust.",
    },
  ],
};