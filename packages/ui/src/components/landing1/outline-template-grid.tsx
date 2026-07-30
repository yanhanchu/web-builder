import { CopyButton } from "./copy-button"

export interface OutlineTemplate {
  /** Unique slug, used as the card's anchor id */
  slug: string
  /** Decorative emoji shown next to the title */
  emoji: string
  /** Card title */
  title: string
  /** One-line summary */
  summary: string
  /** "Best for" audience description */
  bestFor: string
  /** The plain-text outline shown in the preview and copied to the clipboard */
  outline: string
}

export interface OutlineTemplateGridProps {
  /** Templates, in display order */
  templates: OutlineTemplate[]
  /** Label prefixing each card's "best for" line, e.g. "Best for:" */
  bestForLabel: string
  /** Copy button label */
  copyLabel: string
  /** Copy button label shown briefly after copying */
  copiedLabel: string
  /** Hint shown next to the copy button, e.g. "then paste it into the editor" */
  pasteHint: string
}

/**
 * Responsive grid of outline template cards: emoji + title + summary,
 * a preformatted outline preview, and a copy-to-clipboard button. All
 * content is supplied by the caller.
 */
export function OutlineTemplateGrid({
  templates,
  bestForLabel,
  copyLabel,
  copiedLabel,
  pasteHint,
}: OutlineTemplateGridProps) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {templates.map((tpl) => (
        <article
          key={tpl.slug}
          id={tpl.slug}
          className="glass flex scroll-mt-24 flex-col gap-3 rounded-2xl p-6"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-2xl">
              {tpl.emoji}
            </span>
            <div>
              <h2 className="font-display text-lg font-bold">{tpl.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tpl.summary}</p>
            </div>
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand/80">
            {bestForLabel} <span className="font-normal normal-case text-foreground/75">{tpl.bestFor}</span>
          </p>
          <pre className="max-h-64 overflow-auto rounded-xl border border-border/60 bg-background/60 p-3 font-mono text-xs leading-relaxed text-foreground/85">
{tpl.outline}
          </pre>
          <div className="flex items-center gap-2">
            <CopyButton value={tpl.outline} label={copyLabel} copiedLabel={copiedLabel} />
            <span className="text-xs text-muted-foreground">{pasteHint}</span>
          </div>
        </article>
      ))}
    </div>
  )
}
