import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Lock, Unlock, Shuffle, RotateCcw } from 'lucide-react';
import {
  DEFAULT_THEME_CONFIG,
  FONT_OPTIONS,
  THEME_PRESETS,
  type LockedMap,
  type ShufflableKey,
  type ThemeConfig,
} from '@/types/theme-types';
import {
  generateThemeCss,
  buildPreviewSwatches,
  buildPreviewCssVars,
  shuffleTheme,
} from '@/lib/theme-css-generator';
import { writeThemeToDisk as writeThemeToDiskApi, readThemeFromDisk } from '@/lib/theme-disk-api';
import { themeGeneratorStyles as styles } from '@/styles/theme-generator-styles';
import { cn } from '@workspace/ui/utils/utils';
import { Button } from '@workspace/ui/components/Button/Button';
import { Badge } from '@workspace/ui/components/Badge/Badge';
import { Card, CardHeader } from '@workspace/ui/components/Card/Card';
import { Input } from '@workspace/ui/components/Input/Input';
import { Avatar } from '@workspace/ui/components/Avatar/Avatar';

/**
 * `/theme` — 主題（tailwindcss）產生器。
 *
 * 跟 `apps/web-builder/example.css` 一樣，輸出一份 tailwindcss v4 的
 * `@theme inline` + `:root`/`.dark` oklch 變數設定檔。使用者只需要調整
 * 主色 hue/chroma、中性色 hue、圓角、兩種字型（內文/標題），就能即時
 * 預覽淺色/深色兩種模式的色票、範例元件與 @workspace/ui 組件展示，並
 * 複製或下載產生的 CSS。
 *
 * 資料同步模式跟「頁面管理（/live）」「路由管理（/routes）」一致：
 * 「寫入檔案系統」「從檔案系統讀取（覆蓋）」兩個按鈕跟 `data/theme.json`
 * 互動（見 src/lib/theme-disk-api.ts、scripts/write-theme.mjs），僅在
 * `npm run dev` 環境有效。跟 routes/pages 不同的是，主題設定不分 app，
 * 是整個 workspace 共用一份（`data/theme.json`，不在任何 `data/{app}/`
 * 底下），所以這裡不需要 `useApp()`。
 *
 * Shuffle / 鎖定：每個可調整欄位（primaryHue/primaryChroma/neutralHue/
 * radius/fontSans/fontHeading，見 ShufflableKey）旁都有一顆鎖頭按鈕。
 * 按「隨機」時，被鎖定的欄位維持原值，其餘欄位各自在合理範圍內重新
 * 取樣（見 src/lib/theme-css-generator.ts 的 shuffleTheme()）。鎖定狀態
 * 只存在畫面上（不隨 `data/theme.json` 同步），重新整理頁面會重置。
 */
type WriteBackState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

function WriteBackStatus({ state }: { state: WriteBackState }) {
  if (state.status === 'idle' || state.status === 'saving') return null;
  return (
    <p
      className={cn(
        styles.hint,
        state.status === 'success' ? 'text-green-600 dark:text-green-500' : 'text-destructive'
      )}
    >
      {state.message}
    </p>
  );
}

/** 欄位標籤 + 鎖頭切換按鈕（Shuffle 時鎖定的欄位維持原值） */
function LockableLabel({
  htmlFor,
  children,
  locked,
  onToggle,
}: {
  htmlFor: string;
  children: ReactNode;
  locked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.fieldLabelRow}>
      <label className={styles.fieldLabel} htmlFor={htmlFor}>
        {children}
      </label>
      <button
        type="button"
        className={cn(styles.lockButton, locked && styles.lockButtonActive)}
        onClick={onToggle}
        title={locked ? '已鎖定，Shuffle 時不會變動' : '未鎖定，Shuffle 時會隨機變動'}
        aria-pressed={locked}
      >
        {locked ? <Lock size={12} /> : <Unlock size={12} />}
      </button>
    </div>
  );
}

