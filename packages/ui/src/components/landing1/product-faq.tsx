import type { FaqItem } from "./types"

export interface ProductFaqProps {
  /** Section heading */
  title: string
  /** Questions and answers, rendered as collapsible <details> items */
  items: FaqItem[]
}

/**
 * Collapsible FAQ list using native `<details>`/`<summary>` — no JS state
 * needed, the browser handles open/closed. All content is supplied by
 * the caller.
 */
export function ProductFaq({ title, items }: ProductFaqProps) {
  return (
    <section className="mx-auto mt-12 max-w-3xl">
      <header className="mb-6 px-1">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">{title}</h2>
      </header>
      <div className="space-y-3">
        {items.map((q) => (
          <details
            key={q.question}
            className="glass group rounded-2xl p-5 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer items-start justify-between gap-4 text-base font-semibold">
              <span>{q.question}</span>
              <span
                aria-hidden
                className="mt-1 inline-block h-5 w-5 shrink-0 rounded-full border border-border text-center text-sm leading-[18px] text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-foreground/80">{q.answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
