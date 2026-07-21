import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadI18nData, saveI18nData, loadI18nMetaData, saveI18nMetaData } from '@/store/i18n-storage';
import { readI18nFromDisk, writeI18nToDisk } from '@/lib/i18n-disk-api';
import {
  loadI18nVersionHistory,
  saveI18nVersionHistory,
} from '@/store/i18n-version-storage';
import {
  createVersion,
  diffVersions,
  countDiffEntries,
  exportDiffToJson,
  latestVersion,
  type I18nVersion,
  type I18nVersionHistory,
  type VersionDiff,
} from '@/utils/i18n-versions';
import {
  collectAllKeys,
  downloadFilesAsZip,
  downloadTextFile,
  exportFlatToJson,
  importJsonToFlatWithMeta,
  VALUE_TYPES,
  DEFAULT_VALUE_TYPE,
  type ExportFormat,
  type FlatDict,
  type I18nData,
  type I18nMetaData,
  type ValueType,
} from '@/utils/i18n-utils';
import { i18nStyles as styles } from '@/styles/i18n-styles';
import { cn } from '@workspace/ui/utils/utils';
import { useApp } from '@/hooks/context';
import { ValueTypeField, isValidValueForType, valueTypeErrorMessage } from '@/components/value-type-input';

/** 把版本的 ISO 時間字串轉成畫面上好讀的格式（本地時間，到分鐘）。 */
function formatVersionTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * `/i18n` — 目前 app 底下的多語系翻譯管理。
 *
 * 目前 app 統一取自最外層 layout 的切換 dropdown（見 `useApp`），
 * 這裡不再帶 `:app` 路由參數，也不再提供 app 選擇/切換 UI；
 * app 本身的新增 / 刪除 / 重新命名統一在 `/admin` 管理。
 */
