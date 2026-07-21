// `data/{app}/i18n/{locale}.json` 的讀寫 API 呼叫層。
//
// 從 i18n-manager.tsx 抽出來，讓 `/i18n` 頁面本身與 `/app`
// （App 設定頁的「資料同步」卡片）可以共用同一套「寫入檔案系統」
// 「從檔案系統讀取（覆蓋）」邏輯，不用各自重寫一次 fetch。
//
// 只在 `vite dev` 環境有效，見 scripts/write-i18n-plugin.mjs。

import type { ExportFormat, AppLocales, KeyTypeMap } from '@/utils/i18n-utils';
import type { I18nVersionHistory } from '@/utils/i18n-versions';

export type DiskApiResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * 把某個 app 底下所有語系整包寫入 `data/{app}/i18n/{locale}.json`（不含 metadata，格式與原本相同），
 * 並另外寫入一份含 metadata 的 `data/{app}/i18n/{locale}.meta.json`（key 的 type 標記）。
 *
 * `versionHistory` 選填：有提供時一併寫入 `data/{app}/i18n/versions.json`，
 * 讓版本歷史（原本純粹存在瀏覽器 localStorage，見 i18n-version-storage.ts）
 * 也能跟著語系資料一起參與寫回檔案系統，不會因為清瀏覽器資料/換裝置就遺失。
 * 不提供時（例如只是改翻譯內容、還沒建立新版本）磁碟上既有的 versions.json
 * 不會被動到。
 */
export async function writeI18nToDisk(
  app: string,
  locales: AppLocales,
  format: ExportFormat,
  keyTypes?: KeyTypeMap,
  versionHistory?: I18nVersionHistory
): Promise<DiskApiResult<{ writtenFiles: string[] }>> {
  try {
    const res = await fetch('/__api/write-i18n', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app,
        locales,
        format,
        keyTypes: keyTypes ?? {},
        ...(versionHistory !== undefined ? { versionHistory } : {}),
      }),
    });
    const data = (await res.json().catch(() => null)) as
      | DiskApiResult<{ writtenFiles: string[] }>
      | null;
    if (!res.ok || !data) return { ok: false, error: data && 'error' in data ? data.error : `HTTP ${res.status}` };
    return data;
  } catch (err) {
    return {
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)}（僅 \`npm run dev\` 環境提供此 API，離線或正式站會失敗）`,
    };
  }
}

/**
 * 讀取 `data/{app}/i18n/` 底下所有語系，回傳統一攤平後的 AppLocales；
 * 若磁碟上有對應的 `.meta.json`，一併回傳合併後的 keyTypes（key -> type）；
 * 若磁碟上有 `versions.json`，一併回傳版本歷史（沒有則為空陣列）。
 */
export async function readI18nFromDisk(
  app: string
): Promise<
  DiskApiResult<{
    locales: AppLocales;
    localeFiles: string[];
    keyTypes?: KeyTypeMap;
    versionHistory?: I18nVersionHistory;
  }>
> {
  try {
    const res = await fetch(`/__api/write-i18n?app=${encodeURIComponent(app)}`);
    const data = (await res.json().catch(() => null)) as
      | DiskApiResult<{
          locales: AppLocales;
          localeFiles: string[];
          keyTypes?: KeyTypeMap;
          versionHistory?: I18nVersionHistory;
        }>
      | null;
    if (!res.ok || !data) return { ok: false, error: data && 'error' in data ? data.error : `HTTP ${res.status}` };
    return data;
  } catch (err) {
    return {
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)}（僅 \`npm run dev\` 環境提供此 API，離線或正式站會失敗）`,
    };
  }
}
