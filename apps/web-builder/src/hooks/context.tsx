import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { appsData as diskAppsData, subscribeAppData } from '@/lib/data';
import { AppContext, type AppContextValue } from '@/hooks/context-core';
import { loadAppsData, subscribeAppsData } from '@/store/settings-storage';
import type { AppsData } from '@/types/types';

// ---------------------------------------------------------------------------
// 全域「目前 app」狀態。
//
// app 是最外層的概念（見 /admin），在這一版之後「頁面管理（/live）」
// 與「i18n 管理（/i18n）」不再各自帶 `:app` 路由參數、也不再各自提供
// app 的選擇/切換 UI —— 一律直接使用這裡提供的「目前 app」，
// 由最外層 layout 的 dropdown 統一切換。
//
// 「有哪些 app」比照 pages / i18n 的 localStorage 優先模式：
//   - 磁碟快照（app-data.ts 用 import.meta.glob 靜態掃描
//     data/*/app.json 組成）是 fallback 基準。
//   - 瀏覽器 localStorage（app-settings:data，見
//     src/pages/storage.ts）疊加在磁碟快照之上——尚未寫入磁碟的
//     「新增 app」也會立刻出現在這裡的清單、可以馬上切換過去使用。
//   - 兩者用 app 名稱聯集（key union）合併，localStorage 有紀錄的
//     app 以 localStorage 內容為準；只在磁碟上、localStorage 還沒有
//     紀錄的 app 則直接採用磁碟內容。
//
// 注意：Context 物件本身與 useApp hook 定義在 app-context-core.tsx，
// 這個檔案只放 Provider ——即使 app-data.ts 因為 dev 模式寫回磁碟而觸發
// HMR、重新算出新的 appsData，Context 物件本身完全不受影響，
// 不會有「useApp must be used within a AppProvider」的問題。
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'current-app';

function readStoredApp(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredApp(ns: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, ns);
  } catch {
    // localStorage 不可用（例如無痕模式限制）時，退回單純的 in-memory state 即可。
  }
}

/** 合併磁碟快照與 localStorage：app 名稱聯集，localStorage 內容優先。 */
function mergeAppsMap(disk: AppsData, local: AppsData): AppsData {
  return { ...disk, ...local };
}

export function AppProvider({ children }: { children: ReactNode }) {
  // apps 清單：磁碟快照 + localStorage 疊加（見上方說明）。用 state 存，
  // 讓 dev 模式下寫回磁碟（透過 subscribeAppData）或在瀏覽器裡新增/
  // 刪除/重新命名 app 都能即時反映，不需要整頁重新整理。
  const [appsMap, setAppsMap] = useState<AppsData>(() =>
    mergeAppsMap(diskAppsData, loadAppsData())
  );
  const apps = useMemo(() => Object.keys(appsMap).sort(), [appsMap]);

  const [app, setAppState] = useState<string | null>(() => {
    const stored = readStoredApp();
    if (stored && apps.includes(stored)) return stored;
    return apps[0] ?? null;
  });

  // 磁碟快照更新時（dev 模式下 `/admin` 寫入檔案系統，或其他人直接編輯
  // data/{app}/app.json 觸發 HMR）：重新跟目前的 localStorage 合併，
  // 而不是直接採用磁碟內容 —— 避免蓋掉使用者在瀏覽器裡尚未寫入磁碟的編輯。
  useEffect(() => {
    return subscribeAppData((next) => {
      setAppsMap(mergeAppsMap(next.appsData, loadAppsData()));
    });
  }, []);

  // localStorage 中的 app 設定變動時（同分頁內：新增 / 刪除 / 重新命名
  // app、或編輯 site name 等欄位）：同樣重新合併，確保這裡看到的
  // apps 清單與 /admin 頁面的 localStorage 狀態隨時一致。
  useEffect(() => {
    return subscribeAppsData((local) => {
      setAppsMap(mergeAppsMap(diskAppsData, local));
    });
  }, []);

  // apps 清單改變（新增/刪除/重新命名）時，若目前選定的 app 已經
  // 不存在，自動 fallback 回第一個可用的 app。
  useEffect(() => {
    if (app && apps.includes(app)) return;
    const fallback = apps[0] ?? null;
    setAppState(fallback);
    if (fallback) writeStoredApp(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps]);

  function setApp(ns: string) {
    if (!apps.includes(ns)) return;
    setAppState(ns);
    writeStoredApp(ns);
  }

  const value = useMemo<AppContextValue>(
    () => ({ app, apps, setApp }),
    [app, apps]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// 保留原本的匯出路徑，避免其他檔案需要跟著改 import 路徑。
export { useApp } from '@/hooks/context-core';
export type { AppContextValue } from '@/hooks/context-core';
