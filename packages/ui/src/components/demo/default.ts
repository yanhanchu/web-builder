import { type AvatarProps as AvatarProps } from "./avatar";
import { type BadgeProps as BadgeProps } from "./badge";
import { type BrandProps as BrandProps } from "./brand";
import { type ButtonProps as ButtonProps } from "./button";
import { type CardProps as CardProps, type CardHeaderProps as CardHeaderProps } from "./card";
import { type HeaderProps as HeaderProps } from "./header";
import { type InputProps as InputProps } from "./input";

export const avatar: AvatarProps = {
  src: "https://ozsv.au/_astro/logo.Czr5nQmc.webp",
  name: "Alden Chu",
}

export const badge: BadgeProps = {
  children: "In progress",
  tone: "info",
  dot: true,
}

export const brand: BrandProps = {
  data: {
    toHome: "/",
    ariaLabel: "OZSV home",
    mark: "OZSV",
    logoSrc: "https://ozsv.au/_astro/logo.Czr5nQmc.webp",
    wordmark: {
      lead: "OZ",
      accent: "SV",
    },
  },
}

export const button: ButtonProps = {
  variant: "primary",
  size: "md",
  children: "Continue",
}

export const card: CardProps = {
  interactive: false,
  padding: 20,
  children: "Card content goes here.",
}

export const cardHeader: CardHeaderProps = {
  title: "Team members",
  subtitle: "4 people in this workspace",
}

export const header: HeaderProps = {
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
    { label: "Product", to: "/product" },
    { label: "Pricing", to: "/pricing" },
  ],
  themeOptions: [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ],
  themeGroupLabel: "Theme",
  themeLabel: "Theme",
  openMenuLabel: "Open menu",
  closeMenuLabel: "Close menu",
  testNumber: 0,
}

export const input: InputProps = {
  label: "Email address",
  placeholder: "you@example.com",
}