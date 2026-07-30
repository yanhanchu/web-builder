export interface CommandRow {
  /** Command trigger text, e.g. "/table" */
  command: string
  /** What the command inserts or does */
  body: string
}

export interface CommandListProps {
  /** Section heading, e.g. "Quick commands" */
  title: string
  /** Supporting copy under the heading */
  description: string
  /** Commands, in display order */
  commands: CommandRow[]
}

/**
 * Single card listing quick/slash commands as a code trigger next to its
 * description. Visually matches `ShortcutTable`'s row style. All content
 * is supplied by the caller.
 */
export function CommandList({ title, description, commands }: CommandListProps) {
  return (
    <div className="mt-6 glass rounded-2xl p-6">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-3 divide-y divide-border/60">
        {commands.map((qc) => (
          <div
            key={qc.command}
            className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4"
          >
            <code className="w-fit shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-semibold sm:w-40">
              {qc.command}
            </code>
            <span className="text-sm text-foreground/85">{qc.body}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
