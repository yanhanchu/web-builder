import { Mail } from "lucide-react"

export interface ContactCardProps {
  /** Card heading */
  title: string
  /** Supporting intro paragraph */
  intro: string
  /** Contact email shown as the CTA */
  email: string
  /** Heading above the topics list */
  topicsTitle: string
  /** Bullet list of topics people can reach out about */
  topics: string[]
}

/**
 * Contact page's primary card: heading, intro, a prominent mailto CTA and
 * a bulleted list of suggested topics. All copy is supplied by the caller.
 */
export function ContactCard({ title, intro, email, topicsTitle, topics }: ContactCardProps) {
  return (
    <section className="mx-auto mt-10 max-w-3xl sm:mt-16">
      <div className="glass rounded-3xl p-6 sm:p-10">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{intro}</p>

        <a
          href={`mailto:${email}`}
          className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-lg"
          style={{ backgroundImage: "var(--gradient-brand)" }}
        >
          <Mail className="h-4 w-4" aria-hidden />
          {email}
        </a>
      </div>

      <div className="glass mt-6 rounded-2xl p-6">
        <h2 className="font-display text-lg font-bold">{topicsTitle}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {topics.map((topic) => (
            <li key={topic} className="flex items-start gap-2 text-sm text-foreground/85">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
              {topic}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
