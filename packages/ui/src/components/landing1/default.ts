import { type BrandProps as BrandProps } from "./brand";
import { type ButtonProps as ButtonProps } from "./button";
import { type ContactCardProps as ContactCardProps } from "./contact-card";
import { type CtaBannerProps as CtaBannerProps } from "./cta-banner";
import { type FooterProps as FooterProps } from "./footer";
import { type HeaderProps as HeaderProps } from "./header";
import { type HeroProps as HeroProps } from "./hero";
import { type LayoutProps as LayoutProps } from "./layout";
import { type PageIntroProps as PageIntroProps } from "./page-intro";
import { type SectionListProps as SectionListProps } from "./section-list";
import { type ThemeToggleProps as ThemeToggleProps } from "./theme-toggle";
import { type ValuePropsProps as ValuePropsProps } from "./value-props";

const brandData = {
  toHome: "/",
  ariaLabel: "OZSV home",
  mark: "OZSV",
  logoSrc: "https://example.com/logo.svg",
  wordmark: {
    lead: "OZ",
    accent: "SV",
  },
}

const primaryNav = [
  { label: "Product", to: "/product" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
]

const themeOptions: Array<{ value: "light" | "dark" | "system"; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

export const brand: BrandProps = {
  data: brandData,
}

export const button: ButtonProps = {
  variant: "primary",
  size: "md",
  children: "Get started",
}

export const contactCard: ContactCardProps = {
  title: "Get in touch",
  intro: "Have a question or a project in mind? We'd love to hear from you.",
  email: "hello@example.com",
  topicsTitle: "What can we help with?",
  topics: ["Sales", "Support", "Partnerships", "Press"],
}

export const ctaBanner: CtaBannerProps = {
  title: "Ready to get started?",
  body: "Reach out and we'll get back to you within one business day.",
  ctaLabel: "Get in touch",
  ctaHref: "mailto:hello@example.com",
}

export const footer: FooterProps = {
  brand: brandData,
  tagline: "Building better software, together.",
  email: "hello@example.com",
  emailAriaLabel: "Email us at hello@example.com",
  columns: [
    {
      title: "Product",
      items: [
        { label: "Features", to: "/features" },
        { label: "Pricing", to: "/pricing" },
      ],
    },
    {
      title: "Company",
      items: [
        { label: "About", to: "/about" },
        { label: "Contact", to: "/contact" },
      ],
    },
  ],
  copyright: "© 2026 OZSV. All rights reserved.",
  meta: "Made in Australia",
}

export const header: HeaderProps = {
  brand: brandData,
  primaryNav,
  themeOptions,
  themeGroupLabel: "Theme",
  themeLabel: "Theme",
  openMenuLabel: "Open menu",
  closeMenuLabel: "Close menu",
}

export const hero: HeroProps = {
  eyebrow: "New: v2.0 is here",
  title: {
    lead: "Build faster with ",
    accent: "OZSV",
  },
  subtitle: "A modern toolkit for shipping polished web experiences.",
  primaryCta: { label: "Get started", to: "/product" },
  secondaryCta: { label: "Learn more", to: "/about" },
}

export const layout: LayoutProps = {
  header,
  footer,
  children: undefined,
}

export const pageIntro: PageIntroProps = {
  title: "About us",
  intro: "We build tools that help teams ship better software, faster.",
  eyebrow: "Updated 1 July 2026",
}

export const sectionList: SectionListProps = {
  sections: [
    { heading: "Our mission", body: "To make building great software accessible to every team." },
    {
      heading: "Our story",
      body: ["Founded in 2024, we started with a simple idea.", "Since then we've grown into a small, focused team."],
    },
  ],
}

export const themeToggle: ThemeToggleProps = {
  groupLabel: "Theme",
  options: themeOptions,
}

export const valueProps: ValuePropsProps = {
  items: [
    { title: "Fast", body: "Ship in minutes, not weeks." },
    { title: "Flexible", body: "Adapts to your workflow, not the other way around." },
    { title: "Reliable", body: "Built on tools you already trust." },
  ],
}