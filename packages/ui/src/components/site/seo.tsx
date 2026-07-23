import type { SeoData } from "./types";

/**
 * Props for the SEO metadata component.
 *
 * One `Seo` instance represents the search-engine / social-share metadata
 * for a single page (or the site-wide default). In the admin UI, each page
 * binds exactly one typed-data record of `SeoData` to this component, and
 * the App settings page binds one as the fallback default.
 */
export interface SeoProps extends SeoData {}

/**
 * SEO metadata component.
 *
 * Pure data carrier — does not render visible UI. The builder consumes the
 * bound `SeoData` record to emit `<title>`, `<meta>`, Open Graph, and
 * Twitter card tags into the page `<head>`.
 *
 * `noindex` (whether to block search-engine indexing) is intentionally NOT
 * part of this component; it lives on the route definition in Route
 * management, because it is a routing-level concern rather than per-page
 * content.
 */
export function Seo(_props: SeoProps): null {
  return null;
}
