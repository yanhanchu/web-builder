/**
 * Type definitions for site-wide metadata: SEO and site basic info.
 *
 * These shapes are the single source of truth consumed by the App settings
 * page (site info + default SEO) and by the Page manager (per-page SEO).
 * Each page's SEO is bound to one typed-data record of `SeoData`; the
 * App-level site info and default SEO are each bound to one record of
 * `SiteInfoData` / `SeoData` respectively.
 *
 * Keeping these as plain data interfaces (no rendering logic) lets the
 * generator auto-produce the component JSON docs and lets the data-model
 * layer bind/resolve them like any other typed data.
 */

/**
 * Search-engine and social-share metadata for a single page or for the
 * site-wide defaults. Bound one-to-one: each page owns one `SeoData`
 * record; the App settings owns one as the fallback default.
 */
export interface SeoData {
  /** Page title shown in the browser tab and as the search-result headline. */
  title: string;
  /**
   * Title template applied when a page has its own `title`.
   * `%s` is replaced with the page title, e.g. "%s | My Site".
   * Leave empty to use the page title verbatim.
   */
  titleTemplate: string;
  /** Meta description summarizing the page for search engines and link previews. */
  description: string;
  /** Comma-separated keywords hinting at the page's topic. */
  keywords: string;
  /** Absolute or root-relative URL to the Open Graph share image (1200×630 recommended). */
  ogImage: string;
  /**
   * Social card type for Open Graph.
   * - "website" — standard page card
   * - "article" — content/article card
   */
  ogType: "website" | "article";
  /** Twitter handle for the site/author, e.g. "@myaccount" (used in twitter:card). */
  twitterCard: string;
  /** Twitter handle of the site, e.g. "@mysite" (used in twitter:site). */
  twitterSite: string;
  /** Canonical URL for this page, used to deduplicate duplicate content. */
  canonicalUrl: string;
  /** Additional meta robots directives, e.g. "max-image-preview:large". */
  robots: string;
}

/**
 * Basic, site-wide identity information: name, URLs, branding assets.
 * Bound one-to-one to the App settings page as a single typed-data record.
 */
export interface SiteInfoData {
  /** Public-facing name of the website, shown in the header and browser tab. */
  siteName: string;
  /** Short tagline or slogan shown under the site name in some contexts. */
  tagline: string;
  /** Root URL of the deployed site, e.g. "https://example.com" (no trailing slash). */
  siteUrl: string;
  /** Root-relative or absolute URL to the favicon file, e.g. "/favicon.ico". */
  faviconUrl: string;
  /** Root-relative or absolute URL to the web app manifest, e.g. "/manifest.webmanifest". */
  manifestUrl: string;
  /** Primary brand/theme color used for browser UI theming, e.g. "#2d9c74". */
  themeColor: string;
  /** BCP-47 default locale for the site, e.g. "zh-TW". */
  defaultLocale: string;
  /** Primary contact email for the site, shown in footer / structured data. */
  contactEmail: string;
  /** Name of the legal entity / company that owns the site. */
  publisher: string;
}
