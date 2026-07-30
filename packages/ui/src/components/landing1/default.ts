import { type BrandProps as BrandProps } from "./brand";
import { type ButtonProps as ButtonProps } from "./button";
import { type CommandListProps as CommandListProps } from "./command-list";
import { type ContactCardProps as ContactCardProps } from "./contact-card";
import { type ContactFormProps as ContactFormProps } from "./contact-form";
import { type CookieConsentProps as CookieConsentProps } from "./cookie-consent";
import { type CopyButtonProps as CopyButtonProps } from "./copy-button";
import { type CoreValueSectionProps as CoreValueSectionProps } from "./core-value-section";
import { type CtaBannerProps as CtaBannerProps } from "./cta-banner";
import { type FaqSectionProps as FaqSectionProps } from "./faq-section";
import { type FeatureGridProps as FeatureGridProps } from "./feature-grid";
import { type FlexProps as FlexProps, type FlexItemProps as FlexItemProps } from "./flex";
import { type FooterProps as FooterProps } from "./footer";
import { type HeaderProps as HeaderProps } from "./header";
import { type HeroProps as HeroProps } from "./hero";
import { type LayoutProps as LayoutProps } from "./layout";
import { type OutlineTemplateGridProps as OutlineTemplateGridProps } from "./outline-template-grid";
import { type PageIntroProps as PageIntroProps } from "./page-intro";
import { type ProductClosingProps as ProductClosingProps } from "./product-closing";
import { type ProductFaqProps as ProductFaqProps } from "./product-faq";
import { type ProductHeroProps as ProductHeroProps } from "./product-hero";
import { type ProductUseCasesProps as ProductUseCasesProps } from "./product-use-cases";
import { type QuickStartStepsProps as QuickStartStepsProps } from "./quick-start-steps";
import { type RelatedNavProps as RelatedNavProps } from "./related-nav";
import { type ResourcePageClosingProps as ResourcePageClosingProps } from "./resource-page-closing";
import { type ResourcePageHeroProps as ResourcePageHeroProps } from "./resource-page-hero";
import { type SectionListProps as SectionListProps } from "./section-list";
import { type ShortcutTableProps as ShortcutTableProps } from "./shortcut-table";
import { type ShowcaseSectionProps as ShowcaseSectionProps } from "./showcase-section";
import { type ThemeToggleProps as ThemeToggleProps } from "./theme-toggle";
import { type TrustSectionProps as TrustSectionProps } from "./trust-section";
import { type UseCaseGroupsProps as UseCaseGroupsProps } from "./use-case-groups";
import { type ValuePropsProps as ValuePropsProps } from "./value-props";


