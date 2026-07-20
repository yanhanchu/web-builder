/**
 * 把「App 設定頁」（/apps）編輯好的 app 設定資料寫回
 * `data/{app}/app.json`，並視需要同步 create / delete / rename 動作到
 * `data/{app}/pages.json` 與 `data/{app}/i18n/` 目錄。
 *
 * 資料配置是「一個 app = 一個資料夾」（data/{app}/），
 * app.json、pages.json、i18n/ 都收斂在同一個目錄底下，新增 / 刪除 /
 * 重新命名 app 對應的就是對這個資料夾做 mkdir / rm / rename，
 * 不再需要分別改三處各自獨立的檔案 / 目錄。
 *
 * 沒有任何聚合檔：`data/{app}/app.json` 本身就是唯一資料來源。
 * build 期前端用 `import.meta.glob` 直接靜態掃描這些檔案
 * （見 src/lib/app-data.ts），不需要另外維護一份彙整過的
 * data/apps.json；dev 期寫入這裡即可，該模組會自動反映最新內容。
 *
 * 僅在 `vite dev` 的 middleware（見 write-apps-plugin.mjs）被呼叫，
 * build 產物不含這支腳本的呼叫路徑，不會有寫檔 API 外洩到正式環境的疑慮。
 */
import {
  isSafeId,
  readJsonFile,
  writeJsonFile,
  appSettingsFile,
  appPagesFile,
  ensureAppDir,
  removeAppDir,
  renameAppDir,
  appExists,
  listAppDirs,
  toRelative,
} from './app-fs.mjs';

