import type { BrandData } from "./types"

export interface BrandProps {
  /** Brand strings and logo image, fully i18n-ready */
  data: BrandData
  /** Additional class names merged onto the root anchor */
  className?: string
}

/**
 * Site logo + wordmark, linking back to the homepage.
 * Pure presentation — all strings and the logo image come from `data`.
 */
export function Brand({ data, className }: BrandProps) {
  return (
    <a
      href={data.toHome}
      aria-label={data.ariaLabel}
      className={`flex items-center gap-2 font-display text-lg font-bold tracking-tight${className ? ` ${className}` : ""}`}
    >
      <img
        src={data.logoSrc}
        alt={data.mark}
        height="30px"
        loading="lazy"
        className="block h-7.5 w-auto"
      />
      <span>
        {data.wordmark.lead}
        <span className="text-gradient-brand">{data.wordmark.accent}</span>
      </span>
    </a>
  )
}
