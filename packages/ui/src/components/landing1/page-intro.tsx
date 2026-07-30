export interface PageIntroProps {
  /** Page heading */
  title: string
  /** Supporting intro paragraph under the heading */
  intro: string
  /** Optional small line above the title, e.g. "Updated 1 July 2026" */
  eyebrow?: string
  /** Optional "last updated" line shown above the title, e.g. "Updated 1 July 2026" (used by legal documents) */
  updated?: string
}

/**
 * Simple centered page header used on content pages (About, legal
 * documents, etc.): an optional eyebrow line or "updated" date, a large
 * title and an intro paragraph inside a glass panel.
 */
export function PageIntro({ title, intro, eyebrow, updated }: PageIntroProps) {
  return (
    <section className="mx-auto mt-10 max-w-3xl sm:mt-16">
      <div className="glass rounded-3xl p-6 sm:p-10">
        {updated ? (
          <p className="text-xs tracking-wider text-muted-foreground uppercase">{updated}</p>
        ) : eyebrow ? (
          <p className="text-xs tracking-wider text-muted-foreground uppercase">{eyebrow}</p>
        ) : null}
        <h1 className={`text-4xl font-black tracking-tight sm:text-5xl ${eyebrow || updated ? "mt-2" : ""}`}>
          {title}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">{intro}</p>
      </div>
    </section>
  )
}