export function ThemeGenerator() {
  const [config, setConfig] = useState<ThemeConfig>(DEFAULT_THEME_CONFIG);
  const [locked, setLocked] = useState<LockedMap>({});
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [writeState, setWriteState] = useState<WriteBackState>({ status: 'idle' });
  const [readState, setReadState] = useState<WriteBackState>({ status: 'idle' });

  const css = useMemo(() => generateThemeCss(config), [config]);
  const swatches = useMemo(() => buildPreviewSwatches(config, previewMode), [config, previewMode]);
  const previewVars = useMemo(() => buildPreviewCssVars(config, previewMode), [config, previewMode]);

  function toggleLock(key: ShufflableKey) {
    setLocked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleShuffle() {
    setConfig((prev) => shuffleTheme(prev, locked));
    setCopyState('idle');
  }

  function handleReset() {
    setConfig(DEFAULT_THEME_CONFIG);
    setLocked({});
    setCopyState('idle');
  }

  function update<K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setCopyState('idle');
  }

  function applyPreset(presetId: string) {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setConfig((prev) => ({
      ...prev,
      primaryHue: preset.primaryHue,
      primaryChroma: preset.primaryChroma,
      neutralHue: preset.neutralHue,
    }));
    setCopyState('idle');
  }

  const activePresetId = THEME_PRESETS.find(
    (p) =>
      p.primaryHue === config.primaryHue &&
      p.primaryChroma === config.primaryChroma &&
      p.neutralHue === config.neutralHue
  )?.id;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(css);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  function handleDownload() {
    const blob = new Blob([css], { type: 'text/css' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'theme.css';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleWriteThemeToDisk() {
    setWriteState({ status: 'saving' });
    const result = await writeThemeToDiskApi(config);
    setWriteState(
      result.ok
        ? { status: 'success', message: `✓ 已寫入 ${result.writtenFile}` }
        : { status: 'error', message: `寫入失敗：${result.error}` }
    );
  }

  async function handleReadThemeFromDisk() {
    if (
      !window.confirm(
        '確定要用磁碟上 data/theme.json 的內容覆蓋目前畫面上的主題編輯狀態嗎？此動作無法復原（會直接覆蓋，不會 merge）。'
      )
    ) {
      return;
    }
    setReadState({ status: 'saving' });
    const result = await readThemeFromDisk();
    if (!result.ok) {
      setReadState({ status: 'error', message: `讀取失敗：${result.error}` });
      return;
    }
    if (!result.themeConfig) {
      setReadState({ status: 'error', message: '磁碟上尚未有 data/theme.json，請先寫入一次' });
      return;
    }
    setConfig(result.themeConfig);
    setCopyState('idle');
    setReadState({ status: 'success', message: '✓ 已從磁碟讀取並覆蓋目前的主題設定（data/theme.json）' });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>主題產生器</h1>
        <p className={styles.subtitle}>
          用主色 + 幾個滑桿快速生成一份跟 <code>example.css</code> 相同格式的
          tailwindcss v4 主題設定檔（<code>@theme inline</code> +{' '}
          <code>:root</code>/<code>.dark</code> oklch 變數）。純前端即時運算，
          調整左側參數即可即時預覽，滿意後複製或下載 CSS，貼回專案的
          <code> src/index.css</code> 即可套用。編輯即時反映在畫面上，另可用下方
          「寫入檔案系統」「從檔案系統讀取（覆蓋）」跟 <code>data/theme.json</code>{' '}
          互動（僅 <code>npm run dev</code> 環境有效，主題設定是整個 workspace
          共用一份，不分 app）。
        </p>
      </div>

      <div className={styles.grid}>
        {/* 左側：參數面板 */}
        <div className={styles.panel}>
          <div className={styles.shuffleRow}>
            <button type="button" className={styles.shuffleButton} onClick={handleShuffle}>
              <span className="inline-flex items-center justify-center gap-1.5">
                <Shuffle size={14} /> Shuffle 未鎖定的選項
              </span>
            </button>
            <button type="button" className={styles.resetButton} onClick={handleReset} title="重置為預設值並解除所有鎖定">
              <span className="inline-flex items-center justify-center gap-1.5">
                <RotateCcw size={14} /> 重置
              </span>
            </button>
          </div>

          <div className={styles.field}>
            <p className={styles.panelTitle}>配色預設</p>
            <div className={styles.presetGrid}>
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={cn(styles.presetButton, activePresetId === preset.id && styles.presetButtonActive)}
                  onClick={() => applyPreset(preset.id)}
                >
                  <span
                    className={styles.presetSwatch}
                    style={{ backgroundColor: `oklch(0.52 ${preset.primaryChroma} ${preset.primaryHue})` }}
                    aria-hidden="true"
                  />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <LockableLabel htmlFor="primary-hue" locked={!!locked.primaryHue} onToggle={() => toggleLock('primaryHue')}>
              主色 Hue <span className={styles.fieldValue}>{config.primaryHue}</span>
            </LockableLabel>
            <input
              id="primary-hue"
              type="range"
              min={0}
              max={360}
              step={1}
              className={styles.slider}
              value={config.primaryHue}
              disabled={!!locked.primaryHue}
              onChange={(e) => update('primaryHue', Number(e.target.value))}
            />
          </div>

          <div className={styles.field}>
            <LockableLabel
              htmlFor="primary-chroma"
              locked={!!locked.primaryChroma}
              onToggle={() => toggleLock('primaryChroma')}
            >
              主色飽和度（chroma） <span className={styles.fieldValue}>{config.primaryChroma.toFixed(3)}</span>
            </LockableLabel>
            <input
              id="primary-chroma"
              type="range"
              min={0}
              max={0.3}
              step={0.005}
              className={styles.slider}
              value={config.primaryChroma}
              disabled={!!locked.primaryChroma}
              onChange={(e) => update('primaryChroma', Number(e.target.value))}
            />
          </div>

          <div className={styles.field}>
            <LockableLabel htmlFor="neutral-hue" locked={!!locked.neutralHue} onToggle={() => toggleLock('neutralHue')}>
              中性色 Hue（背景/邊框） <span className={styles.fieldValue}>{config.neutralHue}</span>
            </LockableLabel>
            <input
              id="neutral-hue"
              type="range"
              min={0}
              max={360}
              step={1}
              className={styles.slider}
              value={config.neutralHue}
              disabled={!!locked.neutralHue}
              onChange={(e) => update('neutralHue', Number(e.target.value))}
            />
          </div>

          <div className={styles.field}>
            <LockableLabel htmlFor="radius" locked={!!locked.radius} onToggle={() => toggleLock('radius')}>
              圓角（radius） <span className={styles.fieldValue}>{config.radius.toFixed(3)}rem</span>
            </LockableLabel>
            <input
              id="radius"
              type="range"
              min={0}
              max={1.5}
              step={0.025}
              className={styles.slider}
              value={config.radius}
              disabled={!!locked.radius}
              onChange={(e) => update('radius', Number(e.target.value))}
            />
          </div>

          <div className={styles.field}>
            <LockableLabel htmlFor="font-sans" locked={!!locked.fontSans} onToggle={() => toggleLock('fontSans')}>
              內文字體（font-sans）
            </LockableLabel>
            <input
              id="font-sans"
              list="font-options"
              className={styles.input}
              value={config.fontSans}
              disabled={!!locked.fontSans}
              onChange={(e) => update('fontSans', e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <LockableLabel htmlFor="font-heading" locked={!!locked.fontHeading} onToggle={() => toggleLock('fontHeading')}>
              標題字體（font-heading）
            </LockableLabel>
            <input
              id="font-heading"
              list="font-options"
              className={styles.input}
              value={config.fontHeading}
              disabled={!!locked.fontHeading}
              onChange={(e) => update('fontHeading', e.target.value)}
            />
          </div>

          <datalist id="font-options">
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font} />
            ))}
          </datalist>
          <p className={styles.hint}>
            字型名稱需對應 <code>@fontsource-variable/*</code> 套件；下載的 CSS 會依字型名稱自動產生
            <code> @import</code> 路徑，若專案尚未安裝對應套件，需自行 <code>pnpm add</code>。
          </p>
        </div>

        {/* 右側：預覽 + 產生的 CSS */}
        <div className={styles.previewArea}>
          <div className={styles.previewTabsRow}>
            <button
              type="button"
              className={cn(styles.previewTab, previewMode === 'light' && styles.previewTabActive)}
              onClick={() => setPreviewMode('light')}
            >
              淺色預覽
            </button>
            <button
              type="button"
              className={cn(styles.previewTab, previewMode === 'dark' && styles.previewTabActive)}
              onClick={() => setPreviewMode('dark')}
            >
              深色預覽
            </button>
          </div>

          <div className={styles.swatchRow}>
            {swatches.map((s) => (
              <div key={s.key} className={styles.swatchCard}>
                <div className={styles.swatchBox} style={{ backgroundColor: s.value }} />
                <span className={styles.swatchLabel}>{s.key}</span>
              </div>
            ))}
          </div>

          <ThemeMockCard config={config} mode={previewMode} />

          <ComponentShowcase previewVars={previewVars} />

          <div className={styles.codeBlockWrap}>
            <div className={styles.codeToolbar}>
              <p className={cn(styles.panelTitle, 'normal-case tracking-normal text-foreground')}>
                產生的 CSS（{`theme.css`}）
              </p>
              <div className={styles.codeActions}>
                <button type="button" className={styles.actionButton} onClick={handleCopy}>
                  {copyState === 'copied' ? '✓ 已複製' : copyState === 'error' ? '複製失敗' : '複製 CSS'}
                </button>
                <button type="button" className={styles.actionButton} onClick={handleDownload}>
                  下載 theme.css
                </button>
              </div>
            </div>
            <pre className={styles.code}>{css}</pre>
          </div>

          <div className={cn(styles.panel, 'flex-row flex-wrap items-center gap-3')}>
            <p className={cn(styles.panelTitle, 'normal-case tracking-normal text-foreground')}>
              資料同步（{`data/theme.json`}）
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleWriteThemeToDisk}
                disabled={writeState.status === 'saving'}
              >
                {writeState.status === 'saving' ? '寫入中…' : '寫入檔案系統'}
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleReadThemeFromDisk}
                disabled={readState.status === 'saving'}
              >
                {readState.status === 'saving' ? '讀取中…' : '從檔案系統讀取（覆蓋）'}
              </button>
            </div>
            <WriteBackStatus state={writeState} />
            <WriteBackStatus state={readState} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** 用內嵌 style（而非 tailwind class）畫出套用目前設定後的範例卡片，模擬套用主題後的實際樣子 */
