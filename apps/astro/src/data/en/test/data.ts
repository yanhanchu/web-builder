// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/render-page-split-jsx.ts）
// 自動產生，請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：home（首頁） · 分組：data
// 語系：en（resolved 純值，此檔案不含任何 i18n/resolve 邏輯）
// 具名 export 逐一保留（給其他地方單獨引用），額外多一個彙總 default
// export：routes.tsx 一行 import 整包（見 render-routes.ts）。
// ============================================================

import type { ContactCardProps } from "@workspace/ui/components/landing1/contact-card";
import type { CtaBannerProps } from "@workspace/ui/components/landing1/cta-banner";
import type { HeroProps } from "@workspace/ui/components/landing1/hero";
import type { LayoutProps } from "@workspace/ui/components/landing1/layout";

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

export const hero: HeroProps = {
  eyebrow: "New: v2.0 is here",
  title: {
    lead: "Build faster with ",
    accent: "OZSV",
  },
  subtitle: "A modern toolkit for shipping polished web experiences.",
  primaryCta: {
    label: "Get started",
    to: "/product",
  },
  secondaryCta: {
    label: "Learn more",
    to: "/about",
  },
};

export const ctaBanner: CtaBannerProps = {
  title: "Ready to get started?",
  body: "Reach out and we'll get back to you within one business day.",
  ctaLabel: "Get in touch",
  ctaHref: "mailto:hello@example.com",
};

export const contactCard: ContactCardProps = {
  title: "Get in touch",
  intro: "Have a question or a project in mind? We'd love to hear from you.",
  email: "hello@example.com",
  topicsTitle: "What can we help with?",
  topics: [
    "Sales",
    "Support",
    "Partnerships",
    "Press",
  ],
};

export const ctaBanner2: CtaBannerProps = {
  title: "Ready to get started?",
  body: "Reach out and we'll get back to you within one business day.",
  ctaLabel: "Get in touch",
  ctaHref: "mailto:hello@example.com",
};