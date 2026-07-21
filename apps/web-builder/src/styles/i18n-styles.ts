/** i18n-manager.tsx 專用的 Tailwind class 常數集合，取代原本的 I18nManager.module.css。 */
export const i18nStyles = {
  wrap: 'max-w-[1200px]',
  header: 'mb-7',
  title: 'm-0 mb-1.5 text-2xl font-extrabold tracking-tight',
  subtitle: 'm-0 max-w-[640px] text-sm leading-relaxed text-muted-foreground',
  layout: 'grid grid-cols-1 items-start gap-6',

  // sidebar
  nsPanel: 'sticky top-6 flex flex-col gap-3 rounded-lg border border-border bg-card p-4',
  panelLabel: 'm-0 flex justify-between text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
  count: 'font-mono text-muted-foreground',
  nsList: 'flex max-h-[40vh] flex-col gap-1 overflow-y-auto',
  nsItem:
    'flex w-full items-center gap-2 rounded-md border-none bg-transparent px-2 py-2 text-left text-[0.8125rem] font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground',
  nsItemActive: 'bg-secondary text-foreground [&_.ns-dot]:bg-primary',
  nsDot: 'ns-dot size-[5px] shrink-0 rounded-full bg-border',
  nsName: 'flex-1 truncate',
  nsMeta: 'shrink-0 font-mono text-[0.6875rem] text-muted-foreground/70',
  addRow: 'flex gap-1.5',

  // main
  main: 'min-w-0',
  toolbar: 'mb-4 flex flex-wrap items-center justify-between gap-3',
  localeChips: 'flex flex-wrap items-center gap-1.5',
  chipsHint: 'mr-0.5 text-xs text-muted-foreground/70',
  localeChip:
    'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-secondary py-1 pr-1 pl-2 font-mono text-xs text-muted-foreground transition-colors duration-150',
  localeChipOn: 'border-primary/40 bg-primary/10 text-foreground',
  localeChipOff: 'opacity-60 hover:opacity-100',
  chipCheck: 'inline-flex w-3 items-center justify-center text-[0.6875rem] text-primary',
  chipRemove: 'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-base leading-none text-muted-foreground/70 hover:bg-secondary hover:text-destructive',
  search: 'min-w-[220px] max-w-[320px] flex-1',
  ioRow: 'mb-5 flex flex-wrap gap-6 rounded-lg border border-border bg-card px-4 py-3.5',
  ioGroup: 'flex items-center gap-2',
  ioLabel: 'text-xs whitespace-nowrap text-muted-foreground/70',

  // inputs / buttons
  input: 'min-w-0 flex-1 rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',
  inputSmall: 'w-[140px] rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',
  select: 'rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',

  btn: 'cursor-pointer rounded-md border border-border bg-secondary px-3 py-[0.4375rem] text-[0.8125rem] font-semibold whitespace-nowrap text-foreground hover:bg-card',
  btnPrimary: 'cursor-pointer rounded-md border border-primary bg-primary px-3 py-[0.4375rem] text-[0.8125rem] font-semibold whitespace-nowrap text-primary-foreground hover:bg-primary/90',
  btnGhost:
    'cursor-pointer rounded-md border border-border bg-transparent px-3 py-[0.4375rem] text-[0.8125rem] font-semibold whitespace-nowrap text-muted-foreground hover:border-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground disabled:hover:border-border',
  btnDanger: 'cursor-pointer rounded-md border border-destructive bg-transparent px-3 py-[0.4375rem] text-[0.8125rem] font-semibold whitespace-nowrap text-destructive hover:bg-destructive/10',
  linkBtn: 'ml-2 cursor-pointer border-none bg-transparent p-0 text-[0.6875rem] font-semibold text-info underline',

  // dropzone / paste import
  dropzone:
    'mb-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border-[1.5px] border-dashed border-border bg-card p-5 transition-colors duration-150',
  dropzoneActive: 'border-primary bg-primary/[0.06]',
  dropzoneText: 'flex flex-col gap-0.5 text-[0.8125rem] text-muted-foreground',
  dropzoneActions: 'flex flex-wrap items-center gap-2',
  pasteArea: 'mt-2 flex w-full flex-col gap-2.5',
  pasteTextarea:
    'w-full resize-y rounded-md border border-border bg-secondary px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-muted-foreground',

  // key list
  listToolbar: 'mb-2.5 flex flex-wrap items-center justify-between gap-3',
  listCount: 'text-xs text-muted-foreground/70',
  listToolbarActions: 'flex flex-wrap items-center gap-3',
  sortLabel: 'inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground/70',
  pagination: 'mt-4 flex flex-wrap items-center justify-center gap-3 border-t border-border pt-4',
  pageInfo: 'font-mono text-[0.8125rem] whitespace-nowrap text-muted-foreground',
  keyList: 'flex flex-col gap-2',
  keyCard: 'overflow-hidden rounded-lg border border-border bg-card open:border-muted-foreground',
  keySummary:
    'flex list-none items-center gap-2.5 bg-secondary px-3 py-2 [&::-webkit-details-marker]:hidden',
  summaryMeta: 'shrink-0 text-[0.6875rem] whitespace-nowrap text-muted-foreground/70',
  keyBody: 'flex flex-col gap-2.5 p-3',
  localeField: 'flex flex-col gap-1',
  localeFieldLabel: 'flex items-center justify-between font-mono text-[0.6875rem] text-primary',
  keyInput:
    'min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 font-mono text-[0.8125rem] text-primary outline-none hover:border-border hover:bg-secondary focus:border-border focus:bg-secondary',
  valueInput:
    'w-full resize-y rounded-md border border-border bg-secondary px-2.5 py-2 font-sans text-[0.8125rem] text-foreground outline-none hover:border-muted-foreground focus:border-muted-foreground',
  valueInputError:
    'border-destructive hover:border-destructive focus:border-destructive',
  valueError: 'text-[0.6875rem] text-destructive',
  iconDelete: 'shrink-0 cursor-pointer rounded-md border-none bg-transparent px-2 py-1 text-[0.6875rem] text-muted-foreground/70 hover:bg-secondary hover:text-destructive',
  emptyCell: 'p-8 text-center text-[0.8125rem] text-muted-foreground/70',
  empty: 'text-[0.8125rem] leading-relaxed text-muted-foreground/70',
  addKeyRow: 'mt-4 flex gap-2',

  // 版本管理
  versionPanel: 'mb-5 rounded-lg border border-border bg-card p-4',
  versionPanelHeader: 'mb-3 flex flex-wrap items-center justify-between gap-3',
  versionPanelTitle: 'm-0 text-sm font-bold text-foreground',
  versionPanelHint: 'm-0 text-[0.75rem] leading-relaxed text-muted-foreground/70',
  versionCreateRow: 'mb-3 flex flex-wrap gap-2',
  versionList: 'flex flex-col gap-1.5',
  versionItem:
    'flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-[0.8125rem]',
  versionItemLatest: 'border-primary/40 bg-primary/10',
  versionBadge:
    'shrink-0 rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[0.625rem] font-bold text-muted-foreground',
  versionBadgeLatest: 'border-primary/40 bg-primary/15 text-primary',
  versionLabel: 'min-w-0 flex-1 truncate font-semibold text-foreground',
  versionMeta: 'shrink-0 font-mono text-[0.6875rem] text-muted-foreground/70',
  versionActions: 'flex shrink-0 flex-wrap gap-1.5',
  versionEmpty: 'text-[0.8125rem] leading-relaxed text-muted-foreground/70',
  diffPicker: 'mb-3 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground',
  diffSummary: 'mb-3 flex flex-wrap items-center gap-3',
  diffLocaleBlock: 'mb-3 rounded-md border border-border bg-secondary p-3 last:mb-0',
  diffLocaleTitle: 'mb-2 font-mono text-[0.75rem] font-bold text-primary',
  diffEntry: 'mb-1.5 rounded border-l-2 pl-2 py-1 font-mono text-[0.75rem] leading-relaxed last:mb-0',
  diffEntryAdded: 'border-l-success bg-success/10 text-foreground',
  diffEntryRemoved: 'border-l-destructive bg-destructive/10 text-foreground',
  diffEntryChanged: 'border-l-info bg-info/10 text-foreground',
  diffKeyLabel: 'font-bold',
  diffOldValue: 'text-destructive line-through',
  diffNewValue: 'text-success',

  // toast
  toast:
    'fixed right-6 bottom-6 z-[100] max-w-[360px] rounded-lg border border-muted-foreground/40 bg-card px-4 py-3 text-[0.8125rem] text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
};