function ThemeMockCard({ config, mode }: { config: ThemeConfig; mode: 'light' | 'dark' }) {
  const isDark = mode === 'dark';
  const bg = isDark ? `oklch(0.148 0.004 ${config.neutralHue})` : `oklch(1 0 ${config.neutralHue})`;
  const fg = isDark ? `oklch(0.987 0.002 ${config.neutralHue})` : `oklch(0.148 0.004 ${config.neutralHue})`;
  const border = isDark ? `oklch(1 0 ${config.neutralHue} / 10%)` : `oklch(0.925 0.005 ${config.neutralHue})`;
  const primary = isDark
    ? `oklch(0.45 ${Math.max(config.primaryChroma - 0.02, 0)} ${config.primaryHue})`
    : `oklch(0.52 ${config.primaryChroma} ${config.primaryHue})`;
  const primaryFg = `oklch(0.984 0.019 ${config.primaryHue})`;
  const muted = isDark ? `oklch(0.723 0.014 ${config.neutralHue})` : `oklch(0.56 0.021 ${config.neutralHue})`;
  const radius = `${config.radius}rem`;

  return (
    <div
      className={styles.mockCard}
      style={{ backgroundColor: bg, color: fg, borderColor: border, borderRadius: radius }}
    >
      <h3 className={styles.mockHeading} style={{ fontFamily: `'${config.fontHeading}', sans-serif` }}>
        範例卡片標題
      </h3>
      <p className={styles.mockText} style={{ color: muted, fontFamily: `'${config.fontSans}', sans-serif` }}>
        這是套用目前主題設定後的範例文字，字體、圓角與色彩都會即時反映左側面板的調整。
      </p>
      <div className={styles.mockButtonRow}>
        <button
          type="button"
          className={styles.mockPrimaryButton}
          style={{ backgroundColor: primary, color: primaryFg, borderRadius: radius }}
        >
          主要按鈕
        </button>
        <button
          type="button"
          className={styles.mockSecondaryButton}
          style={{ borderColor: border, color: fg, borderRadius: radius }}
        >
          次要按鈕
        </button>
        <span className={styles.mockBadge} style={{ backgroundColor: primary, color: primaryFg }}>
          Badge
        </span>
      </div>
    </div>
  );
}

