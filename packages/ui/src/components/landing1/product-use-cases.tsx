export interface ProductUseCaseItem {
  /** Item title */
  title: string
  /** Item description */
  body: string
}

export interface ProductUseCaseGroup {
  /** Decorative emoji shown next to the audience heading */
  emoji: string
  /** Audience heading, e.g. "Students" */
  audience: string
  /** Items for this audience */
  items: ProductUseCaseItem[]
}

export interface ProductUseCasesProps {
  /** Section heading */
  title: string
  /** Supporting copy under the heading */
  subtitle: string
  /** Audience groups, rendered as a 3-column grid on desktop */
  groups: ProductUseCaseGroup[]
}

/**
 * Three-column grid of audience-grouped use case cards. Distinct from
 * `UseCaseGroups` (used on the standalone use-cases resource page), which
 * has a different layout with per-scenario sub-cards. All content is
 * supplied by the caller.
 */
export function ProductUseCases({ title, subtitle, groups }: ProductUseCasesProps) {
  return (
    <section className="mx-auto mt-12 max-w-6xl">
      <header className="mb-6 px-1">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
      </header>
      <div className="anim-stagger grid gap-4 md:grid-cols-3">
        {groups.map((g) => (
          <article key={g.audience} className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden>
                {g.emoji}
              </span>
              <h3 className="font-display text-lg font-bold">{g.audience}</h3>
            </div>
            <ul className="mt-4 space-y-3">
              {g.items.map((it) => (
                <li key={it.title}>
                  <p className="text-sm font-semibold text-foreground">{it.title}</p>
                  <p className="mt-0.5 text-sm text-foreground/75">{it.body}</p>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
