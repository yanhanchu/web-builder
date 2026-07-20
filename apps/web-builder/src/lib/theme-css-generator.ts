// 根據 ThemeConfig 產生一份跟 apps/web-builder/example.css 同格式的
// tailwindcss v4 主題設定檔（純函式，不碰 DOM / 檔案系統，方便測試與重用）。
//
// example.css 的結構固定為五段：
//   1. @import（tailwindcss / tw-animate-css / shadcn / fontsource 字型）
//   2. @custom-variant dark
//   3. :root { ...oklch 變數... }
//   4. .dark { ...oklch 變數... }
//   5. @theme inline { ...對應 --color-*/--radius-*/--font-* } + @layer base
//
// 這裡採用「以主色 hue 為基準，用固定的 lightness/chroma 曲線推算全部
// oklch 顏色」的簡化配色演算法，而不是要求使用者一個一個填 34 個變數；
// 只要給一個 primary hue + chroma + neutral hue + radius + 兩個字型，
// 就能生成一份「大致可用、風格一致」的主題檔。使用者仍可把產生的 CSS
// 貼回專案後自行微調個別數值。

import type { LockedMap, ThemeConfig } from '@/types/theme-types';
import { FONT_OPTIONS } from '@/types/theme-types';

function oklch(l: number, c: number, h: number, alpha?: number): string {
  const L = Math.max(0, Math.min(1, l));
  const C = Math.max(0, c);
  const H = ((h % 360) + 360) % 360;
  const base = `oklch(${round(L, 3)} ${round(C, 3)} ${round(H, 3)})`;
  return alpha == null ? base : `oklch(${round(L, 3)} ${round(C, 3)} ${round(H, 3)} / ${alpha * 100}%)`;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * 調色盤（<input type="color">）用的輔助函式：因為 ThemeConfig 存的是
 * OKLCH 的 hue 角度（0-360），但 <input type="color"> 只認得 hex，所以
 * 用固定的 lightness/chroma，把 hue 轉成一個「有代表性」的 hex 顏色給
 * 調色盤顯示／輸入，反之亦然。這只是 UI 輸入手段，實際主題色仍然是用
 * oklch(l, c, h) 依 lightness 曲線即時算出來的（見 buildLightVars 等）。
 */
export function hueToHex(hue: number, chroma = 0.15): string {
  const h = ((hue % 360) + 360) % 360;
  // 用 HSL 近似（僅供調色盤視覺選色用，跟 oklch 曲線是兩回事）
  const s = Math.min(1, chroma / 0.3) * 0.75 + 0.25;
  return hslToHex(h, s, 0.55);
}

export function hexToHue(hex: string): number {
  const { h } = hexToHsl(hex);
  return Math.round(h);
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      default:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }
  return { h, s, l };
}

/** 淺色模式（:root）的所有 oklch 變數 */
export function buildLightVars(cfg: ThemeConfig) {
  const { primaryHue: ph, primaryChroma: pc, neutralHue: nh } = cfg;
  return {
    background: oklch(1, 0, nh),
    foreground: oklch(0.148, 0.004, nh),
    card: oklch(1, 0, nh),
    'card-foreground': oklch(0.148, 0.004, nh),
    popover: oklch(1, 0, nh),
    'popover-foreground': oklch(0.148, 0.004, nh),
    primary: oklch(0.52, pc, ph),
    'primary-foreground': oklch(0.984, 0.019, ph),
    secondary: oklch(0.967, 0.001, nh),
    'secondary-foreground': oklch(0.21, 0.006, nh),
    muted: oklch(0.963, 0.002, nh),
    'muted-foreground': oklch(0.56, 0.021, nh),
    accent: oklch(0.963, 0.002, nh),
    'accent-foreground': oklch(0.218, 0.008, nh),
    destructive: oklch(0.577, 0.245, 27.325),
    border: oklch(0.925, 0.005, nh),
    input: oklch(0.925, 0.005, nh),
    ring: oklch(0.723, 0.014, nh),
    'chart-1': oklch(0.872, 0.007, nh),
    'chart-2': oklch(0.56, 0.021, nh),
    'chart-3': oklch(0.45, 0.017, nh),
    'chart-4': oklch(0.378, 0.015, nh),
    'chart-5': oklch(0.275, 0.011, nh),
    radius: `${round(cfg.radius, 3)}rem`,
    sidebar: oklch(0.987, 0.002, nh),
    'sidebar-foreground': oklch(0.148, 0.004, nh),
    'sidebar-primary': oklch(0.609, Math.max(pc - 0.02, 0), ph),
    'sidebar-primary-foreground': oklch(0.984, 0.019, ph),
    'sidebar-accent': oklch(0.963, 0.002, nh),
    'sidebar-accent-foreground': oklch(0.218, 0.008, nh),
    'sidebar-border': oklch(0.925, 0.005, nh),
    'sidebar-ring': oklch(0.723, 0.014, nh),
  } as const;
}

