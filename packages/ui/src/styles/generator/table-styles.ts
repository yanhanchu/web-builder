/**
 * PropsTable 與 TypeCard 共用的表格樣式 class（原本透過 CSS Module 共用，
 * 改用 Tailwind 後集中放在這裡，維持兩者視覺一致）。
 */
export const tableStyles = {
  wrap: 'overflow-hidden rounded-xl border border-border bg-card',
  table: 'w-full border-collapse text-[0.8125rem]',
  th: 'border-b border-border bg-secondary px-[1.1rem] py-3 text-left text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
  tr: 'border-b border-border last:border-b-0 hover:bg-primary/[0.03]',
  td: 'px-[1.1rem] py-3.5 align-top text-muted-foreground',
  nameCell: 'flex flex-wrap items-center gap-2',
  name: 'font-mono text-[0.8125rem] font-semibold text-foreground',
  required:
    'rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-primary uppercase',
  default: 'font-mono text-xs text-muted-foreground',
  description: 'max-w-[360px] leading-relaxed text-muted-foreground',
  dash: 'text-muted-foreground/70',
  empty: 'rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground',
  editInput:
    'w-full min-w-[90px] rounded-md border border-border bg-secondary px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary',
  editTextarea:
    'w-full resize-y rounded-md border border-border bg-secondary px-2.5 py-2 font-sans text-[0.8125rem] leading-relaxed text-foreground outline-none focus:border-primary',
  editActions: 'flex gap-2',
  saveButton:
    'cursor-pointer rounded-md border-none bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60',
  cancelButton: 'cursor-pointer rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs text-muted-foreground',
  saveHint: 'text-xs text-primary',
  saveError: 'text-xs text-destructive',
};
