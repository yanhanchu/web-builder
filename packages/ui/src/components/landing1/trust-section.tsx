import { CloudOff, Lock, ShieldCheck, UserRoundX, type LucideIcon } from "lucide-react"

const iconMap = {
  Lock,
  CloudOff,
  ShieldCheck,
  UserRoundX,
} as const

export interface TrustPoint {
  /** Icon shown above the point, e.g. "Lock" */
  icon: keyof typeof iconMap
  /** Point title */
  title: string
  /** Point description */
  body: string
}

export interface TrustSectionProps {
  /** Small "Privacy" label above the heading */
  eyebrowLabel: string
  /** Section heading */
  title: string
  /** Supporting copy under the heading */
  body: string
  /** Grid of trust/privacy points */
  points: TrustPoint[]
}

/**
 * Two-column trust/privacy section: heading + copy on one side, a grid of
 * icon + title + body cards on the other. All content is supplied by the
 * caller; each point picks its own icon by name so the mapping doesn't
 * depend on array order.
 */
export function TrustSection({ eyebrowLabel, title, body, points }: TrustSectionProps) {
  return (
    <section className="mx-auto mt-12 max-w-6xl">
      <div className="glass rounded-3xl p-6 sm:p-10">
        <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {eyebrowLabel}
            </p>
            <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{title}</h2>
            <p className="mt-4 text-base leading-relaxed text-foreground/85">{body}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {points.map((p) => {
              const Icon: LucideIcon = iconMap[p.icon] ?? ShieldCheck
              return (
                <li key={p.title} className="glass-strong flex flex-col gap-2 rounded-2xl p-4">
                  <div
                    className="grid h-9 w-9 place-items-center rounded-xl text-brand-foreground"
                    style={{ backgroundImage: "var(--gradient-brand)" }}
                    aria-hidden
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-bold">{p.title}</p>
                  <p className="text-sm text-foreground/75">{p.body}</p>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
