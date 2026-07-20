/**
 * 把「主題產生器」（/theme，ThemeGenerator）目前編輯的 ThemeConfig
 * 寫回 `data/{app}/theme.json`，同時把前端已經算好的 CSS 字串寫成
 * `data/{app}/styles.css`；或從磁碟讀回 ThemeConfig。
 *
 * 跟 routes/pages/i18n 一致：主題設定改為「每個 app 各自一份」，落在
 * `data/{app}/theme.json`（不再是全域共用的 `data/theme.json`），對應
 * app-fs.mjs 的 appThemeFile()。
 *
 * `data/{app}/styles.css` 是 theme.json 的衍生產物（純文字，不做結構
 * 驗證），由前端 `generateThemeCss(config)` 算好字串後一併送過來，這裡
 * 只負責落地寫檔，styles.css 本身不是任何頁面的讀取來源（讀回一律讀
 * theme.json 再重新產生 CSS，避免兩份資料不同步）。
 *
 * 僅在 `vite dev` 的 middleware（見 write-theme-plugin.mjs）被呼叫，
 * build 產物不含這支腳本的呼叫路徑。
 */
import {
  isSafeId,
  readJsonFile,
  writeJsonFile,
  writeTextFile,
  appThemeFile,
  appStylesCssFile,
  toRelative,
} from './app-fs.mjs';

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
 * 驗證並寫入 ThemeConfig 到 `data/{app}/theme.json`，
 * 若同時提供 `css`（前端已算好的字串），一併寫入 `data/{app}/styles.css`。
 *
 * @param {object} params
 * @param {string} params.app
 * @param {unknown} params.themeConfig
 * @param {unknown} [params.css]
 * @returns {{ ok: true, writtenFile: string, writtenCssFile?: string } | { ok: false, error: string }}
 */
export function writeThemeToDisk({ app, themeConfig, css }) {
  try {
    if (!isSafeId(app)) {
      return { ok: false, error: `不合法的 app 名稱：${JSON.stringify(app)}（只允許英數字、底線、連字號）` };
    }

    const result = validateThemeConfig(themeConfig);
    if (result.error) {
      return { ok: false, error: result.error };
    }

    const filePath = appThemeFile(app);
    writeJsonFile(filePath, result.clean);

    const response = { ok: true, writtenFile: toRelative(filePath) };

    if (typeof css === 'string' && css.trim().length > 0) {
      const cssFilePath = appStylesCssFile(app);
      writeTextFile(cssFilePath, css);
      response.writtenCssFile = toRelative(cssFilePath);
    }

    return response;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 讀取磁碟上該 app 目前的 theme.json，不存在回傳 null */
export function readThemeFromDisk({ app }) {
  if (!isSafeId(app)) {
    throw new Error(`不合法的 app 名稱：${JSON.stringify(app)}`);
  }
  return readJsonFile(appThemeFile(app), null);
}

export { toRelative };