/**
 * 用 `@workspace/ui` 的真實組件（Button/Badge/Card/Input/Avatar）展示套用
 * 目前主題設定後的實際樣子。這些組件本身是用 `bg-primary`/`bg-card` 等
 * Tailwind class 讀取 CSS 變數，所以只要外層容器的 `style` 帶有對應的
 * `--primary`/`--card`/... 自訂屬性，組件就會「就地」套用這組主題，
 * 不需要修改組件本身、也不會影響 /theme 頁面其他部分的樣式。
 */
function ComponentShowcase({ previewVars }: { previewVars: Record<string, string> }) {
  return (
    <div
      className={styles.showcaseWrap}
      style={{
        ...previewVars,
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        borderColor: 'var(--border)',
      } as CSSProperties}
    >
      <p className={styles.showcaseSectionTitle}>UI 組件展示（@workspace/ui）</p>

      <div className={styles.showcaseGrid}>
        <Card>
          <CardHeader title="Card 標題" subtitle="套用目前主題後的卡片樣式" />
          <div className={styles.showcaseRow}>
            <Button variant="primary" size="sm">主要按鈕</Button>
            <Button variant="secondary" size="sm">次要按鈕</Button>
            <Button variant="ghost" size="sm">Ghost</Button>
            <Button variant="danger" size="sm">Danger</Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Badge / Avatar" subtitle="標籤與頭像展示" />
          <div className={cn(styles.showcaseRow, 'mb-3')}>
            <Badge tone="neutral">Neutral</Badge>
            <Badge tone="success" dot>Success</Badge>
            <Badge tone="warning" dot>Warning</Badge>
            <Badge tone="danger">Danger</Badge>
            <Badge tone="info">Info</Badge>
          </div>
          <div className={styles.showcaseRow}>
            <Avatar name="Ada Lovelace" size={36} />
            <Avatar name="Grace Hopper" size={36} ringColor="var(--primary)" />
            <Avatar name="Alan Turing" size={36} />
          </div>
        </Card>
      </div>

      <div className={cn(styles.showcaseGrid, styles.showcaseGap)}>
        <Card>
          <CardHeader title="Input 表單元件" subtitle="標籤 / 輔助文字 / 錯誤狀態" />
          <div className="flex flex-col gap-3">
            <Input label="網站名稱" placeholder="My Awesome Site" size="sm" />
            <Input label="Email" placeholder="you@example.com" helperText="用於接收通知信件" size="sm" />
            <Input label="API Key" placeholder="sk-..." error="這個欄位是必填的" size="sm" />
          </div>
        </Card>

        <Card interactive>
          <CardHeader title="Interactive Card" subtitle="hover 時會有上浮 + 邊框變色效果" />
          <p className="m-0 text-[0.8125rem]" style={{ color: 'var(--muted-foreground)' }}>
            這張卡片示範 <code>interactive</code> 屬性，滑鼠移上去可以看到邊框變成主色、卡片微微上浮，
            適合用在可點擊進入詳情的清單項目。
          </p>
        </Card>
      </div>
    </div>
  );
}
