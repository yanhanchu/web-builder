/** app-settings.tsx 專用的 Tailwind class 常數集合，風格對齊 i18n-styles.ts / page-editor-styles.ts。 */
export const appStyles = {
  page: 'mx-auto max-w-[920px] px-6 pt-10 pb-16 [&_h1]:m-0 [&_h1]:mb-2.5 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:tracking-tight',
  hint: 'mb-6 max-w-[680px] text-[0.8125rem] leading-relaxed text-muted-foreground/70 [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-muted-foreground',
  toolbar: 'mb-6 flex flex-wrap items-center justify-between gap-4',
  toolbarActions: 'flex flex-wrap gap-2',
  backLink: 'inline-block text-[0.8125rem] text-muted-foreground/70 no-underline transition-colors duration-150 hover:text-primary',

  warning: 'text-sm text-destructive',

  addKeyRow: 'mb-6 flex gap-2',
  input: 'min-w-0 flex-1 rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',
  textFieldInput:
    'box-border w-full rounded-md border border-border bg-card px-2.5 py-2 font-mono text-sm font-normal tracking-normal text-foreground normal-case outline-none focus:border-primary',
  select:
    'box-border w-full cursor-pointer rounded-md border border-border bg-card px-2.5 py-2 font-sans text-sm font-normal tracking-normal text-foreground normal-case outline-none focus:border-primary',

  card: 'mb-4 rounded-xl border border-border bg-card p-5',
  cardHeader: 'mb-4 flex flex-wrap items-center justify-between gap-3',
  cardTitle: 'flex items-center gap-2 text-base font-bold text-foreground',
  id: 'font-mono text-[0.85em] font-normal text-muted-foreground/70',
  headerActions: 'flex flex-wrap gap-2',

  formGrid: 'grid grid-cols-1 gap-4 md:grid-cols-2',
  field: 'flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground/70 uppercase',
  fieldWide: 'flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground/70 uppercase md:col-span-2',

  quickLinks: 'mt-4 flex flex-wrap gap-2 border-t border-border pt-4',

  smallBtn:
    'cursor-pointer rounded-md border border-border bg-secondary px-2.5 py-1.5 font-sans text-xs font-medium text-muted-foreground no-underline transition-colors duration-150 hover:border-muted-foreground hover:bg-card hover:text-foreground',
  primaryBtn:
    'cursor-pointer rounded-md border border-primary bg-primary px-2.5 py-1.5 font-sans text-xs font-semibold text-primary-foreground no-underline transition-colors duration-150 hover:bg-primary/90',
  successBtn:
    'cursor-pointer rounded-md border border-success bg-success px-2.5 py-1.5 font-sans text-xs font-semibold text-success-foreground transition-colors duration-150 hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-60',
  iconBtnDanger:
    'cursor-pointer rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 font-sans text-xs font-medium text-destructive transition-colors duration-150 hover:bg-destructive/20',

  emptyHint: 'text-[0.8125rem] text-muted-foreground/70 italic',

  writeStatus: 'mt-2.5 text-[0.8125rem] leading-relaxed',
  writeStatusSuccess: 'text-success',
  writeStatusError: 'text-destructive',

  toast:
    'fixed right-6 bottom-6 z-[100] max-w-[360px] rounded-lg border border-muted-foreground/40 bg-card px-4 py-3 text-[0.8125rem] text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)]',

  // 可收合區塊（用於「進階設定」內的 SEO / favicon / analytics 子區塊）
  collapsible: 'mb-4 rounded-lg border border-border bg-secondary/30 last:mb-0',
  collapsibleTrigger:
    'flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-sm font-bold text-foreground transition-colors duration-150 hover:bg-secondary/60',
  collapsibleTriggerLeft: 'flex items-center gap-2',
  collapsibleChevron: 'shrink-0 text-muted-foreground/70 transition-transform duration-150',
  collapsibleChevronOpen: 'rotate-90',
  collapsibleBody: 'space-y-4 border-t border-border px-4 py-4',
  subLabel: 'mt-1 mb-2 text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
  textarea:
    'box-border w-full resize-y rounded-md border border-border bg-card px-2.5 py-2 font-mono text-sm font-normal tracking-normal text-foreground normal-case outline-none focus:border-primary',
  checkboxRow: 'flex flex-wrap gap-4',
  checkboxLabel:
    'flex cursor-pointer items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground normal-case',
};
