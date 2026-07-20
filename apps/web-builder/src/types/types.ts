// data/apps.json 的型別定義。
//
// app 是一個 app / workspace 的概念，pages（data/pages.json）與
// i18n（data/i18n/{app}/{locale}.json）都以 app 做區隔。
// 這裡把 app 本身提升為最外層的功能：app 的新增 / 刪除 / 重新命名，
// 以及每個 app 專屬的設定（site name、site url ...等），統一在
// 「Admin 設定頁」（/admin）管理；pages / i18n 管理頁面只負責在選定的
// app 底下管理內容，不再各自提供 app 的 CRUD。

/** SEO 的 Open Graph 設定（純文字欄位，不處理圖片上傳，image 僅存網址字串） */
export interface AppSeoOpenGraph {
  type: string;
  title: string;
  description: string;
  /** 圖片網址（純文字欄位，不處理實際上傳） */
  image: string;
  imageAlt: string;
  url: string;
  siteName: string;
  locale: string;
}

/** SEO 的 Twitter / X Card 設定（純文字欄位） */
export interface AppSeoTwitter {
  card: string;
  site: string;
  creator: string;
  title: string;
  description: string;
  /** 圖片網址（純文字欄位，不處理實際上傳） */
  image: string;
}

/** SEO 相關設定 */
export interface AppSeo {
  title: string;
  titleTemplate: string;
  description: string;
  /** 關鍵字清單（逗號分隔輸入，儲存時拆成陣列） */
  keywords: string[];
  canonicalUrl: string;
  language: string;
  locale: string;
  openGraph: AppSeoOpenGraph;
  twitter: AppSeoTwitter;
}

/** favicon / 圖示相關設定（純文字網址欄位，不處理實際檔案上傳） */
export interface AppFavicon {
  favicon: string;
  appleTouchIcon: string;
  manifest: string;
}

/** 第三方分析 / 追蹤代碼設定 */
export interface AppAnalytics {
  googleAnalyticsId: string;
  googleTagManagerId: string;
  metaPixelId: string;
  linkedinInsightId: string;
  tiktokPixelId: string;
}

/** 檔案上傳的儲存供應商：本機檔案系統，或 S3 相容物件儲存（S3 / R2 / 其他 S3 相容節點）。
 * 兩者可以同時勾選（多選），上傳時會分別同步到每個勾選的目的地。 */
export type AppStorageProvider = 'local' | 's3';

/** S3 / R2 / 其他 S3 相容節點的連線設定（純文字欄位） */
export interface AppStorageS3Config {
  accessKeyId: string;
  secretAccessKey: string;
  /** S3 相容節點的 endpoint（例如 R2 或自架 MinIO），AWS S3 本身可留空 */
  endpoint: string;
  region: string;
  bucket: string;
  /**
   * presigned URL 的過期時間（秒）。選填，留空或 0 時使用伺服器端預設值
   * （15 分鐘，見 @workspace/server 套件 src/presign.mjs 的 DEFAULT_EXPIRES_IN）。
   */
  expiresIn?: number;
}

/** 檔案上傳設定 */
export interface AppStorage {
  /** 提供對外存取檔案用的 domain / url（例如 CDN 網域或 public bucket 網址） */
  domain: string;
  /** 目前啟用的儲存供應商（可複選：本機 / S3，兩者可同時啟用） */
  providers: AppStorageProvider[];
  /** provider 包含 's3' 時使用的連線設定 */
  s3: AppStorageS3Config;
}

/** 第三方登入（OAuth）用的 client id 設定（純文字欄位，不含 secret 以外的其他機密） */
export interface AppAuth {
  googleClientId: string;
  microsoftClientId: string;
}

/** 單一 app 的設定欄位。可依需求擴充（例如 locale 預設值、logo url...等）。 */
export interface AppSettings {
  /** 網站 / 專案名稱 */
  siteName: string;
  /** 網站網址 */
  siteUrl: string;
  /** 簡短描述（可留空） */
  description?: string;
  /** SEO 設定（選填，未設定時視為尚未填寫） */
  seo?: AppSeo;
  /** favicon / 圖示設定（選填） */
  favicon?: AppFavicon;
  /** 第三方分析 / 追蹤代碼設定（選填） */
  analytics?: AppAnalytics;
  /** 檔案上傳設定（選填） */
  storage?: AppStorage;
  /** 第三方登入（OAuth）設定（選填） */
  auth?: AppAuth;
}

