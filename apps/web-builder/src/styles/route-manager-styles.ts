/** route-manager.tsx 專用的 Tailwind class 常數集合。 */
export const routeManagerStyles = {
  wrap: 'max-w-[900px]',
  header: 'mb-7',
  title: 'm-0 mb-1.5 text-2xl font-extrabold tracking-tight',
  subtitle: 'm-0 max-w-[640px] text-sm leading-relaxed text-muted-foreground',

  addRow: 'mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4',
  field: 'flex min-w-[160px] flex-1 flex-col gap-1',
  fieldLabel: 'text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
  input:
    'min-w-0 flex-1 rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',
  select:
    'min-w-0 flex-1 rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',
  addButton:
    'shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-[0.4375rem] text-[0.8125rem] font-semibold text-foreground transition-colors duration-150 hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
  errorText: 'mt-1 text-xs text-destructive',
  hintText: 'mt-1 text-xs text-destructive',
  targetTypeRow: 'flex items-center gap-3 py-[0.4375rem] text-[0.8125rem] text-foreground',
  targetTypeOption: 'flex cursor-pointer items-center gap-1.5',

  table: 'w-full border-collapse overflow-hidden rounded-lg border border-border',
  thead: 'bg-secondary',
  th: 'border-b border-border px-3 py-2 text-left text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
  td: 'border-b border-border px-3 py-2 align-middle text-[0.8125rem] text-foreground',
  tr: 'transition-colors duration-150 hover:bg-secondary/50',
  pathCell: 'font-mono text-[0.8125rem]',
  pageCell: 'text-muted-foreground',
  descriptionCell: 'text-muted-foreground/80 text-[0.8125rem]',
  actionsCell: 'flex justify-end gap-2',
  removeButton:
    'rounded-md border border-border bg-transparent px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:border-destructive/40 hover:text-destructive',

  empty: 'rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground',
};
