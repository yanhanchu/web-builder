import { createContext, useContext } from 'react';

// ---------------------------------------------------------------------------
// 這個檔案只放 Context 物件本身與 useApp hook，刻意跟 AppProvider
// （見 app-context.tsx）分開。
//
// 原因：AppProvider 會 `import rawAppsData from '../../data/apps.json'`，
// 而 `/admin` 頁面的新增 / 刪除 / 重新命名 / 儲存設定都會透過
// write-apps-plugin.mjs 觸發 `syncAggregates()` 重寫 `data/apps.json`。
// 這份 json 檔案改變時，Vite 會讓「靜態 import 它的模組」連同該模組整個 HMR 失效並重新載入。
//
// 如果 Context 物件（createContext(...)）跟會被上述 HMR 影響到的 Provider
// 定義在同一個檔案，該檔案重新執行時會產生「一個新的 Context 物件」；但這個模組圖裡
// 其他仍然引用「舊模組實例」的檔案（例如尚未一起被 HMR 更新的 layout.tsx）拿到的
// 還是舊的 Context 物件 —— 這時 `useContext(舊 Context)` 在新的 Provider（新 Context）
// 底下就會拿到 null，即使程式碼看起來「Provider 明明包著整棵樹」。這正是
// `useApp must be used within a AppProvider` 這個錯誤的成因。
//
// 把 Context 物件與 hook 抽到這個獨立、不會被 data/apps.json 變動影響到的檔案，
// 確保它的模組實例永遠穩定、不會因為編輯 app 而被重新建立，
// Provider 檔案本身即使被 HMR 整個重新執行，也還是套用同一個 Context 物件。
// ---------------------------------------------------------------------------

export interface AppContextValue {
  /** 目前選定的 app（一定是 apps 清單中的其中一個，或清單為空時是 null） */
  app: string | null;
  /** 所有已註冊的 app（來自 data/apps.json，依字母排序） */
  apps: string[];
  /** 切換目前 app，並持久化到 localStorage */
  setApp: (ns: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

/** 取得目前選定的 app（由最外層 layout 的 dropdown 統一切換）。 */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within a AppProvider');
  }
  return ctx;
}
