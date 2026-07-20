// 共用的「以 app 為單位」localStorage 存取層。
//
// App 設定（app.json）、頁面（pages.json）、i18n（i18n/{locale}.json）
// 三個功能的資料形狀雖然不同，但存取模式完全一樣：
//
//   type XxxData = Record<app, T>
//
//   - 整份資料存在單一 localStorage key 底下。
//   - 進入編輯畫面時：優先讀 localStorage；只有該 app 在 localStorage
//     完全沒有紀錄時，才 fallback 到 build 時用 import.meta.glob 靜態讀進來的
//     磁碟內容。
//   - 編輯過程：每次改動即時整份寫回 localStorage，不需要使用者按任何按鈕，
//     也不會因為重新整理分頁而遺失。
//   - 只有「寫入檔案系統」「從檔案系統讀取（覆蓋）」這兩個明確按鈕才會跟
//     檔案系統互動（見各自的 disk-api.ts）。
//
// 三個功能（app/storage.ts、dynamic/storage.ts、i18n/storage.ts）都是
// 這個共用模式的一個實例，因此把「讀 / 寫 / 決定初始值」這幾個函式抽到這裡，
// 用同一份實作、只是各自帶不同的 storageKey，避免三處各自重複同一套
// try/catch + JSON.parse 邏輯。

/** 建立一個「以 app 為 key 的物件」localStorage 存取層。 */
export function createAppKeyedStorage<T>(storageKey: string) {
  type Data = Record<string /* app */, T>;

  /** 讀出整份資料（app -> T）。key 不存在或內容壞掉時回傳 `{}`。 */
  function load(): Data {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Data;
      }
      return {};
    } catch {
      return {};
    }
  }

  /** 整份覆寫（app -> T）。回傳是否寫入成功（例如 localStorage 容量爆掉時會是 false）。 */
  function save(data: Data): boolean {
    let ok = true;
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // localStorage 不可用或容量爆掉時，不在這裡拋出例外——呼叫端（例如
      // file-storage.ts）需要能明確知道這次寫入失敗並告知使用者，因此改成
      // 回傳 false，由呼叫端決定要不要顯示錯誤訊息，而不是整個吞掉。
      ok = false;
    }
    notify(data);
    return ok;
  }

  // -------------------------------------------------------------------
  // 同分頁內的變更通知。
  //
  // 瀏覽器原生的 `storage` event 只會在「其他分頁」修改 localStorage 時觸發，
  // 同一分頁內呼叫 `localStorage.setItem` 不會讓自己收到通知。但這個專案裡
  // 常見的情境是：同一個分頁內，A 元件（例如 /admin 或 /app 的編輯表單）呼叫
  // `save()` 之後，B 元件（例如最外層 layout 的 app 切換 dropdown，
  // 見 app-context.tsx）需要立即看到最新的 app 清單，不必依賴
  // 使用者重新整理分頁。因此這裡額外提供一個 in-memory 的 subscribe，
  // 讓同分頁內的其他 React tree 也能訂閱到「這個 storageKey 的資料變了」。
  // -------------------------------------------------------------------
  const listeners = new Set<(data: Data) => void>();

  function notify(data: Data): void {
    listeners.forEach((fn) => fn(data));
  }

  function subscribe(fn: (data: Data) => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }

  /** 只取出單一 app 目前在 localStorage 裡的值（不存在回傳 undefined）。 */
  function loadApp(app: string): T | undefined {
    return load()[app];
  }

  /**
   * 更新單一 app 的值，其餘 app 維持不變後整份寫回。
   * 等同 `save({ ...load(), [app]: value })`，但語意更清楚。
   * 回傳是否寫入成功（見 save() 的說明）。
   */
  function saveApp(app: string, value: T): boolean {
    const all = load();
    return save({ ...all, [app]: value });
  }

  /** 從整份資料中移除某個 app（app 被刪除 / 重新命名時使用）。 */
  function removeApp(app: string): void {
    const all = load();
    if (!(app in all)) return;
    const next = { ...all };
    delete next[app];
    save(next);
  }

  /**
   * 把某個 app 從 oldName 改名成 newName（值不變，key 換掉）。
   * 若 oldName 在 localStorage 裡沒有資料則什麼都不做（表示尚未在瀏覽器編輯過，
   * 不需要搬移任何暫存內容）。
   */
  function renameApp(oldName: string, newName: string): void {
    const all = load();
    if (!(oldName in all)) return;
    const next = { ...all };
    next[newName] = next[oldName];
    delete next[oldName];
    save(next);
  }

  /**
   * 取得「目前應該拿來初始化畫面」的某個 app 的值：
   * localStorage 裡若已經有這個 app 的紀錄（即使是空值，也視為
   * 「使用者曾經在這裡編輯過」）優先採用；否則 fallback 到磁碟初始值。
   */
  function resolveInitialForApp(app: string, diskValue: T): T {
    const all = load();
    if (app in all) return all[app];
    return diskValue;
  }

  return {
    load,
    save,
    loadApp,
    saveApp,
    removeApp,
    renameApp,
    resolveInitialForApp,
    subscribe,
  };
}

export type AppKeyedStorage<T> = ReturnType<typeof createAppKeyedStorage<T>>;
