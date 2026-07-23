/** home.tsx 與 functions-home.tsx 共用的 hero / grid 卡片樣式。 */
export const homeStyles = {
  hero: 'mb-11 max-w-xl',
  eyebrow: 'm-0 mb-3 font-mono text-xs tracking-wider text-primary uppercase',
  title: 'm-0 mb-3 text-4xl font-extrabold tracking-tight',
  lede: 'm-0 text-[0.9375rem] leading-relaxed text-muted-foreground',
  ledeCode: 'rounded border border-border bg-secondary px-1.5 py-0.5 text-[0.8125rem] text-foreground',
  stats: 'mt-7 flex gap-8 border-t border-border pt-6',
  stat: 'flex flex-col gap-1',
  statLabel: 'text-xs text-muted-foreground/70',
  statValue: 'm-0 font-mono text-2xl font-bold',
  grid: 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4',
  card: 'flex flex-col gap-3 rounded-lg border border-border bg-card p-5 text-inherit no-underline transition-[border-color,background-color,transform] duration-150 ease-out hover:-translate-y-1 hover:border-primary/50 hover:bg-secondary',
  cardTop: 'flex items-start justify-between gap-3',
  cardTitle: 'm-0 text-[1.0625rem] font-bold tracking-tight',
  countBadge:
    'shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[0.6875rem] whitespace-nowrap text-primary',
  cardDesc: 'm-0 line-clamp-2 flex-1 text-[0.8125rem] leading-relaxed text-muted-foreground',
  cardMeta: 'border-t border-border pt-2',
  path: 'font-mono text-[0.6875rem] text-muted-foreground/70',
};
