/** data-manager.tsx 專用的 Tailwind class 常數集合，沿用 route-manager-styles 的風格。 */
export const dataManagerStyles = {
  wrap: 'max-w-[900px]',
  header: 'mb-7',
  title: 'm-0 mb-1.5 text-2xl font-extrabold tracking-tight',
  subtitle: 'm-0 max-w-[640px] text-sm leading-relaxed text-muted-foreground',

  typePickerRow: 'mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4',
  field: 'flex min-w-[220px] flex-1 flex-col gap-1',
  fieldLabel: 'text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
  select:
    'min-w-0 flex-1 rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',
  input:
    'min-w-0 flex-1 rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',
  addButton:
    'shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-[0.4375rem] text-[0.8125rem] font-semibold text-foreground transition-colors duration-150 hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
  errorText: 'mt-1 text-xs text-destructive',
  hintText: 'mt-1 text-xs text-muted-foreground/80',

  typeMeta: 'mb-5 rounded-lg border border-border bg-card p-4',
  typeMetaTitle: 'mb-1 text-sm font-bold text-foreground',
  typeMetaDesc: 'text-[0.8125rem] text-muted-foreground',
  typeKindPill:
    'ml-2 rounded-full border border-border bg-secondary px-2 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground',
  arrayModePill:
    'ml-2 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-foreground',

  recordCard: 'mb-3 rounded-lg border border-border bg-card p-4',
  recordCardHeader: 'mb-3 flex items-center justify-between',
  recordCardTitle: 'text-[0.8125rem] font-bold text-foreground',
  fieldGrid: 'grid grid-cols-1 gap-3 sm:grid-cols-2',
  fieldWrap: 'flex flex-col gap-1',
  fieldRowLabel: 'flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
  requiredMark: 'text-destructive',
  unsupportedNote: 'rounded-md border border-dashed border-border bg-secondary/50 px-2.5 py-[0.4375rem] text-[0.75rem] text-muted-foreground',
  checkboxRow: 'flex items-center gap-2 py-[0.4375rem] text-[0.8125rem] text-foreground',

  actionsRow: 'flex justify-end gap-2',
  saveButton:
    'rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors duration-150 hover:bg-primary/20',
  removeButton:
    'rounded-md border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:border-destructive/40 hover:text-destructive',
  addRecordButton:
    'mb-5 rounded-md border border-primary/40 bg-primary/10 px-3 py-[0.4375rem] text-[0.8125rem] font-semibold text-foreground transition-colors duration-150 hover:bg-primary/20',

  empty: 'rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground',
};
