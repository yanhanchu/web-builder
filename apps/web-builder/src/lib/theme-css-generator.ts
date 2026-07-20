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

import type { ThemeConfig } from '@/types/theme-types';

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

/** 淺色模式（:root）的所有 oklch 變數 */
function buildLightVars(cfg: ThemeConfig) {
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
function buildDarkVars(cfg: ThemeConfig) {
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

/** 產生完整的主題 CSS 檔內容，格式與 example.css 一致 */
export function generateThemeCss(cfg: ThemeConfig): string {
  const light = buildLightVars(cfg);
  const dark = buildDarkVars(cfg);

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
`;
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

/** 提供給預覽用：把 light/dark 的 oklch 變數轉成一份 flat 物件，方便畫色票 */
export function buildPreviewSwatches(cfg: ThemeConfig, mode: 'light' | 'dark') {
  const vars = mode === 'light' ? buildLightVars(cfg) : buildDarkVars(cfg);
  const keys = ['background', 'foreground', 'card', 'primary', 'secondary', 'muted', 'accent', 'destructive', 'border'] as const;
  return keys.map((key) => ({ key, value: (vars as Record<string, string>)[key] }));
}