/** 整份 app 設定資料：app -> 設定 */
export type AppsData = Record<string /* app */, AppSettings>;

/** app 名稱只允許英數字、底線、連字號（與 pages / i18n 的 isSafeId 規則一致） */
export const SAFE_APP_RE = /^[a-zA-Z0-9_-]+$/;

export function isSafeApp(name: string): boolean {
  return typeof name === 'string' && name.length > 0 && SAFE_APP_RE.test(name);
}

export function emptyAppSeoOpenGraph(): AppSeoOpenGraph {
  return { type: '', title: '', description: '', image: '', imageAlt: '', url: '', siteName: '', locale: '' };
}

export function emptyAppSeoTwitter(): AppSeoTwitter {
  return { card: '', site: '', creator: '', title: '', description: '', image: '' };
}

export function emptyAppSeo(): AppSeo {
  return {
    title: '',
    titleTemplate: '',
    description: '',
    keywords: [],
    canonicalUrl: '',
    language: '',
    locale: '',
    openGraph: emptyAppSeoOpenGraph(),
    twitter: emptyAppSeoTwitter(),
  };
}

export function emptyAppFavicon(): AppFavicon {
  return { favicon: '', appleTouchIcon: '', manifest: '' };
}

export function emptyAppAnalytics(): AppAnalytics {
  return {
    googleAnalyticsId: '',
    googleTagManagerId: '',
    metaPixelId: '',
    linkedinInsightId: '',
    tiktokPixelId: '',
  };
}

export function emptyAppStorageS3Config(): AppStorageS3Config {
  return { accessKeyId: '', secretAccessKey: '', endpoint: '', region: '', bucket: '', expiresIn: undefined };
}

export function emptyAppStorage(): AppStorage {
  return { domain: '', providers: [], s3: emptyAppStorageS3Config() };
}

export function emptyAppAuth(): AppAuth {
  return { googleClientId: '', microsoftClientId: '' };
}

export function emptyAppSettings(): AppSettings {
  return {
    siteName: '',
    siteUrl: '',
    description: '',
    seo: emptyAppSeo(),
    favicon: emptyAppFavicon(),
    analytics: emptyAppAnalytics(),
    storage: emptyAppStorage(),
    auth: emptyAppAuth(),
  };
}

/**
 * 把可能缺少 seo / favicon / analytics / storage / auth（例如舊資料、或磁碟上
 * 手寫的 app.json 尚未包含這幾個欄位）的設定補齊成完整形狀，供表單綁定使用，
 * 避免畫面上到處寫 `settings.seo?.title ?? ''` 這種防禦式判斷。
 */
export function normalizeAppSettings(
  settings: AppSettings
): Required<Pick<AppSettings, 'seo' | 'favicon' | 'analytics' | 'storage' | 'auth'>> & AppSettings {
  const seo = settings.seo ?? emptyAppSeo();
  const favicon = settings.favicon ?? emptyAppFavicon();
  const analytics = settings.analytics ?? emptyAppAnalytics();
  const storage = settings.storage ?? emptyAppStorage();
  const auth = settings.auth ?? emptyAppAuth();
  // 相容舊資料：舊版 storage.provider 是單選字串（'local' | 's3'），
  // 新版改為 storage.providers 陣列（可複選）。讀到舊格式時自動轉換。
  const legacyProvider = (storage as unknown as { provider?: AppStorageProvider }).provider;
  const providers = Array.isArray((storage as Partial<AppStorage>).providers)
    ? (storage as AppStorage).providers
    : legacyProvider
      ? [legacyProvider]
      : [];
  return {
    ...settings,
    seo: {
      ...emptyAppSeo(),
      ...seo,
      openGraph: { ...emptyAppSeoOpenGraph(), ...seo.openGraph },
      twitter: { ...emptyAppSeoTwitter(), ...seo.twitter },
    },
    favicon: { ...emptyAppFavicon(), ...favicon },
    analytics: { ...emptyAppAnalytics(), ...analytics },
    storage: {
      ...emptyAppStorage(),
      ...storage,
      providers,
      s3: { ...emptyAppStorageS3Config(), ...storage.s3 },
    },
    auth: { ...emptyAppAuth(), ...auth },
  };
}