const brandData = {
  toHome: "/",
  ariaLabel: "OZSV home",
  mark: "OZSV",
  logoSrc: "https://ozsv.au/_astro/logo.Czr5nQmc.webp",
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

export const commandList: CommandListProps = {
  title: "Quick commands",
  description:
    "Type your configured trigger key at the start of a line to open the quick command menu, then choose one of the following.",
  commands: [
    { command: "/table", body: "Insert a table node" },
    { command: "/image", body: "Insert an image node" },
    { command: "/link", body: "Insert a link node" },
  ],
}

export const contactCard: ContactCardProps = {
  title: "Get in touch",
  intro: "Have a question or a project in mind? We'd love to hear from you.",
  email: "hello@example.com",
  topicsTitle: "What can we help with?",
  topics: ["Sales", "Support", "Partnerships", "Press"],
}

export const contactForm: ContactFormProps = {
  title: "Get in touch",
  intro: "Have a question or a project in mind? We'd love to hear from you.",
  email: "hello@example.com",
  topicsTitle: "What can we help with?",
  topics: ["Sales", "Support", "Partnerships", "Press"],
  namePlaceholder: "Your name",
  emailPlaceholder: "Your email",
  messagePlaceholder: "How can we help?",
  submitLabel: "Send message",
  submitPendingLabel: "Sending…",
  successMessage: "Thanks — your message has been sent. We'll get back to you soon.",
  genericErrorMessage: "Something went wrong.",
  errorFallbackPrefix: "You can also reach us directly at",
  apiKey: "",
  submitSubject: "New message from Get in touch",
  endpoint: "https://api.staticforms.dev/submit",
}

export const cookieConsent: CookieConsentProps = {
  storageKey: "app:cookie-consent",
  title: "We respect your privacy",
  description:
    "We use strictly necessary cookies to make this site work. With your permission we'd also like to use anonymous analytics to understand how it's used. You can change your choice at any time. See our",
  privacyLinkLabel: "Privacy Policy",
  privacyLinkHref: "/privacy",
  necessaryLabel: "Strictly necessary",
  necessaryDescription: "— required for the site to function. Always on.",
  analyticsLabel: "Anonymous analytics",
  analyticsDescription: "— helps us understand which pages are useful.",
  acceptAllLabel: "Accept all",
  rejectLabel: "Reject non-essential",
  customiseLabel: "Customise",
  saveLabel: "Save choices",
  dismissAriaLabel: "Dismiss and reject non-essential cookies",
}

export const copyButton: CopyButtonProps = {
  value: "Sample text to copy",
  label: "Copy outline",
  copiedLabel: "Copied",
}

export const coreValueSection: CoreValueSectionProps = {
  title: "One idea, many ways to see it",
  body: "Write in plain text and get a live, navigable mind map — no drag-and-drop setup required.",
}

export const ctaBanner: CtaBannerProps = {
  title: "Ready to get started?",
  body: "Reach out and we'll get back to you within one business day.",
  ctaLabel: "Get in touch",
  ctaHref: "mailto:hello@example.com",
}

export const faqSection: FaqSectionProps = {
  title: "Frequently asked questions",
  items: [
    { question: "Is there a free plan?", answer: "Yes, the core editor is free to use." },
    { question: "Can I export my mind map?", answer: "Yes, export to PNG, SVG or Markdown." },
  ],
}

export const featureGrid: FeatureGridProps = {
  title: "Everything you need",
  subtitle: "A focused toolkit for turning text into a navigable mind map.",
  items: [
    { title: "Keyboard-first", body: "Write and navigate without touching the mouse.", icon: "Keyboard" },
    { title: "Plain text in", body: "Paste an outline and get a map instantly.", icon: "FileText" },
    { title: "Multiple layouts", body: "Switch between tree, radial and org-chart views.", icon: "LayoutGrid" },
  ],
}

export const flex: FlexProps = {
  direction: "row",
  justify: "start",
  align: "stretch",
  wrap: "nowrap",
  gap: 12,
  minHeight: 160,
  children: undefined,
}

export const flexItem: FlexItemProps = {
  grow: 0,
  shrink: 1,
  basis: "auto",
  children: "1",
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
  header: undefined,
  footer: undefined,
  children: undefined,
}

export const outlineTemplateGrid: OutlineTemplateGridProps = {
  templates: [
    {
      slug: "project-plan",
      emoji: "🗂️",
      title: "Project plan",
      summary: "Break a project into phases, tasks and owners.",
      bestFor: "Teams kicking off a new project",
      outline: "Project\n  Phase 1\n    Task A\n    Task B\n  Phase 2\n    Task C",
    },
    {
      slug: "meeting-notes",
      emoji: "📝",
      title: "Meeting notes",
      summary: "Capture decisions and follow-ups from a meeting.",
      bestFor: "Anyone running recurring meetings",
      outline: "Meeting\n  Attendees\n  Decisions\n  Action items",
    },
  ],
  bestForLabel: "Best for:",
  copyLabel: "Copy outline",
  copiedLabel: "Copied",
  pasteHint: "then paste it into the editor",
}

export const pageIntro: PageIntroProps = {
  title: "About us",
  intro: "We build tools that help teams ship better software, faster.",
  eyebrow: "Updated 1 July 2026",
}

export const productClosing: ProductClosingProps = {
  title: "Ready to map your next idea?",
  body: "Start free — no account required to try the editor.",
  primaryCtaLabel: "Open the app",
  primaryCtaHref: "/app",
  secondaryCtaLabel: "Contact us",
  secondaryCtaHref: "/contact",
}

export const productFaq: ProductFaqProps = {
  title: "Frequently asked questions",
  items: [
    { question: "Is there a free plan?", answer: "Yes, the core editor is free to use." },
    { question: "Can I export my mind map?", answer: "Yes, export to PNG, SVG or Markdown." },
  ],
}

export const productHero: ProductHeroProps = {
  eyebrow: "New: v2.0 is here",
  title: { lead: "Turn text into a ", accent: "mind map" },
  subtitle: "A keyboard-friendly editor that turns structured text into interactive mind maps.",
  primaryCtaLabel: "Open the app",
  primaryCtaHref: "/app",
  secondaryCtaLabel: "See how it works",
  secondaryCtaHref: "/guide",
  note: "Free to try. No account required.",
  stats: [
    { value: "10k+", label: "Maps created" },
    { value: "5", label: "Layout styles" },
    { value: "0", label: "Setup required" },
  ],
  image: {
    src: "https://ozsv.au/_astro/app-1440w.webp",
    alt: "App screenshot showing the editor with a mind map diagram.",
    width: 1440,
    height: 875,
  },
}

export const productUseCases: ProductUseCasesProps = {
  title: "Built for how you think",
  subtitle: "A few ways teams and individuals use it every day.",
  groups: [
    {
      emoji: "🎓",
      audience: "Students",
      items: [{ title: "Study notes", body: "Turn lecture notes into a reviewable map." }],
    },
    {
      emoji: "💼",
      audience: "Product teams",
      items: [{ title: "Roadmapping", body: "Sketch feature ideas and dependencies fast." }],
    },
  ],
}

export const quickStartSteps: QuickStartStepsProps = {
  anchorId: "quick-start",
  title: "Get started in minutes",
  subtitle: "From a blank page to a shareable mind map.",
  steps: [
    { title: "Write an outline", body: "Type or paste structured text." },
    { title: "Preview the map", body: "Watch it render live as you type." },
    { title: "Adjust the layout", body: "Switch between tree, radial and org-chart views." },
    { title: "Export", body: "Save as PNG, SVG or Markdown." },
    { title: "Share", body: "Send a link or export for your docs." },
  ],
}

export const relatedNav: RelatedNavProps = {
  ariaLabel: "Text to Mind Map resources",
  links: [
    { href: "/", label: "Overview" },
    { href: "/guide", label: "Guide" },
    { href: "/templates", label: "Templates" },
    { href: "/use-cases", label: "Use cases" },
    { href: "/shortcuts", label: "Shortcuts" },
  ],
  current: "/",
}

export const resourcePageClosing: ResourcePageClosingProps = {
  title: "Ready to try it yourself?",
  body: "Open the editor and turn your first outline into a mind map.",
  ctaLabel: "Open the app",
  ctaHref: "/app",
}

export const resourcePageHero: ResourcePageHeroProps = {
  eyebrow: "Guide",
  title: "How Text to Mind Map works",
  subtitle: "A quick walkthrough of writing, previewing and exporting your first map.",
  intro: "This guide covers the core workflow from a blank page to a finished, shareable mind map.",
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

export const shortcutTable: ShortcutTableProps = {
  groups: [
    {
      title: "Navigation",
      rows: [
        { keys: "Cmd/Ctrl + K", action: "Open the command palette" },
        { keys: "Arrow keys", action: "Move focus between nodes" },
      ],
    },
    {
      title: "Editing",
      rows: [
        { keys: "Tab", action: "Add a child node" },
        { keys: "Enter", action: "Add a sibling node" },
      ],
    },
  ],
}

export const showcaseSection: ShowcaseSectionProps = {
  title: "See it in action",
  subtitle: "A closer look at the editor and live map view side by side.",
  previewLabel: "Preview",
  caption: "Write on the left, see the map update on the right",
  body: "Every keystroke updates the map instantly, so you can restructure ideas without losing your place.",
  ctaLabel: "Try it now",
  ctaHref: "/app",
  image: {
    src: "https://ozsv.au/_astro/app-showcase.webp",
    alt: "App screenshot showing the Text to Mind Map editor with a mind map diagram.",
    width: 1582,
    height: 971,
  },
}

export const themeToggle: ThemeToggleProps = {
  groupLabel: "Theme",
  options: themeOptions,
}

export const trustSection: TrustSectionProps = {
  eyebrowLabel: "Privacy",
  title: "Your data stays yours",
  body: "Everything runs in your browser by default — nothing is uploaded unless you choose to sync it.",
  points: [
    { icon: "Lock", title: "Local-first storage", body: "Maps are saved to your device by default." },
    { icon: "CloudOff", title: "No account required", body: "Try the full editor without signing up." },
    { icon: "ShieldCheck", title: "No tracking scripts", body: "No third-party analytics run inside the editor." },
    { icon: "UserRoundX", title: "Anonymous by default", body: "We don't ask for personal details to use the app." },
  ],
}

export const useCaseGroups: UseCaseGroupsProps = {
  groups: [
    {
      emoji: "🎓",
      audience: "Students",
      summary: "Turn lecture notes and readings into reviewable maps.",
      scenarios: [
        { title: "Exam revision", body: "Condense a semester of notes into one map." },
        { title: "Essay planning", body: "Outline an argument before writing." },
      ],
    },
    {
      emoji: "💼",
      audience: "Product teams",
      summary: "Sketch ideas and dependencies without a heavyweight tool.",
      scenarios: [
        { title: "Roadmapping", body: "Map features against quarters at a glance." },
        { title: "Retro notes", body: "Cluster feedback into themes quickly." },
      ],
    },
  ],
}

export const valueProps: ValuePropsProps = {
  items: [
    { title: "Fast", body: "Ship in minutes, not weeks." },
    { title: "Flexible", body: "Adapts to your workflow, not the other way around." },
    { title: "Reliable", body: "Built on tools you already trust." },
  ],
}