export function I18nManager() {
  const { app } = useApp();
  const [data, setData] = useState<I18nData>(() => loadI18nData());
  const [metaData, setMetaData] = useState<I18nMetaData>(() => loadI18nMetaData());
  // 「草稿值」：使用者正在輸入、但格式還不合法（或還沒失焦確認）的值，跟
  // 已經存進 `data` 的值分開放。輸入框顯示草稿優先於 `data`，這樣使用者
  // 打字打到一半（格式暫時不合法）時畫面不會被打斷；只有驗證通過才寫進
  // `data`（也就是實際會被存檔/顯示在頁面上的值），驗證不過就不寫入，
  // 只在輸入框旁顯示錯誤訊息。key 格式："key\u0000locale"。
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [valueErrors, setValueErrors] = useState<Record<string, string>>({});
  const activeNs = app ?? null;
  const [newLocaleName, setNewLocaleName] = useState('');
  const [search, setSearch] = useState('');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('nested');
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [importTargetLocale, setImportTargetLocale] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveI18nData(data);
  }, [data]);

  useEffect(() => {
    saveI18nMetaData(metaData);
  }, [metaData]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  // -------------------------------------------------------------------
  // 版本管理：簡單的線性版本歷史（v1 -> v2 -> v3 -> ...），每個版本都是
  // 「當下全部語系 + key 型別標記」的完整快照，存在 localStorage
  // （見 i18n-version-storage.ts）。新版本永遠基於「目前歷史中最新的
  // 一個版本」建立（parentId 指向它），不支援分支。
  // -------------------------------------------------------------------
  const [versionHistory, setVersionHistory] = useState<I18nVersionHistory>(() =>
    activeNs ? loadI18nVersionHistory(activeNs) : []
  );
  const [newVersionLabel, setNewVersionLabel] = useState('');
  const [diffFromId, setDiffFromId] = useState<string>('');
  const [diffToId, setDiffToId] = useState<string>('');
  const [showVersionPanel, setShowVersionPanel] = useState(false);

  // 切換 app 時，重新載入該 app 自己的版本歷史（各 app 的版本歷史彼此獨立）。
  useEffect(() => {
    setVersionHistory(activeNs ? loadI18nVersionHistory(activeNs) : []);
  }, [activeNs]);

  useEffect(() => {
    if (!activeNs) return;
    saveI18nVersionHistory(activeNs, versionHistory);
  }, [activeNs, versionHistory]);

  const currentVersion = latestVersion(versionHistory);

  // 預設把 diff 的兩端設成「上一版 -> 最新版」，最符合「新版本基於上一版本，
  // 想看這次改了什麼」的使用情境；版本歷史變動時（新增/切換 app）重新校正。
  useEffect(() => {
    if (versionHistory.length === 0) {
      setDiffFromId('');
      setDiffToId('');
      return;
    }
    if (versionHistory.length === 1) {
      setDiffFromId(versionHistory[0].id);
      setDiffToId(versionHistory[0].id);
      return;
    }
    const last = versionHistory[versionHistory.length - 1];
    const secondLast = versionHistory[versionHistory.length - 2];
    setDiffFromId((prev) => (versionHistory.some((v) => v.id === prev) ? prev : secondLast.id));
    setDiffToId((prev) => (versionHistory.some((v) => v.id === prev) ? prev : last.id));
  }, [versionHistory]);

  /** 把目前 app 的編輯內容（data[activeNs] + metaData[activeNs]）拍照存成新版本。 */
  function handleCreateVersion() {
    if (!activeNs) return;
    const nsData = data[activeNs] ?? {};
    if (Object.keys(nsData).length === 0) {
      showToast('目前沒有任何語系可以建立版本');
      return;
    }
    const nsMeta = metaData[activeNs] ?? {};
    const label = newVersionLabel.trim() || `第 ${versionHistory.length + 1} 版`;
    const version = createVersion(versionHistory, label, nsData, nsMeta);
    setVersionHistory((prev) => [...prev, version]);
    setNewVersionLabel('');
    showToast(`已建立版本「${version.label}」（基於${version.parentId ? '上一個版本' : '無（第一個版本）'}）`);
  }

  /** 用指定版本的快照整批覆蓋目前 app 的編輯內容（data + metaData），不影響版本歷史本身。 */
  function handleRestoreVersion(version: I18nVersion) {
    if (!activeNs) return;
    if (
      !window.confirm(
        `確定要用版本「${version.label}」（建立於 ${formatVersionTime(version.createdAt)}）覆蓋目前瀏覽器中「${activeNs}」的所有語系嗎？此動作不會刪除任何版本紀錄，但會覆蓋目前尚未存成新版本的編輯內容。`
      )
    ) {
      return;
    }
    setData((prev) => ({ ...prev, [activeNs]: structuredClone(version.snapshot) }));
    setMetaData((prev) => ({ ...prev, [activeNs]: structuredClone(version.keyTypes) }));
    showToast(`已還原至版本「${version.label}」`);
  }

  function handleDeleteVersion(version: I18nVersion) {
    if (!window.confirm(`確定要刪除版本「${version.label}」？此動作只刪除這筆版本紀錄，不影響目前編輯內容。`)) {
      return;
    }
    setVersionHistory((prev) => prev.filter((v) => v.id !== version.id));
  }

  const diffFromVersion = useMemo(
    () => versionHistory.find((v) => v.id === diffFromId) ?? null,
    [versionHistory, diffFromId]
  );
  const diffToVersion = useMemo(
    () => versionHistory.find((v) => v.id === diffToId) ?? null,
    [versionHistory, diffToId]
  );
  const versionDiff: VersionDiff | null = useMemo(() => {
    if (!diffFromVersion || !diffToVersion) return null;
    return diffVersions(diffFromVersion, diffToVersion);
  }, [diffFromVersion, diffToVersion]);
  const diffEntryCount = versionDiff ? countDiffEntries(versionDiff) : 0;

  function handleExportDiff() {
    if (!activeNs || !diffFromVersion || !diffToVersion || !versionDiff) return;
    const json = exportDiffToJson(diffFromVersion, diffToVersion, versionDiff);
    downloadTextFile(
      `${activeNs}-i18n-diff-${diffFromVersion.label}-to-${diffToVersion.label}.json`,
      json
    );
    showToast(`已匯出差異：「${diffFromVersion.label}」→「${diffToVersion.label}」`);
  }

  const locales = useMemo(() => {
    if (!activeNs || !data[activeNs]) return [];
    return Object.keys(data[activeNs]).sort();
  }, [data, activeNs]);

  useEffect(() => {
    if (locales.length > 0 && !importTargetLocale) {
      setImportTargetLocale(locales[0]);
    }
    if (locales.length > 0 && !locales.includes(importTargetLocale)) {
      setImportTargetLocale(locales[0]);
    }
    if (locales.length === 0) {
      setImportTargetLocale('');
    }
  }, [locales, importTargetLocale]);

  const allKeys = useMemo(() => {
    if (!activeNs || !data[activeNs]) return [];
    const keys = collectAllKeys(data[activeNs]);
    if (!search.trim()) return keys;
    const q = search.trim().toLowerCase();
    return keys.filter((k) => {
      if (k.toLowerCase().includes(q)) return true;
      for (const locale of locales) {
        const v = data[activeNs][locale]?.[k];
        if (v && v.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [activeNs, data, search, locales]);

  function addLocale() {
    if (!activeNs) return;
    const locale = newLocaleName.trim();
    if (!locale) return;
    setData((prev) => {
      const nsData = prev[activeNs] ?? {};
      if (nsData[locale]) {
        showToast(`語系「${locale}」已存在`);
        return prev;
      }
      return { ...prev, [activeNs]: { ...nsData, [locale]: {} } };
    });
    setNewLocaleName('');
  }

  function deleteLocale(locale: string) {
    if (!activeNs) return;
    if (!window.confirm(`確定要刪除語系「${locale}」？此動作無法復原。`)) return;
    setData((prev) => {
      const nsData = { ...(prev[activeNs] ?? {}) };
      delete nsData[locale];
      return { ...prev, [activeNs]: nsData };
    });
  }

  function updateValue(key: string, locale: string, value: string) {
    if (!activeNs) return;
    setData((prev) => {
      const nsData = prev[activeNs] ?? {};
      const localeDict = { ...(nsData[locale] ?? {}), [key]: value };
      return { ...prev, [activeNs]: { ...nsData, [locale]: localeDict } };
    });
  }

  /** 草稿 state 的複合 key，同一個 key 在不同語系的草稿彼此獨立。 */
  function draftKey(key: string, locale: string): string {
    return `${key}\u0000${locale}`;
  }

  /**
   * 輸入框 onChange 時呼叫：先把輸入原封不動存成草稿（畫面即時顯示使用者
   * 打的內容），再依這個 key 目前登記的型別驗證——通過才真的寫進 `data`
   * （即存檔會用到的值），沒通過就只更新錯誤訊息、不寫入 `data`，維持
   * `data` 裡的值是上一個合法值，避免不合法的內容被存檔。
   */
  function handleValueInput(key: string, locale: string, raw: string) {
    const dk = draftKey(key, locale);
    setDraftValues((prev) => ({ ...prev, [dk]: raw }));

    const valueType = keyTypeOf(key);
    if (isValidValueForType(valueType, raw)) {
      setValueErrors((prev) => {
        if (!(dk in prev)) return prev;
        const next = { ...prev };
        delete next[dk];
        return next;
      });
      updateValue(key, locale, raw);
    } else {
      setValueErrors((prev) => ({ ...prev, [dk]: valueTypeErrorMessage(valueType) }));
      // 驗證失敗：不呼叫 updateValue，`data` 裡維持上一個合法值不變。
    }
  }

  /** 輸入框顯示用的值：有草稿（使用者正在編輯/曾經打過不合法內容）優先用草稿，否則用已存檔的值。 */
  function displayValueOf(key: string, locale: string): string {
    const dk = draftKey(key, locale);
    return draftValues[dk] ?? data[activeNs ?? '']?.[locale]?.[key] ?? '';
  }

  function keyTypeOf(key: string): ValueType {
    if (!activeNs) return DEFAULT_VALUE_TYPE;
    return metaData[activeNs]?.[key] ?? DEFAULT_VALUE_TYPE;
  }

  function setKeyType(key: string, type: ValueType) {
    if (!activeNs) return;
    setMetaData((prev) => {
      const nsMeta = prev[activeNs] ?? {};
      return { ...prev, [activeNs]: { ...nsMeta, [key]: type } };
    });
  }

  function renameKey(oldKey: string, newKeyRaw: string) {
    if (!activeNs) return;
    const newKey = newKeyRaw.trim();
    if (!newKey || newKey === oldKey) return;
    setData((prev) => {
      const nsData = prev[activeNs] ?? {};
      const nextNs: Record<string, FlatDict> = {};
      for (const [locale, dict] of Object.entries(nsData)) {
        const nextDict = { ...dict };
        if (oldKey in nextDict) {
          nextDict[newKey] = nextDict[oldKey];
          delete nextDict[oldKey];
        }
        nextNs[locale] = nextDict;
      }
      return { ...prev, [activeNs]: nextNs };
    });
    setMetaData((prev) => {
      const nsMeta = { ...(prev[activeNs] ?? {}) };
      if (oldKey in nsMeta) {
        nsMeta[newKey] = nsMeta[oldKey];
        delete nsMeta[oldKey];
      }
      return { ...prev, [activeNs]: nsMeta };
    });
  }

  function deleteKey(key: string) {
    if (!activeNs) return;
    if (!window.confirm(`確定要刪除 key「${key}」（所有語系都會一併刪除）？`)) return;
    setData((prev) => {
      const nsData = prev[activeNs] ?? {};
      const nextNs: Record<string, FlatDict> = {};
      for (const [locale, dict] of Object.entries(nsData)) {
        const nextDict = { ...dict };
        delete nextDict[key];
        nextNs[locale] = nextDict;
      }
      return { ...prev, [activeNs]: nextNs };
    });
    setMetaData((prev) => {
      const nsMeta = { ...(prev[activeNs] ?? {}) };
      delete nsMeta[key];
      return { ...prev, [activeNs]: nsMeta };
    });
    // 一併清掉這個 key 殘留的草稿/錯誤狀態，避免之後新增同名 key 時
    // 意外繼承到舊的、其實已經不相關的錯誤訊息或未存檔草稿。
    const prefix = `${key}\u0000`;
    setDraftValues((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (k.startsWith(prefix)) delete next[k];
      return next;
    });
    setValueErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (k.startsWith(prefix)) delete next[k];
      return next;
    });
  }

  const [visibleLocales, setVisibleLocales] = useState<Record<string, boolean>>({});

  // 語系清單變動時，新出現的語系預設顯示；被刪除的語系順便清掉紀錄
  useEffect(() => {
    setVisibleLocales((prev) => {
      const next: Record<string, boolean> = {};
      for (const locale of locales) {
        next[locale] = prev[locale] ?? true;
      }
      return next;
    });
  }, [locales]);

  function toggleLocaleVisible(locale: string) {
    setVisibleLocales((prev) => ({ ...prev, [locale]: !prev[locale] }));
  }

  const shownLocales = useMemo(
    () => locales.filter((l) => visibleLocales[l] !== false),
    [locales, visibleLocales]
  );

  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  /** todo: haven't implement yet */
  // function toggleKeyExpanded(key: string) {
  //   setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  // }

  function expandAllKeys() {
    const next: Record<string, boolean> = {};
    for (const key of allKeys) next[key] = true;
    setExpandedKeys(next);
  }

  function collapseAllKeys() {
    setExpandedKeys({});
  }

  type SortMode = 'key-asc' | 'key-desc' | 'filled-asc' | 'filled-desc';
  const [sortMode, setSortMode] = useState<SortMode>('key-asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  function filledCountOf(key: string): number {
    if (!activeNs) return 0;
    return locales.filter((l) => (data[activeNs]?.[l]?.[key] ?? '').trim() !== '').length;
  }

  const sortedKeys = useMemo(() => {
    const list = [...allKeys];
    switch (sortMode) {
      case 'key-asc':
        list.sort((a, b) => a.localeCompare(b));
        break;
      case 'key-desc':
        list.sort((a, b) => b.localeCompare(a));
        break;
      case 'filled-asc':
        list.sort((a, b) => filledCountOf(a) - filledCountOf(b) || a.localeCompare(b));
        break;
      case 'filled-desc':
        list.sort((a, b) => filledCountOf(b) - filledCountOf(a) || a.localeCompare(b));
        break;
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allKeys, sortMode, data, activeNs, locales]);

  const totalPages = Math.max(1, Math.ceil(sortedKeys.length / pageSize));

  // app / 搜尋 / 每頁筆數變動時，回到第一頁（排序改變不強制回頁，讓使用者換排序時仍留在附近）
  useEffect(() => {
    setPage(1);
  }, [activeNs, search, pageSize]);

  // 若目前頁碼超過總頁數（例如篩選後資料變少），夾回最後一頁
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pagedKeys = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedKeys.slice(start, start + pageSize);
  }, [sortedKeys, page, pageSize]);

  const [newKeyName, setNewKeyName] = useState('');
  function addKey() {
    if (!activeNs) return;
    const key = newKeyName.trim();
    if (!key) return;
    if (allKeys.includes(key)) {
      showToast(`key「${key}」已存在，直接展開該筆讓你編輯`);
      setExpandedKeys((prev) => ({ ...prev, [key]: true }));
      setNewKeyName('');
      return;
    }
    setData((prev) => {
      const nsData = prev[activeNs] ?? {};
      const nextNs: Record<string, FlatDict> = { ...nsData };
      const localeList = Object.keys(nsData).length > 0 ? Object.keys(nsData) : ['en'];
      for (const locale of localeList) {
        nextNs[locale] = { ...(nextNs[locale] ?? {}), [key]: nextNs[locale]?.[key] ?? '' };
      }
      return { ...prev, [activeNs]: nextNs };
    });
    setNewKeyName('');
    // 新增後切到「Key 名稱 A→Z」排序，並直接跳到該 key 所在的頁數、展開它，
    // 避免列表很長時新增的項目被埋在後面找不到。
    setSortMode('key-asc');
    const nextAllKeys = [...allKeys, key].sort((a, b) => a.localeCompare(b));
    const idx = nextAllKeys.indexOf(key);
    setPage(Math.floor(idx / pageSize) + 1);
    setExpandedKeys((prev) => ({ ...prev, [key]: true }));
  }

  async function handleExport() {
    if (!activeNs) return;
    const nsData = data[activeNs] ?? {};
    const localeList = Object.keys(nsData);
    if (localeList.length === 0) {
      showToast('目前沒有任何語系可以匯出');
      return;
    }
    const keyTypes = metaData[activeNs] ?? {};
    const files = localeList.map((locale) => ({
      filename: `${locale}.json`,
      content: exportFlatToJson(nsData[locale], { format: exportFormat, includeMetadata, keyTypes }),
    }));
    await downloadFilesAsZip(`${activeNs}-i18n.zip`, files);
    showToast(`已匯出 ${localeList.length} 個語系為 zip`);
  }

  async function handleWriteToDisk() {
    if (!activeNs) return;
    const nsData = data[activeNs] ?? {};
    if (Object.keys(nsData).length === 0) {
      showToast('目前沒有任何語系可以寫入');
      return;
    }
    const keyTypes = metaData[activeNs] ?? {};
    // 版本歷史一併寫回磁碟（見 write-i18n.mjs 的 versions.json），讓它不再
    // 只活在瀏覽器 localStorage：換裝置、清快取、或直接看檔案系統時都還在。
    const result = await writeI18nToDisk(activeNs, nsData, exportFormat, keyTypes, versionHistory);
    if (!result.ok) {
      showToast(`寫入檔案系統失敗：${result.error}`);
      return;
    }
    showToast(`已寫入 ${result.writtenFiles.length} 個檔案：${result.writtenFiles.join(', ')}`);
  }

  /**
   * 從檔案系統讀取目前 app 對應的 `data/i18n/{app}/{locale}.json`，
   * 並整批覆蓋瀏覽器 localStorage 中該 app 的資料（與 handleWriteToDisk 相對的操作）。
   * 會先跳出確認對話框，避免誤觸蓋掉尚未寫入磁碟的編輯內容。
   */
  async function handleReadFromDisk() {
    if (!activeNs) return;
    if (
      !window.confirm(
        `確定要用磁碟上 data/i18n/${activeNs}/ 底下的內容覆蓋目前瀏覽器中「${activeNs}」的所有語系與版本歷史嗎？此動作無法復原（會直接覆蓋，不會 merge）。`
      )
    ) {
      return;
    }
    const result = await readI18nFromDisk(activeNs);
    if (!result.ok) {
      showToast(`讀取檔案系統失敗：${result.error}`);
      return;
    }
    const { locales, localeFiles, keyTypes, versionHistory: diskVersionHistory } = result;
    setData((prev) => ({ ...prev, [activeNs]: locales }));
    if (keyTypes) {
      setMetaData((prev) => ({ ...prev, [activeNs]: keyTypes }));
    }
    // 磁碟上的 versions.json 是目前唯一權威來源（跟 locales/keyTypes 一樣直接
    // 整批覆蓋，不 merge）；沒有該檔案時 diskVersionHistory 會是空陣列，等同
    // 「磁碟上沒有版本歷史」，同樣直接覆蓋掉瀏覽器端既有的版本歷史。
    if (diskVersionHistory !== undefined) {
      setVersionHistory(diskVersionHistory);
    }
    showToast(`已從磁碟讀取並覆蓋（${localeFiles.length} 個檔案）：${localeFiles.join(', ')}`);
  }

  function handleExportOneLocale(locale: string) {
    if (!activeNs) return;
    const dict = data[activeNs]?.[locale] ?? {};
    const keyTypes = metaData[activeNs] ?? {};
    const json = exportFlatToJson(dict, { format: exportFormat, includeMetadata, keyTypes });
    downloadTextFile(`${activeNs}.${locale}.json`, json);
    showToast(`已匯出 ${locale}.json`);
  }

  function applyImportedJson(rawText: string, sourceLabel: string) {
    if (!activeNs) return;
    try {
      const parsed = JSON.parse(rawText);
      const { flat, keyTypes } = importJsonToFlatWithMeta(parsed);
      const locale = importTargetLocale || 'en';
      setData((prev) => {
        const nsData = prev[activeNs] ?? {};
        return {
          ...prev,
          [activeNs]: { ...nsData, [locale]: { ...(nsData[locale] ?? {}), ...flat } },
        };
      });
      if (Object.keys(keyTypes).length > 0) {
        setMetaData((prev) => {
          const nsMeta = prev[activeNs] ?? {};
          return { ...prev, [activeNs]: { ...nsMeta, ...keyTypes } };
        });
      }
      showToast(`已匯入至「${activeNs}/${locale}」（${Object.keys(flat).length} 筆 key，來源：${sourceLabel}）`);
      return true;
    } catch (err) {
      showToast(`匯入失敗：${err instanceof Error ? err.message : '無效的 JSON'}`);
      return false;
    }
  }

  function triggerImport() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeNs) return;
    const text = await file.text();
    applyImportedJson(text, file.name);
  }

  const [isDragOver, setIsDragOver] = useState(false);

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (!activeNs) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      showToast('請拖曳 .json 檔案');
      return;
    }
    const text = await file.text();
    applyImportedJson(text, file.name);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
  }

  const [pasteText, setPasteText] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);

  function handlePasteImport() {
    if (!pasteText.trim()) {
      showToast('請先貼上 JSON 內容');
      return;
    }
    const ok = applyImportedJson(pasteText, '貼上內容');
    if (ok) {
      setPasteText('');
      setShowPasteBox(false);
    }
  }

  if (!app) {
    return (
      <div className={styles.wrap}>
        <div className={styles.header}>
          <h1 className={styles.title}>i18n 管理</h1>
          <p className={styles.subtitle}>
            尚未選擇 app，請先到{' '}
            <Link to="/admin" className="text-primary hover:underline">
              App 設定頁
            </Link>{' '}
            新增一個。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>i18n 管理 · {app}</h1>
          <p className={styles.subtitle}>
            以 app 管理多語系翻譯，可匯入 / 匯出 recursive 或 flatten 格式的 JSON。編輯內容即時存在瀏覽器
            localStorage；另外可按「寫入檔案系統」把目前 app 寫到專案的{' '}
            <code>data/i18n/{'{app}'}/{'{locale}'}.json</code>
            ，或按「從檔案系統讀取（覆蓋）」反向把磁碟上的內容讀回來覆蓋瀏覽器資料
            （僅在用 <code>npm run dev</code> 啟動時有效，正式 build 不含此功能）。app 本身的新增 / 刪除 /
            重新命名請到{' '}
            <Link to="/admin" className="text-primary hover:underline">
              App 設定頁
            </Link>
            。
          </p>
        </div>
      </div>

      {activeNs && (
        <div className={styles.versionPanel}>
          <div className={styles.versionPanelHeader}>
            <div>
              <h2 className={styles.versionPanelTitle}>
                版本管理
                {currentVersion && (
                  <span className="ml-2 font-mono text-[0.6875rem] font-normal text-muted-foreground/70">
                    目前共 {versionHistory.length} 個版本，最新：{currentVersion.label}
                  </span>
                )}
              </h2>
              <p className={styles.versionPanelHint}>
                建立版本 = 把目前所有語系的內容拍照存起來；新版本永遠基於上一個版本（線性歷史，不支援分支）。
                可比較任兩個版本、匯出差異 JSON，或還原到某個版本。版本只存在瀏覽器 localStorage，不會寫入檔案系統。
              </p>
            </div>
            <button className={styles.btnGhost} onClick={() => setShowVersionPanel((v) => !v)}>
              {showVersionPanel ? '收合' : '展開'}
            </button>
          </div>

          <div className={styles.versionCreateRow}>
            <input
              className={styles.input}
              placeholder={`版本名稱（留空預設為「第 ${versionHistory.length + 1} 版」）`}
              value={newVersionLabel}
              onChange={(e) => setNewVersionLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateVersion()}
            />
            <button className={styles.btnPrimary} onClick={handleCreateVersion}>
              📌 建立新版本
              {currentVersion ? '（基於目前最新版）' : ''}
            </button>
          </div>

          {showVersionPanel && (
            <>
              {versionHistory.length === 0 ? (
                <p className={styles.versionEmpty}>
                  尚無任何版本，按上方「建立新版本」把目前的翻譯內容存成第一個版本。
                </p>
              ) : (
                <div className={styles.versionList}>
                  {[...versionHistory].reverse().map((version) => {
                    const isLatest = currentVersion?.id === version.id;
                    return (
                      <div
                        key={version.id}
                        className={cn(styles.versionItem, isLatest && styles.versionItemLatest)}
                      >
                        <span className={cn(styles.versionBadge, isLatest && styles.versionBadgeLatest)}>
                          {isLatest ? '最新' : version.parentId ? '延續版本' : '起始版本'}
                        </span>
                        <span className={styles.versionLabel}>{version.label}</span>
                        <span className={styles.versionMeta}>{formatVersionTime(version.createdAt)}</span>
                        <span className={styles.versionMeta}>
                          {Object.keys(version.snapshot).length} 語系 ·{' '}
                          {collectAllKeys(version.snapshot).length} key
                        </span>
                        <div className={styles.versionActions}>
                          <button
                            className={styles.linkBtn}
                            onClick={() => {
                              setDiffFromId(version.id);
                            }}
                            title="設為比較起點（左邊）"
                          >
                            設為起點
                          </button>
                          <button
                            className={styles.linkBtn}
                            onClick={() => {
                              setDiffToId(version.id);
                            }}
                            title="設為比較終點（右邊）"
                          >
                            設為終點
                          </button>
                          <button
                            className={styles.linkBtn}
                            onClick={() => handleRestoreVersion(version)}
                            title="用這個版本覆蓋目前的編輯內容"
                          >
                            還原
                          </button>
                          <button
                            className={cn(styles.linkBtn, 'text-destructive')}
                            onClick={() => handleDeleteVersion(version)}
                            title="刪除這筆版本紀錄"
                          >
                            刪除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {versionHistory.length >= 1 && (
                <>
                  <div className={cn(styles.diffPicker, 'mt-4')}>
                    <span>比較</span>
                    <select
                      className={styles.select}
                      value={diffFromId}
                      onChange={(e) => setDiffFromId(e.target.value)}
                    >
                      {versionHistory.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    <span>→</span>
                    <select
                      className={styles.select}
                      value={diffToId}
                      onChange={(e) => setDiffToId(e.target.value)}
                    >
                      {versionHistory.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className={styles.btnGhost}
                      onClick={handleExportDiff}
                      disabled={!versionDiff || diffEntryCount === 0}
                    >
                      匯出差異 JSON
                    </button>
                  </div>

                  {versionDiff && (
                    <div>
                      <div className={styles.diffSummary}>
                        <span className={styles.versionMeta}>
                          共 {diffEntryCount} 筆差異
                          {versionDiff.addedLocales.length > 0 &&
                            `，新增語系：${versionDiff.addedLocales.join(', ')}`}
                          {versionDiff.removedLocales.length > 0 &&
                            `，移除語系：${versionDiff.removedLocales.join(', ')}`}
                        </span>
                      </div>

                      {diffEntryCount === 0 ? (
                        <p className={styles.versionEmpty}>這兩個版本之間沒有任何差異。</p>
                      ) : (
                        Object.entries(versionDiff.localeDiffs).map(([locale, entries]) => (
                          <div key={locale} className={styles.diffLocaleBlock}>
                            <div className={styles.diffLocaleTitle}>
                              {locale}（{entries.length} 筆差異）
                            </div>
                            {entries.map((entry) => (
                              <div
                                key={entry.key}
                                className={cn(
                                  styles.diffEntry,
                                  entry.status === 'added' && styles.diffEntryAdded,
                                  entry.status === 'removed' && styles.diffEntryRemoved,
                                  entry.status === 'changed' && styles.diffEntryChanged
                                )}
                              >
                                <span className={styles.diffKeyLabel}>{entry.key}</span>
                                {entry.status === 'added' && (
                                  <>
                                    {' '}
                                    ＋ <span className={styles.diffNewValue}>{entry.to}</span>
                                  </>
                                )}
                                {entry.status === 'removed' && (
                                  <>
                                    {' '}
                                    − <span className={styles.diffOldValue}>{entry.from}</span>
                                  </>
                                )}
                                {entry.status === 'changed' && (
                                  <>
                                    {' '}
                                    <span className={styles.diffOldValue}>{entry.from}</span>
                                    {' → '}
                                    <span className={styles.diffNewValue}>{entry.to}</span>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className={styles.layout}>
        <section className={styles.main}>
          {!activeNs ? (
            <p className={styles.empty}>尚未選擇 app，請先到 App 設定頁新增一個。</p>
          ) : (
            <>
              <div className={styles.toolbar}>
                <div className={styles.localeChips}>
                  <span className={styles.chipsHint}>顯示語系：</span>
                  {locales.map((locale) => {
                    const visible = visibleLocales[locale] !== false;
                    return (
                      <button
                        key={locale}
                        type="button"
                        className={cn(styles.localeChip, visible ? styles.localeChipOn : styles.localeChipOff)}
                        onClick={() => toggleLocaleVisible(locale)}
                        title={visible ? `點擊隱藏 ${locale}` : `點擊顯示 ${locale}`}
                      >
                        <span className={styles.chipCheck} aria-hidden="true">
                          {visible ? '✓' : ''}
                        </span>
                        {locale}
                        <span
                          className={styles.chipRemove}
                          role="button"
                          tabIndex={0}
                          title={`刪除語系 ${locale}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteLocale(locale);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              deleteLocale(locale);
                            }
                          }}
                        >
                          ×
                        </span>
                      </button>
                    );
                  })}
                  <input
                    className={styles.inputSmall}
                    placeholder="新語系代碼 (例如 ja)"
                    value={newLocaleName}
                    onChange={(e) => setNewLocaleName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addLocale()}
                  />
                  <button className={styles.btnGhost} onClick={addLocale}>
                    + 語系
                  </button>
                </div>

                <input
                  className={styles.search}
                  placeholder="搜尋 key 或翻譯內容..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className={styles.ioRow}>
                <div className={styles.ioGroup}>
                  <span className={styles.ioLabel}>匯出格式</span>
                  <select
                    className={styles.select}
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                  >
                    <option value="nested">Recursive（巢狀）</option>
                    <option value="flat">Flatten（扁平 key）</option>
                  </select>
                  <label className={styles.sortLabel} title="匯出/寫入檔案時是否額外包含每個 key 的型別標記">
                    <input
                      type="checkbox"
                      checked={includeMetadata}
                      onChange={(e) => setIncludeMetadata(e.target.checked)}
                    />
                    含 metadata（type）
                  </label>
                  <button className={styles.btn} onClick={handleExport}>
                    匯出全部語系（.zip）
                  </button>
                  <button
                    className={styles.btnGhost}
                    onClick={handleWriteToDisk}
                    title="僅在用「vite dev」啟動時可用，會寫入 data/i18n/{app}/{locale}.json"
                  >
                    寫入檔案系統
                  </button>
                  <button
                    className={styles.btnGhost}
                    onClick={handleReadFromDisk}
                    title="僅在用「vite dev」啟動時可用，讀取 data/i18n/{app}/{locale}.json 並覆蓋瀏覽器中的資料"
                  >
                    從檔案系統讀取（覆蓋）
                  </button>
                </div>

                <div className={styles.ioGroup}>
                  <span className={styles.ioLabel}>匯入目標語系</span>
                  <select
                    className={styles.select}
                    value={importTargetLocale}
                    onChange={(e) => setImportTargetLocale(e.target.value)}
                  >
                    {locales.length === 0 && <option value="en">en（將自動建立）</option>}
                    {locales.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                className={cn(styles.dropzone, isDragOver && styles.dropzoneActive)}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <div className={styles.dropzoneText}>
                  <strong>拖曳 .json 檔案到這裡</strong>
                  <span>或選擇下方方式匯入</span>
                </div>
                <div className={styles.dropzoneActions}>
                  <button className={styles.btn} onClick={triggerImport}>
                    選擇檔案
                  </button>
                  <button className={styles.btnGhost} onClick={() => setShowPasteBox((v) => !v)}>
                    {showPasteBox ? '取消貼上' : '貼上 JSON'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={handleFileSelected}
                  />
                </div>
                {showPasteBox && (
                  <div className={styles.pasteArea}>
                    <textarea
                      className={styles.pasteTextarea}
                      rows={6}
                      placeholder='貼上 recursive 或 flatten 格式的 JSON，例如：{ "home": { "title": "Hello" } }'
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                    />
                    <button className={styles.btnPrimary} onClick={handlePasteImport}>
                      匯入貼上的內容
                    </button>
                  </div>
                )}
              </div>

              <div className={styles.addKeyRow}>
                <input
                  className={styles.input}
                  placeholder="新增 key（支援 a.b.c 巢狀路徑）"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addKey()}
                />
                <button className={styles.btnPrimary} onClick={addKey}>
                  新增 Key
                </button>
              </div>

              <div className={styles.listToolbar}>
                <span className={styles.listCount}>
                  共 {allKeys.length} 筆 key，顯示 {shownLocales.length} / {locales.length} 個語系
                </span>
                <div className={styles.listToolbarActions}>
                  <label className={styles.sortLabel}>
                    排序
                    <select
                      className={styles.select}
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value as SortMode)}
                    >
                      <option value="key-asc">Key 名稱 A→Z</option>
                      <option value="key-desc">Key 名稱 Z→A</option>
                      <option value="filled-desc">完成度高→低</option>
                      <option value="filled-asc">完成度低→高</option>
                    </select>
                  </label>
                  <button className={styles.linkBtn} onClick={expandAllKeys}>
                    全部展開
                  </button>
                  <button className={styles.linkBtn} onClick={collapseAllKeys}>
                    全部收合
                  </button>
                </div>
              </div>

              <div className={styles.keyList}>
                {allKeys.length === 0 && (
                  <p className={styles.emptyCell}>
                    尚無資料，可於上方新增 key，或用「匯入 JSON」帶入現有翻譯檔。
                  </p>
                )}

                {pagedKeys.map((key) => {
                  const isOpen = !!expandedKeys[key];
                  const filledCount = filledCountOf(key);
                  return (
                    <details
                      key={key}
                      className={cn(styles.keyCard, 'group')}
                      open={isOpen}
                      onToggle={(e) => {
                        const nowOpen = (e.target as HTMLDetailsElement).open;
                        setExpandedKeys((prev) => ({ ...prev, [key]: nowOpen }));
                      }}
                    >
                      <summary className={styles.keySummary}>
                        <span className="shrink-0 text-[0.6875rem] text-muted-foreground/70 transition-transform duration-150 group-open:rotate-90" aria-hidden="true">
                          ▸
                        </span>
                        <input
                          className={styles.keyInput}
                          defaultValue={key}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => renameKey(key, e.target.value)}
                        />
                        <select
                          className={styles.select}
                          value={keyTypeOf(key)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setKeyType(key, e.target.value as ValueType)}
                          title="這個 key 的值類型，決定下方輸入元件的樣式與存檔前的格式驗證"
                        >
                          {VALUE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <span className={styles.summaryMeta}>
                          {filledCount}/{locales.length} 語系已填寫
                        </span>
                        <button
                          className={styles.iconDelete}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteKey(key);
                          }}
                          title="刪除這個 key"
                        >
                          刪除
                        </button>
                      </summary>

                      <div className={styles.keyBody}>
                        {shownLocales.length === 0 && (
                          <p className={styles.emptyCell}>目前沒有勾選任何語系顯示，請在上方語系標籤點擊開啟。</p>
                        )}
                        {shownLocales.map((locale) => {
                          const errorMsg = valueErrors[draftKey(key, locale)];
                          return (
                            <div key={locale} className={styles.localeField}>
                              <label className={styles.localeFieldLabel}>
                                <span>{locale}</span>
                                <button
                                  className={styles.linkBtn}
                                  onClick={() => handleExportOneLocale(locale)}
                                  title={`只匯出 ${locale}`}
                                >
                                  匯出
                                </button>
                              </label>
                              <ValueTypeField
                                valueType={keyTypeOf(key)}
                                value={displayValueOf(key, locale)}
                                onChange={(next) => handleValueInput(key, locale, next)}
                                textareaClassName={cn(styles.valueInput, errorMsg && styles.valueInputError)}
                                inputClassName={cn(styles.valueInput, errorMsg && styles.valueInputError)}
                              />
                              {errorMsg && (
                                <p className={styles.valueError} role="alert">
                                  ⚠ {errorMsg}（未通過驗證，尚未存檔）
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>

              {allKeys.length > 0 && (
                <div className={styles.pagination}>
                  <button
                    className={styles.btnGhost}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    ← 上一頁
                  </button>
                  <span className={styles.pageInfo}>
                    第 {page} / {totalPages} 頁
                  </span>
                  <button
                    className={styles.btnGhost}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    下一頁 →
                  </button>
                  <label className={styles.sortLabel}>
                    每頁筆數
                    <select
                      className={styles.select}
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </label>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}