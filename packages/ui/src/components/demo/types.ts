/**
 * Shared data shapes used across `ozsv` blocks and components.
 *
 * Keeping these in one module lets pages build a single data object
 * and spread it into whichever blocks need it, without every block
 * re-declaring the same shapes.
 */

/** A single navigation link. */
export interface NavItem {
  /** Visible label */
  label: string;
  /** Destination href */
  to: string;
}

/** A titled group of navigation links, used in the footer's link columns. */
export interface NavColumn {
  /** Column heading */
  title: string;
  /** Links in this column */
  items: NavItem[];
}

/** Brand / logo strings and image, used in the header and footer. */
export interface BrandData {
  /** href for the logo link (usually "/") */
  toHome: string;
  /** aria-label for the logo link */
  ariaLabel: string;
  /** alt text for the logo mark image */
  mark: string;
  /** Logo image source */
  logoSrc: string;
  wordmark: {
    /** Non-highlighted part of the wordmark, e.g. "OZ" */
    lead: string;
    /** Highlighted/gradient part of the wordmark, e.g. "SV" */
    accent: string;
  };
}

/** One option in the theme toggle control. */
export interface ThemeOption {
  /** Theme value, e.g. "light" | "dark" | "system" */
  value: "light" | "dark" | "system";
  /** Accessible / tooltip label */
  label: string;
}
