/** file-manager.tsx 專用的 Tailwind class 常數集合。 */
export const fileManagerStyles = {
  wrap: 'max-w-[1100px]',
  header: 'mb-7',
  title: 'm-0 mb-1.5 text-2xl font-extrabold tracking-tight',
  subtitle: 'm-0 max-w-[640px] text-sm leading-relaxed text-muted-foreground',

  toolbar: 'mb-4 flex flex-wrap items-center justify-between gap-3',
  toolbarLeft: 'flex flex-wrap items-center gap-2',
  count: 'text-[0.8125rem] text-muted-foreground',
  search:
    'min-w-[200px] rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',
  viewToggle: 'flex gap-1 rounded-md border border-border bg-secondary p-0.5',
  viewToggleBtn:
    'rounded px-2.5 py-1 text-[0.75rem] font-medium text-muted-foreground transition-colors duration-150',
  viewToggleBtnActive: 'bg-card text-foreground shadow-sm',
  checkboxLabel: 'flex cursor-pointer items-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground',

  dropzone:
    'mb-5 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card px-6 py-10 text-center transition-colors duration-150',
  dropzoneActive: 'border-primary/60 bg-primary/5',
  dropzoneIcon: 'text-3xl text-muted-foreground/50',
  dropzoneText: 'flex flex-col gap-1',
  dropzoneTitle: 'text-sm font-semibold text-foreground',
  dropzoneHint: 'text-xs text-muted-foreground',
  dropzoneActions: 'mt-2 flex flex-wrap items-center justify-center gap-2',
  btn: 'rounded-md border border-border bg-secondary px-3 py-[0.4375rem] text-[0.8125rem] font-medium text-foreground transition-colors duration-150 hover:bg-accent/10',
  btnPrimary:
    'rounded-md border border-primary/40 bg-primary/10 px-3 py-[0.4375rem] text-[0.8125rem] font-semibold text-foreground transition-colors duration-150 hover:bg-primary/20',
  btnGhost:
    'rounded-md border border-transparent px-2.5 py-[0.4375rem] text-[0.8125rem] font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground',

  // 卡片式（grid）檢視
  grid: 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
  card: 'group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors duration-150 hover:border-muted-foreground/40',
  cardSelected: 'border-primary/60 ring-1 ring-primary/40',
  cardSelectCheckbox:
    'absolute top-1.5 left-1.5 z-10 flex size-6 cursor-pointer items-center justify-center rounded-md bg-background/90 shadow-sm',
  cardThumb: 'flex aspect-square items-center justify-center overflow-hidden bg-secondary',
  cardThumbImg: 'size-full object-cover',
  cardThumbIcon: 'text-3xl text-muted-foreground/50',
  cardBody: 'flex flex-1 flex-col gap-0.5 p-2.5',
  cardName: 'truncate text-[0.8125rem] font-medium text-foreground',
  cardMeta: 'truncate text-[0.6875rem] text-muted-foreground',
  cardActions:
    'absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100',
  cardIconBtn:
    'flex size-6 items-center justify-center rounded-md bg-background/90 text-xs text-foreground shadow-sm hover:bg-background',
  cardIconBtnDanger: 'hover:text-destructive',

  // 表格式（list）檢視
  table: 'w-full border-collapse overflow-hidden rounded-lg border border-border',
  thead: 'bg-secondary',
  th: 'border-b border-border px-3 py-2 text-left text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
  td: 'border-b border-border px-3 py-2 align-middle text-[0.8125rem] text-foreground',
  tr: 'transition-colors duration-150 hover:bg-secondary/50',
  trSelected: 'bg-primary/5',
  thumbCell: 'flex size-10 items-center justify-center overflow-hidden rounded-md bg-secondary',
  thumbImg: 'size-full object-cover',
  thumbIcon: 'text-base text-muted-foreground/50',
  nameCell: 'font-medium',
  descCell: 'text-muted-foreground/80',
  metaCell: 'text-muted-foreground',
  actionsCell: 'flex justify-end gap-2',
  removeButton:
    'rounded-md border border-border bg-transparent px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:border-destructive/40 hover:text-destructive',

  empty: 'rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground',

  // 儲存位置徽章（OPFS / 已同步到磁碟 / 已同步到 S3）與同步按鈕
  badge: 'inline-block rounded px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase',
  badgeOpfs: 'bg-secondary text-muted-foreground',
  badgeDisk: 'bg-primary/10 text-foreground',
  badgeS3: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  badgeRow: 'flex flex-wrap gap-1',
  syncBtn:
    'rounded-md border border-border bg-transparent px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:border-primary/40 hover:text-foreground disabled:opacity-50',

  // 「上傳目的地管理」面板：讓使用者用 icon 按鈕勾選「上傳後自動同步到」哪些目的地，
  // 選中時整顆按鈕變色，取代原本散落在每個檔案項目上的「上傳到本機/S3」按鈕。
  targetPanel: 'mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3',
  targetPanelLabel: 'mr-1 text-[0.75rem] font-semibold text-muted-foreground',
  targetBtn:
    'flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-muted-foreground/60',
  targetBtnActiveDisk: 'border-primary/60 bg-primary/10 text-foreground',
  targetBtnActiveS3: 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  targetBtnIcon: 'text-sm',
  targetPanelHint: 'basis-full text-[0.6875rem] text-muted-foreground/70',

  // 編輯 / 預覽彈窗
  modalOverlay: 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4',
  modal: 'flex max-h-[85vh] w-full max-w-[560px] flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl',
  modalHeader: 'flex items-center justify-between gap-3',
  modalTitle: 'm-0 text-base font-bold text-foreground',
  modalClose: 'rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground',
  modalPreview: 'flex max-h-[320px] items-center justify-center overflow-hidden rounded-md bg-secondary',
  modalPreviewImg: 'max-h-[320px] w-full object-contain',
  modalField: 'flex flex-col gap-1',
  modalFieldLabel: 'text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
  modalInput:
    'rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',
  modalTextarea:
    'min-h-[72px] resize-y rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',
  modalMetaRow: 'flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-muted-foreground',
  modalFooter: 'flex justify-end gap-2',

  toast:
    'fixed right-5 bottom-5 z-50 rounded-md border border-border bg-card px-3.5 py-2.5 text-[0.8125rem] text-foreground shadow-lg',
};
