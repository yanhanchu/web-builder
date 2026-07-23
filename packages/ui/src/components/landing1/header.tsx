import { Menu, X } from "lucide-react"
import { useState } from "react"
import { Brand } from "./brand"
import { ThemeToggle } from "./theme-toggle"
import type { BrandData, NavItem, ThemeOption } from "./types"

export interface HeaderProps {
  /** Brand strings and logo, forwarded to <Brand /> */
  brand: BrandData
  /** Primary navigation links, shown inline on desktop and in the mobile sheet */
  primaryNav: NavItem[]
  /** Theme toggle options, forwarded to <ThemeToggle /> */
  themeOptions: ThemeOption[]
  /** Accessible label for the theme toggle radiogroup */
  themeGroupLabel: string
  /** Label shown next to the theme toggle in the mobile menu */
  themeLabel: string
  /** aria-label for the mobile menu button when the menu is closed */
  openMenuLabel: string
  /** aria-label for the mobile menu button when the menu is open */
  closeMenuLabel: string
}

/**
 * Sticky site header with brand, primary navigation, theme toggle and a
 * collapsible mobile menu. Owns only its own open/closed UI state — all
 * copy and links are supplied by the caller.
 */
export function Header({
  brand,
  primaryNav,
  themeOptions,
  themeGroupLabel,
  themeLabel,
  openMenuLabel,
  closeMenuLabel,
}: HeaderProps) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
      <div className="glass mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-3 py-2 sm:px-5 sm:py-3">
        <Brand data={brand} />
        <nav className="hidden items-center gap-1 md:flex">
          {primaryNav.map((item) => (
            <a
              key={item.to}
              href={item.to}
              hrefLang="en"
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ThemeToggle groupLabel={themeGroupLabel} options={themeOptions} />
          </div>
          <button
            type="button"
            className="glass grid h-9 w-9 place-items-center rounded-xl md:hidden"
            aria-label={open ? closeMenuLabel : openMenuLabel}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="glass mx-auto mt-2 max-w-6xl rounded-2xl p-3 md:hidden">
          <nav className="flex flex-col">
            {primaryNav.map((item) => (
              <a
                key={item.to}
                href={item.to}
                hrefLang="en"
                className="rounded-xl px-3 py-2 text-sm text-foreground hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-3">
            <span className="text-xs text-muted-foreground">{themeLabel}</span>
            <ThemeToggle groupLabel={themeGroupLabel} options={themeOptions} />
          </div>
        </div>
      ) : null}
    </header>
  )
}
