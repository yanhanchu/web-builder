import { Mail } from "lucide-react"

export interface CtaBannerProps {
  /** Banner heading */
  title: string
  /** Supporting copy under the heading */
  body: string
  /** Button label, e.g. "Get in touch" */
  ctaLabel: string
  /** Button destination, e.g. "mailto:hello@example.com" */
  ctaHref: string
}

/**
 * Full-width closing call-to-action banner with a decorative aurora
 * background and a single mail button. All copy and the link are
 * supplied by the caller.
 */
export function CtaBanner({ title, body, ctaLabel, ctaHref }: CtaBannerProps) {
  return (
    <section className="mx-auto mt-20 max-w-6xl">
      <div className="glass-strong relative overflow-hidden rounded-3xl p-6 sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ backgroundImage: "var(--gradient-aurora)" }}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">{body}</p>
          </div>
          <a
            href={ctaHref}
            className="inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-lg"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          >
            <Mail className="h-4 w-4" aria-hidden />
            {ctaLabel}
          </a>
        </div>
      </div>
    </section>
  )
}
