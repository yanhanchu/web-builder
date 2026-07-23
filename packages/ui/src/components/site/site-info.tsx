import type { SiteInfoData } from "./types";

/**
 * Props for the site basic-info component.
 *
 * One `SiteInfo` instance holds the global identity of the site: name,
 * URL, favicon, theme color, contact, etc. The App settings page binds
 * exactly one typed-data record of `SiteInfoData` to this component, and
 * the builder uses it to populate `<head>` defaults, structured data, and
 * shared UI like the footer.
 */
export interface SiteInfoProps extends SiteInfoData {}

/**
 * Site basic-info component.
 *
 * Pure data carrier — does not render visible UI. The builder consumes the
 * bound `SiteInfoData` record to emit favicon links, manifest link,
 * `theme-color` meta, and site-level structured data.
 */
export function SiteInfo(_props: SiteInfoProps): null {
  return null;
}
