import { useEffect, useState } from "react"
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import { getStoredTheme, setTheme as persistTheme, type Theme } from "@workspace/ui/lib/theme"
import type { ThemeOption } from "./types"

const iconMap: Record<Theme, LucideIcon> = {
  light: Sun,
  system: Monitor,
  dark: Moon,
}

export interface ThemeToggleProps {
  /** Accessible label for the radiogroup */
  groupLabel: string
  /** Selectable theme options, in display order */
  options: ThemeOption[]
}

/**
 * Light / dark / system theme switcher.
 *
 * No Context/provider: reads the persisted choice from `localStorage`
 * on mount (via `getStoredTheme`) and writes through `setTheme` from
 * `@/lib/theme`, which updates `data-theme` on `<html>` directly. Local
 * `useState` here is only for the button's own active-state highlight,
 * not shared app state — this component is the only thing that needs
 * to re-render when the choice changes.
 */
export function ThemeToggle({ groupLabel, options }: ThemeToggleProps) {
  const [active, setActive] = useState<Theme>("system")

  useEffect(() => {
    setActive(getStoredTheme())
  }, [])

  function handleSelect(value: Theme) {
    persistTheme(value)
    setActive(value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      className="glass inline-flex items-center rounded-full p-1"
    >
      {options.map(({ value, label }) => {
        const Icon = iconMap[value]
        const isActive = active === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            onClick={() => handleSelect(value)}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              isActive
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
