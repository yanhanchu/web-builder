import { type SeoProps as SeoProps } from "./seo";
import { type SiteInfoProps as SiteInfoProps } from "./site-info";

/**
 * Default values for the site-metadata components.
 *
 * These mirror `SeoData` / `SiteInfoData` (see `./types`) and serve as the
 * initial bound typed-data record for:
 *  - App settings → one `SiteInfoData` + one `SeoData` (site-wide defaults)
 *  - Page manager → one `SeoData` per page
 *
 * The generator can auto-produce component JSON from the interfaces +
 * props in this folder; the values here are the starting point shown in
 * the admin UI before the user customizes them.
 */
export const seo: SeoProps = {
  title: "Web Builder",
  titleTemplate: "%s | Web Builder",
  description: "使用 Web Builder 打造你的網站。",
  keywords: "web, builder, cms",
  ogImage: "/og-image.png",
  ogType: "website",
  twitterCard: "summary_large_image",
  twitterSite: "@webbuilder",
  canonicalUrl: "",
  robots: "index, follow",
};

export const siteInfo: SiteInfoProps = {
  siteName: "Web Builder",
  tagline: "使用 Web Builder 打造你的網站。",
  siteUrl: "https://example.com",
  faviconUrl: "/favicon.ico",
  manifestUrl: "/manifest.webmanifest",
  themeColor: "#2d9c74",
  defaultLocale: "en",
  contactEmail: "hello@example.com",
  publisher: "Web Builder",
};
