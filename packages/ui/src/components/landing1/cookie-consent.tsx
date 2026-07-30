import { Cookie, X } from "lucide-react"
import { useEffect, useState } from "react"

export interface CookieConsentProps {
  /** Key used to persist the visitor's choice in localStorage */
  storageKey: string
  /** Dialog heading, e.g. "We respect your privacy" */
  title: string
  /** Explanatory copy shown before the privacy policy link */
  description: string
  /** Label for the privacy policy link */
  privacyLinkLabel: string
  /** href for the privacy policy link */
  privacyLinkHref: string
  /** Label for the "necessary cookies" row shown when customising */
  necessaryLabel: string
  /** Description for the "necessary cookies" row */
  necessaryDescription: string
  /** Label for the "analytics cookies" row shown when customising */
  analyticsLabel: string
  /** Description for the "analytics cookies" row */
  analyticsDescription: string
  /** "Accept all" button label */
  acceptAllLabel: string
  /** "Reject non-essential" button label */
  rejectLabel: string
  /** "Customise" button label */
  customiseLabel: string
  /** "Save choices" button label, shown once customising */
  saveLabel: string
  /** aria-label for the dismiss (X) button */
  dismissAriaLabel: string
}

type Consent = {
  necessary: true
  analytics: boolean
  decidedAt: string
}

function readConsent(storageKey: string): Consent | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    return JSON.parse(raw) as Consent
  } catch {
    return null
  }
}

function writeConsent(storageKey: string, c: Consent) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(c))
  } catch {
    // ignore
  }
}

/**
 * GDPR-aligned cookie consent banner.
 *
 * Hidden until the visitor has made a choice; offers "Accept all",
 * "Reject non-essential" and "Customise" on equal footing. The choice is
 * persisted to `localStorage` under `storageKey` — this read/write is a
 * user-triggered side effect (saving the visitor's own decision), not
 * something that decides what copy the banner displays; all text here
 * comes from props.
 */
export function CookieConsent({
  storageKey,
  title,
  description,
  privacyLinkLabel,
  privacyLinkHref,
  necessaryLabel,
  necessaryDescription,
  analyticsLabel,
  analyticsDescription,
  acceptAllLabel,
  rejectLabel,
  customiseLabel,
  saveLabel,
  dismissAriaLabel,
}: CookieConsentProps) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [customise, setCustomise] = useState(false)
  const [analytics, setAnalytics] = useState(false)

  useEffect(() => {
    setMounted(true)
    const current = readConsent(storageKey)
    if (!current) setOpen(true)
    else setAnalytics(current.analytics)
  }, [storageKey])

  if (!mounted || !open) return null

  const save = (analyticsOptIn: boolean) => {
    writeConsent(storageKey, {
      necessary: true,
      analytics: analyticsOptIn,
      decidedAt: new Date().toISOString(),
    })
    setOpen(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-6 sm:pb-6"
    >
      <div className="glass-strong mx-auto max-w-3xl rounded-2xl p-4 shadow-2xl sm:p-5">
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-brand-foreground"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          >
            <Cookie className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="cookie-consent-title" className="font-display text-sm font-bold sm:text-base">
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {description}{" "}
              <a href={privacyLinkHref} hrefLang="en" className="underline hover:text-foreground">
                {privacyLinkLabel}
              </a>
              .
            </p>

            {customise ? (
              <div className="mt-3 space-y-2 rounded-xl bg-foreground/5 p-3">
                <label className="flex items-start gap-2 text-xs sm:text-sm">
                  <input type="checkbox" checked disabled className="mt-0.5 accent-brand" />
                  <span>
                    <span className="font-semibold">{necessaryLabel}</span>{" "}
                    <span className="text-muted-foreground">{necessaryDescription}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs sm:text-sm">
                  <input
                    type="checkbox"
                    checked={analytics}
                    onChange={(e) => setAnalytics(e.target.checked)}
                    className="mt-0.5 accent-brand"
                  />
                  <span>
                    <span className="font-semibold">{analyticsLabel}</span>{" "}
                    <span className="text-muted-foreground">{analyticsDescription}</span>
                  </span>
                </label>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => save(true)}
                className="rounded-full px-4 py-2 text-xs font-semibold text-brand-foreground shadow sm:text-sm"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                {acceptAllLabel}
              </button>
              <button
                type="button"
                onClick={() => save(false)}
                className="glass rounded-full px-4 py-2 text-xs font-semibold sm:text-sm"
              >
                {rejectLabel}
              </button>
              {customise ? (
                <button
                  type="button"
                  onClick={() => save(analytics)}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold sm:text-sm"
                >
                  {saveLabel}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCustomise(true)}
                  className="rounded-full px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground sm:text-sm"
                >
                  {customiseLabel}
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => save(false)}
            aria-label={dismissAriaLabel}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
