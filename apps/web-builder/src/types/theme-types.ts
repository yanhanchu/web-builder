// 主題產生器（/theme）使用的型別定義。
//
// 目的：讓使用者用「一個主色 + 幾個滑桿」快速生成一份跟
// apps/web-builder/example.css 相同格式的 tailwindcss v4 主題設定檔
// （@theme inline + :root / .dark 的 oklch CSS variables）。
// 純前端運算，不寫入 data/ 也不需要 dev-server 端點。

/** 可被 Shuffle 隨機、也可被鎖定的欄位 */
export const SHUFFLABLE_KEYS = [
  'primaryHue',
  'primaryChroma',
  'neutralHue',
  'radius',
  'fontSans',
  'fontHeading',
] as const;

export type ShufflableKey = (typeof SHUFFLABLE_KEYS)[number];

/** 使用者可調整的主題輸入參數 */
export interface ThemeConfig {
  /** 主色（primary）的色相角度，0-360 */
  primaryHue: number;
  /** 主色的飽和度（chroma），建議範圍 0-0.37 之間 */
  primaryChroma: number;
  /** 中性色（background/foreground/border 等）的色相角度，通常跟 primaryHue 接近但飽和度較低 */
  neutralHue: number;
  /** 圓角基準值（rem） */
  radius: number;
  /** 內文字體（Google Fonts / Fontsource 字型名稱） */
  fontSans: string;
  /** 標題字體 */
  fontHeading: string;
}

/** 每個 ShufflableKey 是否被鎖定（鎖定的欄位在 Shuffle 時維持原值不變） */
export type LockedMap = Partial<Record<ShufflableKey, boolean>>;

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  primaryHue: 223,
  primaryChroma: 0.105,
  neutralHue: 220,
  radius: 0.625,
  fontSans: 'IBM Plex Sans Variable',
  fontHeading: 'Space Grotesk Variable',
};

/** 預設主色配色方案，方便使用者一鍵套用而不用自己調色相/飽和度 */
export interface ThemePreset {
  id: string;
  label: string;
  primaryHue: number;
  primaryChroma: number;
  neutralHue: number;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'ocean', label: 'Ocean（藍）', primaryHue: 223, primaryChroma: 0.105, neutralHue: 220 },
  { id: 'forest', label: 'Forest（綠）', primaryHue: 150, primaryChroma: 0.11, neutralHue: 150 },
  { id: 'sunset', label: 'Sunset（橘）', primaryHue: 45, primaryChroma: 0.15, neutralHue: 40 },
  { id: 'grape', label: 'Grape（紫）', primaryHue: 300, primaryChroma: 0.13, neutralHue: 290 },
  { id: 'rose', label: 'Rose（粉）', primaryHue: 10, primaryChroma: 0.15, neutralHue: 10 },
  { id: 'slate', label: 'Slate（灰）', primaryHue: 240, primaryChroma: 0.02, neutralHue: 240 },
];

/**
 * 可透過 @fontsource-variable 引入的字型清單（分「內文」「標題」兩組常見搭配，
 * 但使用者仍可自行輸入任意字型名稱，這份清單只是 datalist 建議選項 + Shuffle
 * 隨機取樣用的池子）。
 */
export const FONT_OPTIONS = [
  'IBM Plex Sans Variable',
  'Space Grotesk Variable',
  'Inter Variable',
  'Noto Sans TC Variable',
  'Manrope Variable',
  'Sora Variable',
  'Plus Jakarta Sans Variable',
  'Work Sans Variable',
  'Outfit Variable',
  'Lexend Variable',
  'DM Sans Variable',
  'Roboto Flex Variable',
  'Figtree Variable',
  'Urbanist Variable',
  'Onest Variable',
];

