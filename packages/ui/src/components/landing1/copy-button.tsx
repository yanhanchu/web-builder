import { Check, Copy } from "lucide-react"
import { useState } from "react"

export interface CopyButtonProps {
  /** The text copied to the clipboard when clicked */
  value: string
  /** Button label while idle */
  label: string
  /** Button label shown briefly after a successful copy */
  copiedLabel: string
  /** How long (ms) to show `copiedLabel` before reverting. Defaults to 2000. */
  resetAfterMs?: number
}

/**
 * Small pill button that copies `value` to the clipboard and briefly
 * shows a confirmation state. The copy action is a user-triggered
 * side effect (clicking the button), not something that decides what
 * the page displays — the text being copied and both labels come from
 * props.
 */
export function CopyButton({ value, label, copiedLabel, resetAfterMs = 2000 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), resetAfterMs)
    } catch {
      // Clipboard API can be unavailable (older browsers, insecure
      // context); the caller is expected to also render the raw value
      // somewhere on the page for manual copying.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors hover:text-brand"
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? copiedLabel : label}
    </button>
  )
}