function isStr(v) {
  return typeof v === 'string';
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isValidSeo(seo) {
  if (seo == null) return true;
  if (!isPlainObject(seo)) return false;
  const strFields = ['title', 'titleTemplate', 'description', 'canonicalUrl', 'language', 'locale'];
  for (const f of strFields) {
    if (f in seo && !isStr(seo[f])) return false;
  }
  if ('keywords' in seo) {
    if (!Array.isArray(seo.keywords) || !seo.keywords.every(isStr)) return false;
  }
  if ('openGraph' in seo && seo.openGraph != null) {
    if (!isPlainObject(seo.openGraph)) return false;
    const ogFields = ['type', 'title', 'description', 'image', 'imageAlt', 'url', 'siteName', 'locale'];
    for (const f of ogFields) {
      if (f in seo.openGraph && !isStr(seo.openGraph[f])) return false;
    }
  }
  if ('twitter' in seo && seo.twitter != null) {
    if (!isPlainObject(seo.twitter)) return false;
    const twFields = ['card', 'site', 'creator', 'title', 'description', 'image'];
    for (const f of twFields) {
      if (f in seo.twitter && !isStr(seo.twitter[f])) return false;
    }
  }
  return true;
}

function isValidFavicon(favicon) {
  if (favicon == null) return true;
  if (!isPlainObject(favicon)) return false;
  const fields = ['favicon', 'appleTouchIcon', 'manifest'];
  for (const f of fields) {
    if (f in favicon && !isStr(favicon[f])) return false;
  }
  return true;
}

function isValidAnalytics(analytics) {
  if (analytics == null) return true;
  if (!isPlainObject(analytics)) return false;
  const fields = ['googleAnalyticsId', 'googleTagManagerId', 'metaPixelId', 'linkedinInsightId', 'tiktokPixelId'];
  for (const f of fields) {
    if (f in analytics && !isStr(analytics[f])) return false;
  }
  return true;
}

function isValidStorage(storage) {
  if (storage == null) return true;
  if (!isPlainObject(storage)) return false;
  if ('domain' in storage && !isStr(storage.domain)) return false;
  // 相容舊格式：provider 為單選字串（'local' | 's3'）
  if ('provider' in storage && storage.provider !== 'local' && storage.provider !== 's3') return false;
  // 新格式：providers 為可複選陣列，每個元素須為 'local' | 's3'
  if ('providers' in storage) {
    if (!Array.isArray(storage.providers)) return false;
    for (const p of storage.providers) {
      if (p !== 'local' && p !== 's3') return false;
    }
  }
  if ('s3' in storage && storage.s3 != null) {
    if (!isPlainObject(storage.s3)) return false;
    const fields = ['accessKeyId', 'secretAccessKey', 'endpoint', 'region', 'bucket'];
    for (const f of fields) {
      if (f in storage.s3 && !isStr(storage.s3[f])) return false;
    }
    if ('expiresIn' in storage.s3 && storage.s3.expiresIn != null && typeof storage.s3.expiresIn !== 'number') {
      return false;
    }
  }
  return true;
}

function isValidAuth(auth) {
  if (auth == null) return true;
  if (!isPlainObject(auth)) return false;
  const fields = ['googleClientId', 'microsoftClientId'];
  for (const f of fields) {
    if (f in auth && !isStr(auth[f])) return false;
  }
  return true;
}

function isValidSettings(settings) {
  if (settings == null || typeof settings !== 'object' || Array.isArray(settings)) return false;
  if (typeof settings.siteName !== 'string') return false;
  if (typeof settings.siteUrl !== 'string') return false;
  if ('description' in settings && typeof settings.description !== 'string') return false;
  if ('seo' in settings && !isValidSeo(settings.seo)) return false;
  if ('favicon' in settings && !isValidFavicon(settings.favicon)) return false;
  if ('analytics' in settings && !isValidAnalytics(settings.analytics)) return false;
  if ('storage' in settings && !isValidStorage(settings.storage)) return false;
  if ('auth' in settings && !isValidAuth(settings.auth)) return false;
  return true;
}

function cleanSeoOpenGraph(og) {
  if (!isPlainObject(og)) return undefined;
  return {
    type: isStr(og.type) ? og.type : '',
    title: isStr(og.title) ? og.title : '',
    description: isStr(og.description) ? og.description : '',
    image: isStr(og.image) ? og.image : '',
    imageAlt: isStr(og.imageAlt) ? og.imageAlt : '',
    url: isStr(og.url) ? og.url : '',
    siteName: isStr(og.siteName) ? og.siteName : '',
    locale: isStr(og.locale) ? og.locale : '',
  };
}

function cleanSeoTwitter(tw) {
  if (!isPlainObject(tw)) return undefined;
  return {
    card: isStr(tw.card) ? tw.card : '',
    site: isStr(tw.site) ? tw.site : '',
    creator: isStr(tw.creator) ? tw.creator : '',
    title: isStr(tw.title) ? tw.title : '',
    description: isStr(tw.description) ? tw.description : '',
    image: isStr(tw.image) ? tw.image : '',
  };
}

function cleanSeo(seo) {
  if (!isPlainObject(seo)) return undefined;
  return {
    title: isStr(seo.title) ? seo.title : '',
    titleTemplate: isStr(seo.titleTemplate) ? seo.titleTemplate : '',
    description: isStr(seo.description) ? seo.description : '',
    keywords: Array.isArray(seo.keywords) ? seo.keywords.filter(isStr) : [],
    canonicalUrl: isStr(seo.canonicalUrl) ? seo.canonicalUrl : '',
    language: isStr(seo.language) ? seo.language : '',
    locale: isStr(seo.locale) ? seo.locale : '',
    openGraph: cleanSeoOpenGraph(seo.openGraph) ?? cleanSeoOpenGraph({}),
    twitter: cleanSeoTwitter(seo.twitter) ?? cleanSeoTwitter({}),
  };
}

function cleanFavicon(favicon) {
  if (!isPlainObject(favicon)) return undefined;
  return {
    favicon: isStr(favicon.favicon) ? favicon.favicon : '',
    appleTouchIcon: isStr(favicon.appleTouchIcon) ? favicon.appleTouchIcon : '',
    manifest: isStr(favicon.manifest) ? favicon.manifest : '',
  };
}

function cleanAnalytics(analytics) {
  if (!isPlainObject(analytics)) return undefined;
  return {
    googleAnalyticsId: isStr(analytics.googleAnalyticsId) ? analytics.googleAnalyticsId : '',
    googleTagManagerId: isStr(analytics.googleTagManagerId) ? analytics.googleTagManagerId : '',
    metaPixelId: isStr(analytics.metaPixelId) ? analytics.metaPixelId : '',
    linkedinInsightId: isStr(analytics.linkedinInsightId) ? analytics.linkedinInsightId : '',
    tiktokPixelId: isStr(analytics.tiktokPixelId) ? analytics.tiktokPixelId : '',
  };
}

function cleanStorageS3Config(s3) {
  if (!isPlainObject(s3)) return undefined;
  const expiresIn = typeof s3.expiresIn === 'number' && s3.expiresIn > 0 ? s3.expiresIn : undefined;
  return {
    accessKeyId: isStr(s3.accessKeyId) ? s3.accessKeyId : '',
    secretAccessKey: isStr(s3.secretAccessKey) ? s3.secretAccessKey : '',
    endpoint: isStr(s3.endpoint) ? s3.endpoint : '',
    region: isStr(s3.region) ? s3.region : '',
    bucket: isStr(s3.bucket) ? s3.bucket : '',
    ...(expiresIn !== undefined ? { expiresIn } : {}),
  };
}

function cleanStorage(storage) {
  if (!isPlainObject(storage)) return undefined;
  // 相容舊資料：舊版只有單選的 provider 字串，新版改為 providers 陣列（可複選）。
  const providers = Array.isArray(storage.providers)
    ? storage.providers.filter((p) => p === 'local' || p === 's3')
    : storage.provider === 's3' || storage.provider === 'local'
      ? [storage.provider]
      : [];
  return {
    domain: isStr(storage.domain) ? storage.domain : '',
    providers,
    s3: cleanStorageS3Config(storage.s3) ?? cleanStorageS3Config({}),
  };
}

function cleanAuth(auth) {
  if (!isPlainObject(auth)) return undefined;
  return {
    googleClientId: isStr(auth.googleClientId) ? auth.googleClientId : '',
    microsoftClientId: isStr(auth.microsoftClientId) ? auth.microsoftClientId : '',
  };
}

function cleanSettings(s) {
  return {
    siteName: s.siteName,
    siteUrl: s.siteUrl,
    ...(typeof s.description === 'string' ? { description: s.description } : {}),
    ...('seo' in s && s.seo != null ? { seo: cleanSeo(s.seo) } : {}),
    ...('favicon' in s && s.favicon != null ? { favicon: cleanFavicon(s.favicon) } : {}),
    ...('analytics' in s && s.analytics != null ? { analytics: cleanAnalytics(s.analytics) } : {}),
    ...('storage' in s && s.storage != null ? { storage: cleanStorage(s.storage) } : {}),
    ...('auth' in s && s.auth != null ? { auth: cleanAuth(s.auth) } : {}),
  };
}

/** 讀出某 app 的 app.json（不存在回傳 null） */
function readAppSettings(app) {
  return readJsonFile(appSettingsFile(app), null);
}

/**
 * 驗證並寫入整份 appsData（app -> AppSettings）到各自的
 * `data/{app}/app.json`。app 目錄若尚未存在會自動建立。
 *
 * @param {object} params
 * @param {unknown} params.appsData
 * @returns {{ ok: true, appCount: number } | { ok: false, error: string }}
 */
export function writeAppsToDisk({ appsData }) {
  try {
    if (appsData == null || typeof appsData !== 'object' || Array.isArray(appsData)) {
      return { ok: false, error: 'appsData 必須是物件（app -> AppSettings）' };
    }

    const apps = Object.keys(appsData);
    for (const app of apps) {
      if (!isSafeId(app)) {
        return { ok: false, error: `不合法的 app 名稱：${JSON.stringify(app)}（只允許英數字、底線、連字號）` };
      }
      if (!isValidSettings(appsData[app])) {
        return { ok: false, error: `app "${app}" 的設定格式不合法（需要 siteName / siteUrl 字串欄位）` };
      }
    }

    for (const app of apps) {
      ensureAppDir(app);
      writeJsonFile(appSettingsFile(app), cleanSettings(appsData[app]));
    }


    return { ok: true, appCount: apps.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 新增一個空的 app：建立 `data/{app}/` 目錄，寫入 app.json，
 * 並建立對應的空 pages.json（`[]`）。
 */
export function createApp({ app, settings }) {
  if (!isSafeId(app)) {
    return { ok: false, error: `不合法的 app 名稱：${JSON.stringify(app)}（只允許英數字、底線、連字號）` };
  }
  if (appExists(app)) {
    return { ok: false, error: `app "${app}" 已存在` };
  }

  const nextSettings = isValidSettings(settings)
    ? cleanSettings(settings)
    : { siteName: '', siteUrl: '', description: '' };

  ensureAppDir(app);
  writeJsonFile(appSettingsFile(app), nextSettings);
  writeJsonFile(appPagesFile(app), []);

  return { ok: true, app, appCount: listAppDirs().length };
}

/**
 * 刪除一個 app：整個刪除 `data/{app}/` 目錄
 * （含 app.json / pages.json / i18n/ 底下所有內容）。
 */
export function deleteApp({ app }) {
  if (!isSafeId(app)) {
    return { ok: false, error: `不合法的 app 名稱：${JSON.stringify(app)}` };
  }

  removeAppDir(app);

  return { ok: true, app };
}

/**
 * 重新命名一個 app：把整個 `data/{oldName}/` 目錄改名成 `data/{newName}/`
 * （app.json / pages.json / i18n/ 都隨目錄一起搬移，不需要分別處理）。
 */
export function renameApp({ oldName, newName }) {
  if (!isSafeId(oldName) || !isSafeId(newName)) {
    return { ok: false, error: '不合法的 app 名稱（只允許英數字、底線、連字號）' };
  }
  if (oldName === newName) {
    return { ok: false, error: '新舊 app 名稱相同' };
  }
  if (!appExists(oldName)) {
    return { ok: false, error: `app "${oldName}" 不存在` };
  }
  if (appExists(newName)) {
    return { ok: false, error: `app "${newName}" 已存在` };
  }

  renameAppDir(oldName, newName);

  return { ok: true, oldName, newName };
}

/**
 * 讀取目前所有 app 的設定（供 GET API 使用）：
 * 掃描 `data/` 底下所有 app 目錄，各自讀出 app.json 組成
 * `{ [app]: AppSettings }`。
 */
export function readAppsFromDisk() {
  const appsData = {};
  for (const app of listAppDirs()) {
    const settings = readAppSettings(app);
    if (settings) {
      appsData[app] = settings;
    }
  }
  return { ok: true, appsData };
}

// 保留內部工具給其他 write-*.mjs 使用（例如 write-pages.mjs 檢查 app 是否存在）
export { appExists, listAppDirs, toRelative };
