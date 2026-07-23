export interface Section {
  /** Section heading */
  heading: string
  /** Section body. A string renders as one paragraph; an array renders as
   *  one paragraph per entry (used by longer legal documents). */
  body: string | string[]
}

export interface SectionListProps {
  /** Sections rendered as a vertical stack of cards, in order */
  sections: Section[]
}

/**
 * Stack of titled article cards, one per section. Used for the About
 * page's "what we do" style sections and for legal document bodies.
 */
export function SectionList({ sections }: SectionListProps) {
  return (
    <div className="mt-6 space-y-4">
      {sections.map((s) => (
        <article key={s.heading} className="glass rounded-2xl p-6">
          <h2 className="font-display text-lg font-bold sm:text-xl">{s.heading}</h2>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-foreground/85">
            {Array.isArray(s.body) ? (
              s.body.map((p, i) => <p key={i}>{p}</p>)
            ) : (
              <p>{s.body}</p>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
