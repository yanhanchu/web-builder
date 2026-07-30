export interface ShowcaseSectionProps {
  /** Section heading */
  title: string
  /** Supporting copy under the heading */
  subtitle: string
  /** Small "Preview" label above the caption */
  previewLabel: string
  /** Caption shown next to the screenshot */
  caption: string
  /** Supporting copy under the caption */
  body: string
  /** CTA label */
  ctaLabel: string
  /** CTA destination href */
  ctaHref: string
  /** Screenshot rendered beside the copy */
  image: {
    /** Image source */
    src: string
    /** Alt text */
    alt: string
    /** Intrinsic width, for layout stability */
    width: number
    /** Intrinsic height, for layout stability */
    height: number
  }
}

/**
 * Single-screenshot showcase section: heading, a large screenshot, a
 * caption with supporting copy, and a CTA. All content and the image
 * are supplied by the caller.
 */
export function ShowcaseSection({
  title,
  subtitle,
  previewLabel,
  caption,
  body,
  ctaLabel,
  ctaHref,
  image,
}: ShowcaseSectionProps) {
  return (
    <section className="mx-auto mt-12 max-w-6xl">
      <header className="mb-6 px-1">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
      </header>
      <figure className="glass grid gap-6 rounded-3xl p-5 sm:p-8 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div className="glass-strong overflow-hidden rounded-2xl ring-1 ring-border/60">
          <img
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            fetchPriority="high"
            className="block h-auto w-full"
          />
        </div>
        <figcaption>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{previewLabel}</p>
          <h3 className="mt-2 font-display text-xl font-bold sm:text-2xl">{caption}</h3>
          <p className="mt-3 text-sm text-foreground/80">{body}</p>
          <div className="mt-5">
            <a
              href={ctaHref}
              className="text-brand-foreground shadow-lg shadow-brand/20 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              {ctaLabel}
            </a>
          </div>
        </figcaption>
      </figure>
    </section>
  )
}
