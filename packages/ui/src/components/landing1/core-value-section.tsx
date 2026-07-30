export interface CoreValueSectionProps {
  /** Section heading */
  title: string
  /** Supporting copy under the heading */
  body: string
}

/**
 * Single centered card stating the product's core value proposition.
 * All content is supplied by the caller.
 */
export function CoreValueSection({ title, body }: CoreValueSectionProps) {
  return (
    <section className="mx-auto mt-12 max-w-4xl">
      <div className="glass rounded-3xl p-6 sm:p-10">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">{title}</h2>
        <p className="mt-4 text-base leading-relaxed text-foreground/85 sm:text-lg">{body}</p>
      </div>
    </section>
  )
}
