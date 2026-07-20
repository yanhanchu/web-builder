/** theme-generator.tsx 專用的 Tailwind class 常數集合。 */
export const themeGeneratorStyles = {
  wrap: 'max-w-[1100px]',
  header: 'mb-7',
  title: 'm-0 mb-1.5 text-2xl font-extrabold tracking-tight',
  subtitle: 'm-0 max-w-[720px] text-sm leading-relaxed text-muted-foreground',

  grid: 'grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]',

  panel: 'flex flex-col gap-5 rounded-lg border border-border bg-card p-4',
  panelTitle: 'text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',

  presetGrid: 'grid grid-cols-2 gap-2',
  presetButton:
    'flex items-center gap-2 rounded-md border border-border bg-secondary px-2.5 py-2 text-left text-[0.8125rem] font-medium text-foreground transition-colors duration-150 hover:border-muted-foreground',
  presetButtonActive: 'border-primary/60 bg-primary/10',
  presetSwatch: 'size-3.5 shrink-0 rounded-full border border-border/60',

  field: 'flex flex-col gap-1.5',
  fieldLabelRow: 'flex items-center justify-between gap-2',
  fieldLabel: 'text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
  fieldLabelWithLock: 'flex items-center gap-1.5',
  fieldValue: 'font-mono text-[0.75rem] text-muted-foreground',
  slider: 'w-full accent-primary disabled:opacity-40',
  select:
    'w-full rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground',
  input:
    'w-full rounded-md border border-border bg-secondary px-2.5 py-[0.4375rem] font-sans text-[0.8125rem] text-foreground outline-none focus:border-muted-foreground disabled:opacity-40',

  lockButton:
    'flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors duration-150 hover:text-foreground',
  lockButtonActive: 'border-primary/60 bg-primary/10 text-primary',

  shuffleRow: 'flex items-center gap-2 rounded-lg border border-border bg-card p-3',
  shuffleButton:
    'flex-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-[0.8125rem] font-semibold text-foreground transition-colors duration-150 hover:bg-primary/20',
  resetButton:
    'shrink-0 rounded-md border border-border bg-secondary px-3 py-2 text-[0.8125rem] font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground',

  previewArea: 'flex flex-col gap-5',
  previewTabsRow: 'flex items-center gap-2',
  previewTab:
    'rounded-md border border-border bg-secondary px-3 py-1.5 text-[0.8125rem] font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground',
  previewTabActive: 'border-primary/60 bg-primary/10 text-foreground',

  swatchRow: 'flex flex-wrap gap-3',
  swatchCard: 'flex flex-col items-center gap-1.5',
  swatchBox: 'size-12 rounded-md border border-border/60 shadow-sm',
  swatchLabel: 'text-[0.6875rem] text-muted-foreground',

  mockCard: 'rounded-lg border p-5',
  mockHeading: 'm-0 mb-1 text-lg font-bold',
  mockText: 'm-0 mb-4 text-sm',
  mockButtonRow: 'flex flex-wrap gap-2',
  mockPrimaryButton: 'rounded-md px-3.5 py-2 text-sm font-semibold',
  mockSecondaryButton: 'rounded-md border px-3.5 py-2 text-sm font-semibold',
  mockBadge: 'rounded-full px-2.5 py-1 text-xs font-semibold',

  codeBlockWrap: 'relative',
  codeToolbar: 'mb-2 flex items-center justify-between',
  codeActions: 'flex gap-2',
  actionButton:
    'shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-[0.4375rem] text-[0.8125rem] font-semibold text-foreground transition-colors duration-150 hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
  code:
    'max-h-[560px] overflow-auto rounded-lg border border-border bg-secondary p-4 font-mono text-[0.75rem] leading-relaxed whitespace-pre text-foreground',
  hint: 'mt-1 text-xs text-muted-foreground',

  showcaseWrap: 'rounded-lg border p-5',
  showcaseSectionTitle: 'm-0 mb-3 text-[0.6875rem] font-bold tracking-wider uppercase opacity-70',
  showcaseRow: 'flex flex-wrap items-center gap-2.5',
  showcaseGrid: 'grid grid-cols-1 gap-3 sm:grid-cols-2',
  showcaseGap: 'mt-5',

  // 頁面上方「資料同步」區塊（每個 app 各自一份 data/{app}/theme.json + styles.css）
  syncBar:
    'mb-6 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between',
  syncBarInfo: 'flex flex-col gap-1',
  syncBarTitle: 'text-[0.6875rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
  syncBarPath: 'font-mono text-[0.8125rem] text-foreground',
  syncBarActions: 'flex flex-wrap items-center gap-2',

  // UI 增加樣式呈現用的展示元件（純 CSS 變數驅動，不依賴額外套件）
  showcaseTabsRow: 'flex items-center gap-1 rounded-lg bg-secondary p-1',
  showcaseTabButton:
    'rounded-md px-3 py-1.5 text-[0.8125rem] font-semibold text-muted-foreground transition-colors duration-150',
  showcaseTabButtonActive: 'bg-card text-foreground shadow-sm',

  showcaseToggleRow: 'flex items-center gap-2.5',
  showcaseToggleTrack: 'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150',
  showcaseToggleThumb: 'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-150',

  showcaseProgressTrack: 'h-2 w-full overflow-hidden rounded-full bg-secondary',
  showcaseProgressFill: 'h-full rounded-full transition-[width] duration-300',

  showcaseChipRow: 'flex flex-wrap gap-2',
  showcaseChip:
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150',

  // 顏色選擇器（<input type="color"> 調色盤 + hue 數值同步顯示）
  colorPickerRow: 'flex items-center gap-2.5',
  colorSwatchInput:
    'size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-40',
  colorHueReadout: 'font-mono text-[0.75rem] text-muted-foreground',

  // Glassmorphism / Neumorphism 效果產生器區塊
  effectSection: 'flex flex-col gap-3 rounded-lg border border-border bg-card p-4',
  effectHeaderRow: 'flex items-center justify-between gap-2',
  effectCheckboxLabel: 'flex cursor-pointer items-center gap-2 text-[0.8125rem] font-semibold text-foreground',
  effectCheckbox: 'size-4 cursor-pointer accent-primary',
  effectBody: 'flex flex-col gap-3 pl-0.5',
  effectSliderRow: 'flex flex-col gap-1.5',
  effectRadioRow: 'flex items-center gap-3 text-[0.8125rem] text-foreground',
  effectRadioLabel: 'flex cursor-pointer items-center gap-1.5',
  effectPreviewWrap: 'relative mt-1 flex min-h-[104px] items-center justify-center overflow-hidden rounded-lg p-4',
  effectPreviewCard: 'w-full max-w-[220px] rounded-lg p-4 text-center text-[0.8125rem] font-semibold',
};
