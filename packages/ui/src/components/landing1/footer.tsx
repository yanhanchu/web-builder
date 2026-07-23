import { Brand } from "./brand"
import type { BrandData, NavColumn } from "./types"

export interface FooterProps {
  /** Brand strings and logo, forwarded to <Brand /> */
  brand: BrandData
  /** Short tagline shown under the brand mark */
  tagline: string
  /** Contact email shown as a mailto link */
  email: string
  /** aria-label for the email link */
  emailAriaLabel: string
  /** Grouped link columns, e.g. Product / Company */
  columns: NavColumn[]
  /** Copyright line, e.g. "© 2026 OZSV. All rights reserved." */
  copyright: string
  /** Secondary meta line shown next to the copyright, e.g. "Made in Australia" */
  meta: string
}

/**
 * Site footer with brand/tagline, contact email, grouped link columns and a
 * copyright bar. Purely presentational — no dates or strings are computed
 * internally, so the caller controls the copyright year and wording.
 */
export function Footer({
  brand,
  tagline,
  email,
  emailAriaLabel,
  columns,
  copyright,
  meta,
}: FooterProps) {
  return (
    <footer className="px-3 pt-16 pb-6 sm:px-6">
      <div className="glass mx-auto max-w-6xl rounded-3xl p-6 sm:p-10">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Brand data={brand} />
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">{tagline}</p>
            <a
              href={`mailto:${email}`}
              aria-label={emailAriaLabel}
              className="mt-4 inline-block text-sm font-medium text-brand hover:underline"
            >
              {email}
            </a>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.items.map((item) => (
                  <li key={item.to}>
                    <a
                      href={item.to}
                      hrefLang="en"
                      className="text-sm text-foreground/80 hover:text-foreground"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-border/60 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>{copyright}</p>
          <p>{meta}</p>
        </div>
      </div>
    </footer>
  )
}