/** 深色模式（.dark）的所有 oklch 變數 */
export function buildDarkVars(cfg: ThemeConfig) {
  const { primaryHue: ph, primaryChroma: pc, neutralHue: nh } = cfg;
  return {
    background: oklch(0.148, 0.004, nh),
    foreground: oklch(0.987, 0.002, nh),
    card: oklch(0.218, 0.008, nh),
    'card-foreground': oklch(0.987, 0.002, nh),
    popover: oklch(0.218, 0.008, nh),
    'popover-foreground': oklch(0.987, 0.002, nh),
    primary: oklch(0.45, Math.max(pc - 0.02, 0), ph),
    'primary-foreground': oklch(0.984, 0.019, ph),
    secondary: oklch(0.274, 0.006, nh),
    'secondary-foreground': oklch(0.985, 0, 0),
    muted: oklch(0.275, 0.011, nh),
    'muted-foreground': oklch(0.723, 0.014, nh),
    accent: oklch(0.275, 0.011, nh),
    'accent-foreground': oklch(0.987, 0.002, nh),
    destructive: oklch(0.704, 0.191, 22.216),
    border: oklch(1, 0, nh, 0.1),
    input: oklch(1, 0, nh, 0.15),
    ring: oklch(0.56, 0.021, nh),
    'chart-1': oklch(0.872, 0.007, nh),
    'chart-2': oklch(0.56, 0.021, nh),
    'chart-3': oklch(0.45, 0.017, nh),
    'chart-4': oklch(0.378, 0.015, nh),
    'chart-5': oklch(0.275, 0.011, nh),
    sidebar: oklch(0.218, 0.008, nh),
    'sidebar-foreground': oklch(0.987, 0.002, nh),
    'sidebar-primary': oklch(0.715, Math.max(pc - 0.03, 0), ph),
    'sidebar-primary-foreground': oklch(0.302, 0.056, ph),
    'sidebar-accent': oklch(0.275, 0.011, nh),
    'sidebar-accent-foreground': oklch(0.987, 0.002, nh),
    'sidebar-border': oklch(1, 0, nh, 0.1),
    'sidebar-ring': oklch(0.56, 0.021, nh),
  } as const;
}

function varsBlock(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `    --${key}: ${value};`)
    .join('\n');
}

