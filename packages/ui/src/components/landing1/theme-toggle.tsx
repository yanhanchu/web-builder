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
 *
 * 【為什麼 onClick 要傳 e.currentTarget.ownerDocument】這個組件可能被畫布
 * 編輯器用 React portal 掛進一個獨立的 iframe document 裡預覽（見
 * apps/web-builder 的 CanvasFrame）。portal 只搬動 DOM 節點，這裡的 JS
 * 還是跑在外層 window 的 realm，如果 setTheme 內部寫死操作全域
 * `document`，畫布裡點這顆按鈕改到的會是外層 admin 頁面的 `<html>`，不是
 * iframe 自己的、真正套用了預覽樣式的那個 `<html>`——畫面上會像完全沒反應。
 * `e.currentTarget` 是這顆 `<button>` 自己，它的 `ownerDocument` 永遠正確
 * 指向它實際被 portal 進去的那個 document（一般情境下就是全域
 * `document`，行為不變），不需要額外用 Context 或 prop 往下傳。
 */
export function ThemeToggle({ groupLabel, options }: ThemeToggleProps) {
  const [active, setActive] = useState<Theme>("system")

  useEffect(() => {
    setActive(getStoredTheme())
  }, [])

  function handleSelect(value: Theme, doc: Document) {
    persistTheme(value, doc)
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
            onClick={(e) => handleSelect(value, e.currentTarget.ownerDocument)}
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