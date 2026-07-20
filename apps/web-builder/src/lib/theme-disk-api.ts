// `data/theme.json` 的讀寫 API 呼叫層。
//
// 跟 src/lib/routes-disk-api.ts 相同的模式，但主題設定是全域共用一份
// （不分 app），對應後端 scripts/write-theme.mjs / write-theme-plugin.mjs。
//
// 只在 `vite dev` 環境有效。

import type { ThemeConfig } from '@/types/theme-types';

export type DiskApiResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** 把目前編輯的 ThemeConfig 寫入 data/theme.json */
export async function writeThemeToDisk(
  themeConfig: ThemeConfig
): Promise<DiskApiResult<{ writtenFile: string }>> {
  try {
    const res = await fetch('/__api/write-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeConfig }),
    });
    const data = (await res.json().catch(() => null)) as DiskApiResult<{ writtenFile: string }> | null;
    if (!res.ok || !data) return { ok: false, error: data && 'error' in data ? data.error : `HTTP ${res.status}` };
    return data;
  } catch (err) {
    return {
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)}（僅 \`npm run dev\` 環境提供此 API，離線或正式站會失敗）`,
    };
  }
}

/** 讀取磁碟上目前的 theme.json（不存在時 themeConfig 為 null） */
export async function readThemeFromDisk(): Promise<DiskApiResult<{ themeConfig: ThemeConfig | null }>> {
  try {
    const res = await fetch('/__api/write-theme');
    const data = (await res.json().catch(() => null)) as DiskApiResult<{ themeConfig: ThemeConfig | null }> | null;
    if (!res.ok || !data) return { ok: false, error: data && 'error' in data ? data.error : `HTTP ${res.status}` };
    return data;
  } catch (err) {
    return {
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)}（僅 \`npm run dev\` 環境提供此 API，離線或正式站會失敗）`,
    };
  }
}