/** 依設定產生 Glassmorphism（毛玻璃） `.glass` 工具 class 的 CSS 區塊；未啟用時回傳空字串 */
export function buildGlassCss(cfg: ThemeConfig): string {
  if (!cfg.glassEnabled) return '';
  const blur = cfg.glassBlur ?? 12;
  const opacity = cfg.glassOpacity ?? 0.55;
  return `
/* Glassmorphism（毛玻璃）工具 class，套用在需要毛玻璃卡片/導覽列的元素上 */
.glass {
  background: oklch(1 0 0 / ${round(opacity * 100, 1)}%);
  backdrop-filter: blur(${blur}px) saturate(160%);
  -webkit-backdrop-filter: blur(${blur}px) saturate(160%);
  border: 1px solid oklch(1 0 0 / 30%);
  box-shadow: 0 8px 32px oklch(0.148 0.004 ${cfg.neutralHue} / 18%);
}
.dark .glass {
  background: oklch(0.218 0.008 ${cfg.neutralHue} / ${round(opacity * 100, 1)}%);
  border: 1px solid oklch(1 0 0 / 10%);
  box-shadow: 0 8px 32px oklch(0 0 0 / 35%);
}
`;
}

/** 依設定產生 Neumorphism（新擬態） `.neumorphic` 工具 class 的 CSS 區塊；未啟用時回傳空字串 */
export function buildNeumorphismCss(cfg: ThemeConfig): string {
  if (!cfg.neumorphismEnabled) return '';
  const intensity = cfg.neumorphismIntensity ?? 10;
  const pressed = cfg.neumorphismStyle === 'pressed';
  const inset = pressed ? 'inset ' : '';
  return `
/* Neumorphism（新擬態）工具 class，套用在需要柔和浮凸/內凹質感的元素上 */
.neumorphic {
  background: oklch(0.963 0.002 ${cfg.neutralHue});
  border-radius: var(--radius);
  box-shadow: ${inset}${intensity}px ${intensity}px ${intensity * 2}px oklch(0.148 0.004 ${cfg.neutralHue} / 18%),
    ${inset}-${intensity}px -${intensity}px ${intensity * 2}px oklch(1 0 0 / 90%);
}
.dark .neumorphic {
  background: oklch(0.218 0.008 ${cfg.neutralHue});
  box-shadow: ${inset}${intensity}px ${intensity}px ${intensity * 2}px oklch(0 0 0 / 45%),
    ${inset}-${intensity}px -${intensity}px ${intensity * 2}px oklch(1 0 0 / 4%);
}
`;
}

/** 產生完整的主題 CSS 檔內容，格式與 example.css 一致 */
export function generateThemeCss(cfg: ThemeConfig): string {
  const light = buildLightVars(cfg);
  const dark = buildDarkVars(cfg);
  const glassCss = buildGlassCss(cfg);
  const neumorphismCss = buildNeumorphismCss(cfg);
  const extraCss = `${glassCss}${neumorphismCss}`;

  return `@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/${slugifyFontImport(cfg.fontSans)}";
@import "@fontsource-variable/${slugifyFontImport(cfg.fontHeading)}";

/** font */

@custom-variant dark (&:is(.dark *));

:root {
${varsBlock(light)}
}

.dark {
${varsBlock(dark)}
}

@theme inline {
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-card: var(--card);
    --color-card-foreground: var(--card-foreground);
    --color-popover: var(--popover);
    --color-popover-foreground: var(--popover-foreground);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-secondary: var(--secondary);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-muted: var(--muted);
    --color-muted-foreground: var(--muted-foreground);
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-destructive: var(--destructive);
    --color-border: var(--border);
    --color-input: var(--input);
    --color-ring: var(--ring);
    --color-chart-1: var(--chart-1);
    --color-chart-2: var(--chart-2);
    --color-chart-3: var(--chart-3);
    --color-chart-4: var(--chart-4);
    --color-chart-5: var(--chart-5);
    --radius-sm: calc(var(--radius) * 0.6);
    --radius-md: calc(var(--radius) * 0.8);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) * 1.4);
    --radius-2xl: calc(var(--radius) * 1.8);
    --radius-3xl: calc(var(--radius) * 2.2);
    --radius-4xl: calc(var(--radius) * 2.6);
    --color-sidebar: var(--sidebar);
    --color-sidebar-foreground: var(--sidebar-foreground);
    --color-sidebar-primary: var(--sidebar-primary);
    --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
    --color-sidebar-accent: var(--sidebar-accent);
    --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
    --color-sidebar-border: var(--sidebar-border);
    --color-sidebar-ring: var(--sidebar-ring);
    --font-sans: '${cfg.fontSans}', sans-serif;
    --font-heading: '${cfg.fontHeading}', sans-serif;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
    }
  body {
    @apply bg-background text-foreground;
    }
  button:not(:disabled), [role="button"]:not(:disabled) {
    cursor: pointer;
    }
}
${extraCss}`;
}

