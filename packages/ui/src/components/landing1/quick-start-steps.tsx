export interface QuickStartStep {
  /** Step title */
  title: string
  /** Step description */
  body: string
}

export interface QuickStartStepsProps {
  /** Anchor id for this section, used by links elsewhere on the page (e.g. hero CTAs) */
  anchorId?: string
  /** Section heading */
  title: string
  /** Supporting copy under the heading */
  subtitle: string
  /** Steps, in order; numbered automatically starting at 1 */
  steps: QuickStartStep[]
}

/**
 * Numbered row of quick-start step cards. All content is supplied by
 * the caller; step numbers are derived from array order.
 */
export function QuickStartSteps({ anchorId, title, subtitle, steps }: QuickStartStepsProps) {
  return (
    <section id={anchorId} className="mx-auto mt-12 max-w-6xl scroll-mt-24">
      <header className="mb-6 px-1">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
      </header>
      <ol className="anim-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.title} className="glass flex h-full flex-col gap-2 rounded-2xl p-5">
            <span
              className="inline-grid h-8 w-8 place-items-center rounded-full text-sm font-black text-brand-foreground"
              style={{ backgroundImage: "var(--gradient-brand)" }}
              aria-hidden
            >
              {i + 1}
            </span>
            <h3 className="text-base font-bold tracking-tight">{s.title}</h3>
            <p className="text-sm text-foreground/80">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
