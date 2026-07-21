// i18n 版本管理：型別定義 + diff 工具函式。
//
// 設計方向（簡單版本管理，非完整的版控系統）：
//   - 「建立新版本」= 把目前 app 的 i18n 資料（所有語系 + key 型別標記）
//     整份拍照存起來，並記錄 `parentId` 指向「建立當下最新的一個版本」，
//     形成一條線性歷史（v1 -> v2 -> v3 -> ...），不支援分支/合併。
//   - 每個版本都是「完整快照」（不是差異），這樣還原、匯出都不需要重放
//     整條歷史、邏輯最單純；差異永遠是「需要時才即時比較兩個快照算出來」，
//     而不是儲存時就先算好存成 diff（那樣還原任一版本都要重放整條鏈）。
//   - 版本本身存在 localStorage（跟現有 i18n 資料一樣，透過
//     `createAppKeyedStorage`），純粹是編輯過程中的「儲存點」，
//     不涉及寫入/讀取檔案系統。

import type { AppLocales, FlatDict, KeyTypeMap } from '@/utils/i18n-utils';

export interface I18nVersion {
  id: string;
  /** 使用者可自訂的版本名稱，未填時 UI 上以「第 N 版」代稱 */
  label: string;
  createdAt: string;
  /** 上一個版本的 id；第一個版本為 null，形成一條線性歷史。 */
  parentId: string | null;
  /** 建立當下，該 app 全部語系的完整快照（深拷貝，不與後續編輯共享參照）。 */
  snapshot: AppLocales;
  /** 建立當下，該 app 每個 key 的型別標記快照。 */
  keyTypes: KeyTypeMap;
}

/** 一個 app 底下的版本歷史：陣列，依建立時間先後（index 0 = 最早） */
export type I18nVersionHistory = I18nVersion[];

/** 整份版本資料：app -> 版本歷史 */
export type I18nVersionsData = Record<string /* app */, I18nVersionHistory>;

let idCounter = 0;
export function nextVersionId(): string {
  idCounter += 1;
  return `v${Date.now().toString(36)}${idCounter}`;
}

/** 取得歷史中的「最新版本」（陣列最後一筆），沒有任何版本時回傳 null。 */
export function latestVersion(history: I18nVersionHistory): I18nVersion | null {
  return history.length > 0 ? history[history.length - 1] : null;
}

/**
 * 建立一個新版本：基於「目前歷史的最新版本」（若歷史是空的，parentId 為 null，
 * 代表這是第一個版本）。快照內容用 `structuredClone` 深拷貝，避免之後編輯
 * `data`/`metaData` 時意外影響到已經存起來的版本。
 */
export function createVersion(
  history: I18nVersionHistory,
  label: string,
  snapshot: AppLocales,
  keyTypes: KeyTypeMap
): I18nVersion {
  const parent = latestVersion(history);
  return {
    id: nextVersionId(),
    label: label.trim(),
    createdAt: new Date().toISOString(),
    parentId: parent?.id ?? null,
    snapshot: structuredClone(snapshot),
    keyTypes: structuredClone(keyTypes),
  };
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type KeyDiffStatus = 'added' | 'removed' | 'changed';

export interface KeyDiffEntry {
  key: string;
  status: KeyDiffStatus;
  /** status 為 'removed' 時為 undefined */
  from?: string;
  /** status 為 'added' 時為 undefined */
  to?: string;
}

/** 單一語系的差異：新增/刪除/改動的 key 各自列一份 */
export type LocaleDiff = KeyDiffEntry[];

/** 一次版本比較的完整結果：locale -> 該語系的差異列表 */
export interface VersionDiff {
  /** 兩個版本之間新增的語系（該語系在 from 沒有、在 to 有） */
  addedLocales: string[];
  /** 兩個版本之間刪除的語系（該語系在 from 有、在 to 沒有） */
  removedLocales: string[];
  /** 兩邊都有的語系，各自的 key 差異 */
  localeDiffs: Record<string, LocaleDiff>;
}

function diffFlatDict(from: FlatDict, to: FlatDict): LocaleDiff {
  const entries: LocaleDiff = [];
  const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const key of Array.from(allKeys).sort()) {
    const before = from[key];
    const after = to[key];
    if (before === undefined && after !== undefined) {
      entries.push({ key, status: 'added', to: after });
    } else if (before !== undefined && after === undefined) {
      entries.push({ key, status: 'removed', from: before });
    } else if (before !== after) {
      entries.push({ key, status: 'changed', from: before, to: after });
    }
  }
  return entries;
}

/** 比較兩個版本的快照，算出逐語系的差異。`from` 通常是較舊的版本，`to` 是較新的版本。 */
export function diffVersions(from: I18nVersion, to: I18nVersion): VersionDiff {
  const fromLocales = Object.keys(from.snapshot);
  const toLocales = Object.keys(to.snapshot);
  const addedLocales = toLocales.filter((l) => !fromLocales.includes(l)).sort();
  const removedLocales = fromLocales.filter((l) => !toLocales.includes(l)).sort();
  const commonLocales = toLocales.filter((l) => fromLocales.includes(l)).sort();

  const localeDiffs: Record<string, LocaleDiff> = {};
  for (const locale of commonLocales) {
    const diff = diffFlatDict(from.snapshot[locale], to.snapshot[locale]);
    if (diff.length > 0) localeDiffs[locale] = diff;
  }
  // 新增/刪除的語系也各自整份列成一筆 diff，方便匯出時看到完整內容。
  for (const locale of addedLocales) {
    localeDiffs[locale] = diffFlatDict({}, to.snapshot[locale]);
  }
  for (const locale of removedLocales) {
    localeDiffs[locale] = diffFlatDict(from.snapshot[locale], {});
  }

  return { addedLocales, removedLocales, localeDiffs };
}

/** 這次差異總共影響了幾個 key（跨所有語系加總，供 UI 顯示摘要用） */
export function countDiffEntries(diff: VersionDiff): number {
  return Object.values(diff.localeDiffs).reduce((sum, entries) => sum + entries.length, 0);
}

/** 把 VersionDiff 轉成適合下載的 JSON 字串（附上兩端版本的 metadata）。 */
export function exportDiffToJson(from: I18nVersion, to: I18nVersion, diff: VersionDiff): string {
  return JSON.stringify(
    {
      from: { id: from.id, label: from.label, createdAt: from.createdAt },
      to: { id: to.id, label: to.label, createdAt: to.createdAt },
      addedLocales: diff.addedLocales,
      removedLocales: diff.removedLocales,
      changes: diff.localeDiffs,
    },
    null,
    2
  );
}
