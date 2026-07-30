import type { ReactNode } from "react"


export interface LayoutProps {
  /** Data for the sticky header, forwarded to <Header /> */
  header?: ReactNode
  /** Data for the footer, forwarded to <Footer /> */
  footer?: ReactNode
  /** Page content rendered between the header and footer */
  children?: ReactNode
}

/**
 * Page chrome shared by every route: decorative aurora background, sticky
 * header, main content slot and footer.
 *
 * This is a component like any other block — it takes no data from
 * context, only from props — so it is generated into `components.json`
 * and can itself be a `pages.json` node (e.g. the root node every page
 * is nested inside). All copy/links come from `header`/`footer`.
 */
export function Layout({ header, footer, children }: LayoutProps) {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div aria-hidden className="bg-aurora pointer-events-none fixed inset-0 -z-10" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:24px_24px]"
      />
      {header}
      <main className="px-3 sm:px-6">{children}</main>
      {footer}
    </div>
  )
}