/** 'IBM Plex Sans Variable' -> 'ibm-plex-sans'，符合 @fontsource-variable 套件命名慣例 */
function slugifyFontImport(fontName: string): string {
  return fontName
    .replace(/\s+Variable$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * 把 buildLightVars/buildDarkVars 的結果轉成可以直接放進 React `style` 的
 * CSS 自訂屬性物件（`--background` 等），讓 UI 組件展示區塊可以在畫面上
 * 局部套用目前主題設定，而不用整頁套用（避免影響 /theme 頁面自己的介面）。
 * 另外補上 `--success`/`--warning`/`--info`（專案的 example.css 沒有定義，
 * 但 @workspace/ui 的 Badge 組件會用到），用主色/中性色系推算一組合理值，
 * 純粹是展示用途，不會寫進 generateThemeCss() 產生的正式 CSS。
 */
export function buildPreviewCssVars(cfg: ThemeConfig, mode: 'light' | 'dark'): Record<string, string> {
  const vars = mode === 'light' ? buildLightVars(cfg) : buildDarkVars(cfg);
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    style[`--${key}`] = value;
  }
  const isDark = mode === 'dark';
  style['--success'] = oklch(isDark ? 0.7 : 0.6, 0.15, 150);
  style['--warning'] = oklch(isDark ? 0.75 : 0.65, 0.15, 80);
  style['--info'] = oklch(isDark ? 0.7 : 0.55, 0.13, cfg.primaryHue);
  style['--font-sans'] = `'${cfg.fontSans}', sans-serif`;
  style['--font-heading'] = `'${cfg.fontHeading}', sans-serif`;
  return style;
}

/** 提供給預覽用：把 light/dark 的 oklch 變數轉成一份 flat 物件，方便畫色票 */
export function buildPreviewSwatches(cfg: ThemeConfig, mode: 'light' | 'dark') {
  const vars = mode === 'light' ? buildLightVars(cfg) : buildDarkVars(cfg);
  const keys = ['background', 'foreground', 'card', 'primary', 'secondary', 'muted', 'accent', 'destructive', 'border'] as const;
  return keys.map((key) => ({ key, value: (vars as Record<string, string>)[key] }));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, digits: number): number {
  const value = Math.random() * (max - min) + min;
  return round(value, digits);
}

function randomFont(exclude?: string): string {
  const pool = FONT_OPTIONS.filter((f) => f !== exclude);
  const candidates = pool.length > 0 ? pool : FONT_OPTIONS;
  return candidates[randomInt(0, candidates.length - 1)];
}

/**
 * 依目前設定與鎖定狀態，隨機產生下一組 ThemeConfig：被鎖定（locked[key] === true）
 * 的欄位維持原值，其餘欄位各自在合理範圍內重新取樣。
 */
export function shuffleTheme(current: ThemeConfig, locked: LockedMap): ThemeConfig {
  return {
    ...current,
    primaryHue: locked.primaryHue ? current.primaryHue : randomInt(0, 359),
    primaryChroma: locked.primaryChroma ? current.primaryChroma : randomFloat(0.02, 0.22, 3),
    neutralHue: locked.neutralHue ? current.neutralHue : randomInt(0, 359),
    radius: locked.radius ? current.radius : randomFloat(0, 1.25, 3),
    fontSans: locked.fontSans ? current.fontSans : randomFont(),
    fontHeading: locked.fontHeading ? current.fontHeading : randomFont(current.fontSans),
  };
}
