/** page-editor.tsx 專用的 Tailwind class 常數集合，取代原本的 PageEditor.module.css。 */
export const editorStyles = {
  page: 'mx-auto max-w-[920px] px-6 pt-10 pb-16 [&_h1]:m-0 [&_h1]:mb-2.5 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:tracking-tight print:[&_.toolbar]:hidden',
  hint: 'mb-6 text-[0.8125rem] leading-relaxed text-muted-foreground/70 [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-muted-foreground',
  toolbar: 'mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden',
  toolbarActions: 'flex flex-wrap gap-2',
  backLink: 'inline-block text-[0.8125rem] text-muted-foreground/70 no-underline transition-colors duration-150 hover:text-primary',
  warning: 'text-sm text-destructive',
  pageEditor: 'mb-4 rounded-xl border border-border bg-card p-5 print:hidden',
  pageMeta: 'mb-5 flex flex-wrap gap-4',
  metaField: 'flex min-w-[160px] flex-1 flex-col gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground/70 uppercase',
  node: 'my-2.5 rounded-lg border border-border bg-secondary p-3.5 print:hidden',
  nodeNested: 'border-l-2 border-l-primary/25 bg-card/60',
  depthBadge:
    'rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[0.625rem] font-bold text-muted-foreground/70',
  nodeHeader: 'mb-2.5 flex flex-wrap items-center gap-2',
  kindBadge: 'rounded-full border border-border bg-card px-2.5 py-1 text-[0.625rem] font-bold tracking-wide text-muted-foreground uppercase',
  kindBadgeComponent: 'border-info/25 bg-info/10 text-info',
  kindBadgeText: 'border-primary/25 bg-primary/10 text-primary',
  headerActions: 'ml-auto flex gap-1.5',
  select:
    'rounded-md border border-border bg-secondary px-2 py-1.5 font-sans text-[0.8125rem] text-foreground outline-none focus:border-primary',
  textInput:
    'box-border w-full resize-y rounded-md border border-border bg-card p-2.5 font-sans text-sm text-foreground outline-none focus:border-primary',
  textFieldInput:
    'box-border w-full rounded-md border border-border bg-card px-2.5 py-2 font-mono text-sm font-normal tracking-normal text-foreground normal-case outline-none focus:border-primary',
  propsGrid: 'my-2.5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 rounded-md border border-dashed border-border bg-card p-3',
  propField: 'flex flex-col gap-1',
  propLabel: 'flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted-foreground',
  propType: 'font-mono text-[0.6875rem] text-muted-foreground/70',
  required: 'text-destructive',
  childrenBlock: 'mt-2.5 border-l-2 border-border pl-3',
  childrenHeader: 'mb-2 flex items-center justify-between text-xs font-bold tracking-wide text-muted-foreground/70 uppercase',
  emptyHint: 'text-[0.8125rem] text-muted-foreground/70 italic',
  iconBtn:
    'cursor-pointer rounded-md border border-border bg-secondary px-2.5 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-muted-foreground hover:bg-card hover:text-foreground',
  smallBtn:
    'cursor-pointer rounded-md border border-border bg-secondary px-2.5 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-muted-foreground hover:bg-card hover:text-foreground',
  iconBtnDanger:
    'cursor-pointer rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 font-sans text-xs font-medium text-destructive transition-colors duration-150 hover:bg-destructive/20',
  primaryBtn:
    'cursor-pointer rounded-md border border-primary bg-primary px-2.5 py-1.5 font-sans text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90',
  jsonPreview: 'mt-7 print:block',
  jsonBlock:
    'overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-[0.8125rem] break-words whitespace-pre-wrap text-muted-foreground',
  pageDetails: 'mb-3.5 rounded-xl border border-border bg-card p-3.5 print:hidden',
  pageSummary: 'flex cursor-pointer items-center gap-2 font-bold text-foreground',
  id: 'font-mono text-[0.85em] font-normal text-muted-foreground/70',
  successBtn:
    'cursor-pointer rounded-md border border-success bg-success px-2.5 py-1.5 font-sans text-xs font-semibold text-success-foreground transition-colors duration-150 hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-60',
  writeStatus: 'mt-2.5 text-[0.8125rem] leading-relaxed print:hidden',
  writeStatusSuccess: 'text-success',
  writeStatusError: 'text-destructive',
  addKeyRow: 'mb-4 flex gap-2',
  i18nStatus:
    'inline-flex max-w-full items-center gap-1 rounded-full border border-primary/25 bg-primary/10 py-0.5 pr-1 pl-2 font-mono text-[0.6875rem] text-primary',
  i18nStatusRemove:
    'flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded-full text-primary/70 leading-none hover:bg-primary/20 hover:text-primary',
  dragHandle:
    'flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/50 transition-colors duration-150 hover:bg-card hover:text-muted-foreground active:cursor-grabbing',
  nodeDragging: 'opacity-40',
  nodeDropBefore: 'border-t-2 border-t-primary',
  nodeDropAfter: 'border-b-2 border-b-primary',
};