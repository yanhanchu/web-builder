export interface ProductClosingProps {
  /** Closing heading */
  title: string
  /** Supporting copy under the heading */
  body: string
  /** Primary CTA label */
  primaryCtaLabel: string
  /** Primary CTA destination href */
  primaryCtaHref: string
  /** Secondary CTA label */
  secondaryCtaLabel: string
  /** Secondary CTA destination href */
  secondaryCtaHref: string
}

/**
 * Centered closing panel with a decorative aurora background and a pair
 * of CTAs (primary gradient button + secondary glass button). All copy
 * and links are supplied by the caller.
 */
export function ProductClosing({
  title,
  body,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
}: ProductClosingProps) {
  return (
    <section className="mx-auto my-16 max-w-4xl">
      <div className="glass-strong rounded-3xl p-8 text-center sm:p-12">
        <h2 className="font-display text-2xl font-black sm:text-3xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">{body}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href={primaryCtaHref}
            className="text-brand-foreground shadow-lg shadow-brand/20 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          >
            {primaryCtaLabel}
          </a>
          <a
            href={secondaryCtaHref}
            hrefLang="en"
            className="glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            {secondaryCtaLabel}
          </a>
        </div>
      </div>
    </section>
  )
}
