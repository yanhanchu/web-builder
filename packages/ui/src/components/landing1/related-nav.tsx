import type { RelatedNavLink } from "./types"

export interface RelatedNavProps {
  /** Accessible label for the nav landmark, e.g. "Text to Mind Map resources" */
  ariaLabel: string
  /** Sibling page links, in display order */
  links: RelatedNavLink[]
  /** href of the currently active page, used to highlight the matching pill */
  current: string
}

/**
 * Row of pill links for moving between a group of sibling pages (e.g. a
 * product's Overview / Guide / Templates / Use cases / Shortcuts pages),
 * with the current page highlighted. All links and the active state are
 * supplied by the caller.
 */
export function RelatedNav({ ariaLabel, links, current }: RelatedNavProps) {
  return (
    <nav aria-label={ariaLabel} className="mx-auto mt-10 flex max-w-3xl flex-wrap gap-2 sm:mt-16">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          hrefLang="en"
          aria-current={link.href === current ? "page" : undefined}
          className={
            link.href === current
              ? "glass-strong rounded-full px-4 py-1.5 text-xs font-semibold text-brand"
              : "glass rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          }
        >
          {link.label}
        </a>
      ))}
    </nav>
  )
}
