import { useMemo, useState } from 'react';
import {
  DEFAULT_THEME_CONFIG,
  FONT_OPTIONS,
  THEME_PRESETS,
  type ThemeConfig,
} from '@/types/theme-types';
import { generateThemeCss, buildPreviewSwatches } from '@/lib/theme-css-generator';
import { themeGeneratorStyles as styles } from '@/styles/theme-generator-styles';
import { cn } from '@workspace/ui/utils/utils';

/**
 * `/theme` — 主題（tailwindcss）產生器。
 *
 * 跟 `apps/web-builder/example.css` 一樣，輸出一份 tailwindcss v4 的
 * `@theme inline` + `:root`/`.dark` oklch 變數設定檔。使用者只需要調整
 * 主色 hue/chroma、中性色 hue、圓角、兩種字型（內文/標題），就能即時
 * 預覽淺色/深色兩種模式的色票與範例元件，並複製或下載產生的 CSS。
 *
 * 純前端運算（見 `src/lib/theme-css-generator.ts`），不寫入 `data/`、
 * 也不需要 dev-server 端點 —— 跟「路由管理（/routes）」的純設定管理
 * 性質類似，但這裡完全不涉及某個 app 的資料，任何時候都可以使用。
 */
type CopyState = 'idle' | 'copied' | 'error';

export function ThemeGenerator() {
  const [config, setConfig] = useState<ThemeConfig>(DEFAULT_THEME_CONFIG);
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light');
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const css = useMemo(() => generateThemeCss(config), [config]);
  const swatches = useMemo(() => buildPreviewSwatches(config, previewMode), [config, previewMode]);

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

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>主題產生器</h1>
        <p className={styles.subtitle}>
          用主色 + 幾個滑桿快速生成一份跟 <code>example.css</code> 相同格式的
          tailwindcss v4 主題設定檔（<code>@theme inline</code> +{' '}
          <code>:root</code>/<code>.dark</code> oklch 變數）。純前端即時運算，
          調整左側參數即可即時預覽，滿意後複製或下載 CSS，貼回專案的
          <code> src/index.css</code> 即可套用。
        </p>
      </div>

      <div className={styles.grid}>
        {/* 左側：參數面板 */}
        <div className={styles.panel}>
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
            <div className={styles.fieldLabelRow}>
              <label className={styles.fieldLabel} htmlFor="primary-hue">
                主色 Hue
              </label>
              <span className={styles.fieldValue}>{config.primaryHue}</span>
            </div>
            <input
              id="primary-hue"
              type="range"
              min={0}
              max={360}
              step={1}
              className={styles.slider}
              value={config.primaryHue}
              onChange={(e) => update('primaryHue', Number(e.target.value))}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldLabelRow}>
              <label className={styles.fieldLabel} htmlFor="primary-chroma">
                主色飽和度（chroma）
              </label>
              <span className={styles.fieldValue}>{config.primaryChroma.toFixed(3)}</span>
            </div>
            <input
              id="primary-chroma"
              type="range"
              min={0}
              max={0.3}
              step={0.005}
              className={styles.slider}
              value={config.primaryChroma}
              onChange={(e) => update('primaryChroma', Number(e.target.value))}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldLabelRow}>
              <label className={styles.fieldLabel} htmlFor="neutral-hue">
                中性色 Hue（背景/邊框）
              </label>
              <span className={styles.fieldValue}>{config.neutralHue}</span>
            </div>
            <input
              id="neutral-hue"
              type="range"
              min={0}
              max={360}
              step={1}
              className={styles.slider}
              value={config.neutralHue}
              onChange={(e) => update('neutralHue', Number(e.target.value))}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldLabelRow}>
              <label className={styles.fieldLabel} htmlFor="radius">
                圓角（radius）
              </label>
              <span className={styles.fieldValue}>{config.radius.toFixed(3)}rem</span>
            </div>
            <input
              id="radius"
              type="range"
              min={0}
              max={1.5}
              step={0.025}
              className={styles.slider}
              value={config.radius}
              onChange={(e) => update('radius', Number(e.target.value))}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="font-sans">
              內文字體（font-sans）
            </label>
            <input
              id="font-sans"
              list="font-options"
              className={styles.input}
              value={config.fontSans}
              onChange={(e) => update('fontSans', e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="font-heading">
              標題字體（font-heading）
            </label>
            <input
              id="font-heading"
              list="font-options"
              className={styles.input}
              value={config.fontHeading}
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
