/**
 * 把「主題產生器」（/theme，ThemeGenerator）目前編輯的 ThemeConfig
 * 寫回 `data/theme.json`，或從磁碟讀回。
 *
 * 跟 routes/pages/i18n 不同：主題設定不是「每個 app 各自一份」，而是
 * 整個 workspace 共用一份全域設定，所以直接落在 `data/theme.json`
 * （不在任何 `data/{app}/` 底下），對應 app-fs.mjs 的 topLevelDataFile()。
 *
 * 僅在 `vite dev` 的 middleware（見 write-theme-plugin.mjs）被呼叫，
 * build 產物不含這支腳本的呼叫路徑。
 */
import { readJsonFile, writeJsonFile, topLevelDataFile, toRelative } from './app-fs.mjs';

const THEME_FILE = () => topLevelDataFile('theme.json');

/** 驗證並清理 ThemeConfig，不合法回傳 error 訊息 */
function validateThemeConfig(config) {
  if (config == null || typeof config !== 'object' || Array.isArray(config)) {
    return { error: 'themeConfig 必須是物件' };
  }

  const num = (key, min, max) => {
    const value = config[key];
    if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max) {
      return `${key} 必須是 ${min} ~ ${max} 之間的數字`;
    }
    return null;
  };

  const numChecks = [
    num('primaryHue', 0, 360),
    num('primaryChroma', 0, 1),
    num('neutralHue', 0, 360),
    num('radius', 0, 5),
  ].filter(Boolean);
  if (numChecks.length > 0) {
    return { error: numChecks[0] };
  }

  if (typeof config.fontSans !== 'string' || config.fontSans.trim().length === 0) {
    return { error: 'fontSans 必須是非空字串' };
  }
  if (typeof config.fontHeading !== 'string' || config.fontHeading.trim().length === 0) {
    return { error: 'fontHeading 必須是非空字串' };
  }

  const clean = {
    primaryHue: config.primaryHue,
    primaryChroma: config.primaryChroma,
    neutralHue: config.neutralHue,
    radius: config.radius,
    fontSans: config.fontSans.trim(),
    fontHeading: config.fontHeading.trim(),
  };

  return { clean };
}

/**
 * 驗證並寫入 ThemeConfig 到 `data/theme.json`。
 *
 * @param {object} params
 * @param {unknown} params.themeConfig
 * @returns {{ ok: true, writtenFile: string } | { ok: false, error: string }}
 */
export function writeThemeToDisk({ themeConfig }) {
  try {
    const result = validateThemeConfig(themeConfig);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    const filePath = THEME_FILE();
    writeJsonFile(filePath, result.clean);
    return { ok: true, writtenFile: toRelative(filePath) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 讀取磁碟上目前的 theme.json，不存在回傳 null */
export function readThemeFromDisk() {
  return readJsonFile(THEME_FILE(), null);
}

export { toRelative };
