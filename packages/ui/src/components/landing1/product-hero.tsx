import { ArrowRight, Sparkles } from "lucide-react"

export interface ProductHeroStat {
  /** Stat value, e.g. "10k+" */
  value: string
  /** Stat label under the value */
  label: string
}

export interface ProductHeroProps {
  /** Small pill of text above the headline */
  eyebrow: string
  title: {
    /** Non-highlighted lead-in of the headline */
    lead: string
    /** Highlighted/gradient portion of the headline */
    accent: string
  }
  /** Supporting copy under the headline */
  subtitle: string
  /** Primary CTA label */
  primaryCtaLabel: string
  /** Primary CTA destination href */
  primaryCtaHref: string
  /** Secondary CTA label */
  secondaryCtaLabel: string
  /** Secondary CTA destination href */
  secondaryCtaHref: string
  /** Small note shown under the CTAs, e.g. pricing or platform note */
  note: string
  /** Row of stat callouts shown under a divider at the bottom of the hero */
  stats: ProductHeroStat[]
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
 * Product landing page hero: eyebrow, headline, subtitle, primary/secondary
 * CTAs, a note, a screenshot and a row of stat callouts. All copy, links
 * and the image are supplied by the caller.
 */
export function ProductHero({
  eyebrow,
  title,
  subtitle,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  note,
  stats,
  image,
}: ProductHeroProps) {
  return (
    <section className="mx-auto mt-8 max-w-6xl sm:mt-12">
      <div className="glass anim-fade-up relative overflow-hidden rounded-3xl p-6 sm:p-10">
        <div className="grid items-center gap-8 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
              {title.lead}
              <span className="text-gradient-brand">{title.accent}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">{subtitle}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={primaryCtaHref}
                className="text-brand-foreground shadow-lg shadow-brand/20 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                {primaryCtaLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <a
                href={secondaryCtaHref}
                className="glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
              >
                {secondaryCtaLabel}
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{note}</p>
          </div>
          <div className="glass-strong rounded-2xl p-2 sm:p-2">
            <img
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              fetchPriority="high"
              className="block h-auto w-full"
            />
          </div>
        </div>
        <dl className="mt-8 grid gap-3 border-t border-border/60 pt-6 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col">
              <dt className="text-2xl font-black text-gradient-brand">{s.value}</dt>
              <dd className="mt-1 text-xs text-muted-foreground">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
