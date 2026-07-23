export interface AvatarProps {
  /** Image URL. Falls back to initials when omitted or broken. */
  src?: string
  /** Full name used to derive fallback initials and the alt text */
  name: string
  /** Diameter of the avatar in pixels */
  size?: number
  /** Shows a small colored ring around the avatar, e.g. for online status */
  ringColor?: string
}

function getInitials(name: string): string {
  if (typeof name !== "string" || !name.trim()) return ""
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}

/** Displays a user's profile image, falling back to initials on error or when no src is given. */
export function Avatar({ src, name, size = 40, ringColor, ...rest }: AvatarProps & Record<string, unknown>) {
  return (
    <span
      {...rest}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/60 font-sans font-bold text-primary-foreground"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        boxShadow: ringColor
          ? `0 0 0 2px var(--background), 0 0 0 4px ${ringColor}`
          : undefined,
      }}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-label={name}>{getInitials(name)}</span>
      )}
    </span>
  )
}