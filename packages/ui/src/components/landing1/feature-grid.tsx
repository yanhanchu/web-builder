import {
  CloudCog,
  Combine,
  Database,
  Download,
  FileCode2,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  Keyboard,
  Layers,
  LayoutGrid,
  MousePointer2,
  Package,
  Palette,
  Ruler,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Upload,
  type LucideIcon,
} from "lucide-react"

const iconMap = {
  Keyboard,
  FileText,
  LayoutGrid,
  MousePointer2,
  Palette,
  FolderKanban,
  Download,
  Upload,
  CloudSync: CloudCog,
  RotateCw,
  Ruler,
  SlidersHorizontal,
  Layers,
  Package,
  Combine,
  FileCode2,
  Table2,
  Database,
  Image: ImageIcon,
} as const

export interface FeatureItem {
  /** Feature title */
  title: string
  /** Feature description */
  body: string
  /** Icon shown above the title, by name */
  icon: keyof typeof iconMap
}

export interface FeatureGridProps {
  /** Section heading */
  title: string
  /** Supporting copy under the heading */
  subtitle: string
  /** Feature cards, in display order */
  items: FeatureItem[]
}

/**
 * Responsive grid of feature cards: icon, title and description. All
 * content is supplied by the caller; each item picks its own icon by
 * name so the mapping doesn't depend on array order.
 */
export function FeatureGrid({ title, subtitle, items }: FeatureGridProps) {
  return (
    <section className="mx-auto mt-12 max-w-6xl">
      <header className="mb-6 px-1">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
      </header>
      <ul className="anim-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f) => {
          const Icon: LucideIcon = iconMap[f.icon] ?? Sparkles
          return (
            <li
              key={f.title}
              className="glass flex h-full flex-col gap-3 rounded-2xl p-5 transition-all hover:-translate-y-0.5"
            >
              <div
                className="grid h-10 w-10 place-items-center rounded-xl text-brand-foreground"
                style={{ backgroundImage: "var(--gradient-brand)" }}
                aria-hidden
              >
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold tracking-tight">{f.title}</h3>
              <p className="text-sm text-foreground/80">{f.body}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
