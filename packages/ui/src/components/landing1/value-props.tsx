export interface ValueProp {
  /** Short heading */
  title: string
  /** One or two sentence supporting copy */
  body: string
}

export interface ValuePropsProps {
  /** Cards shown in the grid, in display order */
  items: ValueProp[]
}

/**
 * Responsive grid of short value-proposition cards
 * (3 columns on desktop, stacked on mobile).
 */
export function ValueProps({ items }: ValuePropsProps) {
  return (
    <section className="mx-auto mt-10 grid max-w-6xl gap-3 sm:mt-14 sm:grid-cols-3">
      {items.map((v) => (
        <div key={v.title} className="glass rounded-2xl p-5">
          <h3 className="font-display text-base font-bold">{v.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{v.body}</p>
        </div>
      ))}
    </section>
  )
}
