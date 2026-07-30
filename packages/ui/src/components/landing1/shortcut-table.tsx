export interface ShortcutRow {
  /** Key combination, e.g. "Cmd/Ctrl + K" */
  keys: string
  /** What the shortcut does */
  action: string
}

export interface ShortcutGroup {
  /** Group heading, e.g. "Navigation" */
  title: string
  /** Rows in this group, in display order */
  rows: ShortcutRow[]
}

export interface ShortcutTableProps {
  /** Groups of keyboard shortcuts, rendered as a stack of cards */
  groups: ShortcutGroup[]
}

/**
 * Stack of titled cards listing keyboard shortcuts, grouped by category
 * (e.g. Navigation, Editing). All content is supplied by the caller.
 */
export function ShortcutTable({ groups }: ShortcutTableProps) {
  return (
    <div className="mt-6 space-y-4">
      {groups.map((group) => (
        <article key={group.title} className="glass rounded-2xl p-6">
          <h2 className="font-display text-lg font-bold">{group.title}</h2>
          <div className="mt-3 divide-y divide-border/60">
            {group.rows.map((row) => (
              <div
                key={row.keys}
                className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4"
              >
                <code className="w-fit shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-semibold sm:w-56">
                  {row.keys}
                </code>
                <span className="text-sm text-foreground/85">{row.action}</span>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}
