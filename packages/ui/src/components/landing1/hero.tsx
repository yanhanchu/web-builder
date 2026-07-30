import { ArrowRight, Sparkles } from "lucide-react";

export interface HeroProps {
  /** Small pill of text above the headline */
  eyebrow: string;
  title: {
    /** Non-highlighted lead-in of the headline */
    lead: string;
    /** Highlighted/gradient portion of the headline */
    accent: string;
  };
  /** Supporting copy under the headline */
  subtitle: string;
  primaryCta: {
    /** Button label */
    label: string;
    /** Destination href */
    to: string;
  };
  secondaryCta: {
    /** Button label */
    label: string;
    /** Destination href */
    to: string;
  };
  /** Optional row of stat callouts shown under a divider at the bottom of the hero */
  stats?: {
    /** Stat value, e.g. "10k+" */
    value: string;
    /** Stat label under the value */
    label: string;
  }[];
  defaultItems?: string[];
  defaultNumbers?: number[];
  defaultBooleans?: boolean[];
  defaultNavs?: {
    /** Button label */
    label: string;
    /** Destination href */
    to: string;
  }[];
}

/**
 * Full-width hero banner: eyebrow, headline, subtitle, a pair of CTAs and
 * an optional row of stat callouts. All copy and links are supplied by
 * the caller.
 */
export function Hero({
  eyebrow,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
  stats,
}: HeroProps) {
  return (
    <section className="mx-auto mt-10 max-w-6xl sm:mt-16">
      <div className="glass relative overflow-hidden rounded-3xl p-6 sm:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-60 blur-3xl"
          style={{ backgroundImage: "var(--gradient-brand)" }}
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3 text-brand" aria-hidden />
            {eyebrow}
          </span>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.05] font-black tracking-tight sm:text-6xl">
            {title.lead}
            <span className="text-gradient-brand">{title.accent}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {subtitle}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href={primaryCta.to}
              hrefLang="en"
              className="group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              {primaryCta.label}
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </a>
            <a
              href={secondaryCta.to}
              hrefLang="en"
              className="glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
            >
              {secondaryCta.label}
            </a>
          </div>
        </div>
        {stats && stats.length > 0 ? (
          <dl className="relative mt-8 grid gap-3 border-t border-border/60 pt-6 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col">
                <dt className="text-2xl font-black text-gradient-brand">{s.value}</dt>
                <dd className="mt-1 text-xs text-muted-foreground">{s.label}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
