import { Mail, Send, CheckCircle2, AlertCircle } from "lucide-react"
import { useState, type FormEvent } from "react"

export interface ContactFormProps {
  /** Card heading */
  title: string
  /** Supporting intro paragraph */
  intro: string
  /** Contact email shown as a fallback and in the topics card */
  email: string
  /** Heading above the topics list */
  topicsTitle: string
  /** Bullet list of topics people can reach out about */
  topics: string[]
  /** Placeholder text for the name field */
  namePlaceholder: string
  /** Placeholder text for the email field */
  emailPlaceholder: string
  /** Placeholder text for the message field */
  messagePlaceholder: string
  /** Label on the submit button while idle */
  submitLabel: string
  /** Label on the submit button while the request is in flight */
  submitPendingLabel: string
  /** Message shown after a successful submission */
  successMessage: string
  /** Fallback error message shown when the request fails without a specific reason */
  genericErrorMessage: string
  /** Text shown before the fallback mailto link inside an error message */
  errorFallbackPrefix: string
  /** API key / endpoint token used to submit the form. If empty, submitting shows an error instead of calling the API. */
  apiKey: string
  /** Subject line sent with the form submission */
  submitSubject: string
  /** Form submission endpoint */
  endpoint: string
}

type SubmitState = "idle" | "loading" | "success" | "error"

/**
 * Contact page's primary card: heading, intro, a message form that submits
 * to a configurable endpoint, and a bulleted list of suggested topics.
 *
 * The form submission itself (an outbound fetch triggered by the visitor
 * clicking "Send") is a user-triggered action, not something that decides
 * what the page displays — all copy, labels and the submit target are
 * still supplied entirely by the caller via props.
 */
export function ContactForm({
  title,
  intro,
  email,
  topicsTitle,
  topics,
  namePlaceholder,
  emailPlaceholder,
  messagePlaceholder,
  submitLabel,
  submitPendingLabel,
  successMessage,
  genericErrorMessage,
  errorFallbackPrefix,
  apiKey,
  submitSubject,
  endpoint,
}: ContactFormProps) {
  const [state, setState] = useState<SubmitState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!apiKey) {
      setState("error")
      setErrorMessage(genericErrorMessage)
      return
    }
    setState("loading")
    setErrorMessage(null)
    const form = e.currentTarget
    const data = new FormData(form)
    data.append("apiKey", apiKey)
    data.append("subject", submitSubject)

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data)),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message || body?.error || genericErrorMessage)
      }

      setState("success")
      form.reset()
    } catch (err) {
      setState("error")
      setErrorMessage(err instanceof Error ? err.message : genericErrorMessage)
    }
  }

  return (
    <section className="mx-auto mt-10 max-w-3xl sm:mt-16">
      <div className="glass rounded-3xl p-6 sm:p-10">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{intro}</p>

        {state === "success" ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand/10 p-4 text-sm font-medium text-foreground">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
            <span>{successMessage}</span>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                type="text"
                name="name"
                required
                placeholder={namePlaceholder}
                className="rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-brand"
              />
              <input
                type="email"
                name="email"
                required
                placeholder={emailPlaceholder}
                className="rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-brand"
              />
            </div>
            <textarea
              name="message"
              required
              rows={5}
              placeholder={messagePlaceholder}
              className="rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-brand"
            />
            {/* honeypot field for spam bots */}
            <input type="text" name="honeypot" className="hidden" tabIndex={-1} autoComplete="off" />

            <button
              type="submit"
              disabled={state === "loading"}
              className="inline-flex w-fit items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-lg disabled:opacity-60"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              <Send className="h-4 w-4" aria-hidden />
              {state === "loading" ? submitPendingLabel : submitLabel}
            </button>

            {state === "error" && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {errorMessage || genericErrorMessage} {errorFallbackPrefix}{" "}
                  <a href={`mailto:${email}`} className="underline">
                    {email}
                  </a>
                  .
                </span>
              </div>
            )}
          </form>
        )}
      </div>

      <div className="mt-6 glass rounded-2xl p-6">
        <h2 className="font-display text-lg font-bold">{topicsTitle}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {topics.map((topic) => (
            <li key={topic} className="flex items-start gap-2 text-sm text-foreground/85">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
              {topic}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Small mail icon re-exported for callers that want a matching CTA link elsewhere on the page. */
export { Mail as ContactMailIcon }
