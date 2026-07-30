export interface ResourcePageClosingProps {
  /** Closing heading */
  title: string
  /** Supporting copy under the heading */
  body: string
  /** CTA button label */
  ctaLabel: string
  /** CTA destination href */
  ctaHref: string
}

/**
 * Centered closing call-to-action panel used at the bottom of
 * resource-style pages (guide, shortcuts, templates, use-cases, ...).
 *
 * Renders the CTA as a styled link (rather than `<Button asChild>`, which
 * this package's `Button` does not support) using the same visual style
 * as the primary button variant.
 */
export function ResourcePageClosing({ title, body, ctaLabel, ctaHref }: ResourcePageClosingProps) {
  return (
    <div className="mt-6 glass rounded-3xl p-6 text-center sm:p-10">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <a
        href={ctaHref}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-[1.125rem] py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {ctaLabel}
      </a>
    </div>
  )
}
