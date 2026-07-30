export interface ResourcePageHeroProps {
  /** Small label above the title, e.g. "Guide" */
  eyebrow: string
  /** Page heading */
  title: string
  /** Supporting copy under the heading */
  subtitle: string
  /** Optional longer intro paragraph rendered below the subtitle */
  intro?: string
}

/**
 * Header panel used at the top of resource-style pages (guide, shortcuts,
 * templates, use-cases, ...): eyebrow label, title, subtitle and an
 * optional intro paragraph inside a glass card.
 */
export function ResourcePageHero({ eyebrow, title, subtitle, intro }: ResourcePageHeroProps) {
  return (
    <div className="glass rounded-3xl p-6 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">{eyebrow}</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{subtitle}</p>
      {intro ? <p className="mt-4 text-sm leading-relaxed text-foreground/85">{intro}</p> : null}
    </div>
  )
}
