import type { FaqItem } from "./types"

export interface FaqSectionProps {
  /** Section heading, e.g. "Frequently asked questions" */
  title: string
  /** Questions and answers, in display order */
  items: FaqItem[]
}

/**
 * Simple stacked FAQ list inside a glass card: a heading followed by
 * question/answer pairs. All content is supplied by the caller.
 */
export function FaqSection({ title, items }: FaqSectionProps) {
  return (
    <div className="mt-6 glass rounded-2xl p-6">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-3 space-y-4">
        {items.map((f) => (
          <div key={f.question}>
            <h3 className="text-sm font-semibold">{f.question}</h3>
            <p className="mt-1 text-sm leading-relaxed text-foreground/85">{f.answer}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
