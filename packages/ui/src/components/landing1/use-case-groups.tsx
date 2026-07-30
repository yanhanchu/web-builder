export interface UseCaseScenario {
  /** Scenario title */
  title: string
  /** Scenario description */
  body: string
}

export interface UseCaseAudienceGroup {
  /** Decorative emoji shown next to the audience heading */
  emoji: string
  /** Audience heading, e.g. "Students" */
  audience: string
  /** One-line summary of how this audience uses the product */
  summary: string
  /** Concrete scenarios for this audience */
  scenarios: UseCaseScenario[]
}

export interface UseCaseGroupsProps {
  /** Audience groups, in display order */
  groups: UseCaseAudienceGroup[]
}

/**
 * Stack of cards, one per audience, each listing a short summary and a
 * grid of concrete usage scenarios. All content is supplied by the caller.
 */
export function UseCaseGroups({ groups }: UseCaseGroupsProps) {
  return (
    <div className="mt-6 space-y-6">
      {groups.map((group) => (
        <article key={group.audience} className="glass rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-2xl">
              {group.emoji}
            </span>
            <div>
              <h2 className="font-display text-xl font-bold">{group.audience}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{group.summary}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {group.scenarios.map((sc) => (
              <div key={sc.title} className="rounded-xl border border-border/60 p-4">
                <h3 className="text-sm font-semibold">{sc.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground/85">{sc.body}</p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}
