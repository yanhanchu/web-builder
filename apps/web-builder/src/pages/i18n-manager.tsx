import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadI18nData, saveI18nData, loadI18nMetaData, saveI18nMetaData } from '@/store/i18n-storage';
import { readI18nFromDisk, writeI18nToDisk } from '@/lib/i18n-disk-api';
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
import { useApp } from '@/hooks/app/context';

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
    const result = await writeI18nToDisk(activeNs, nsData, exportFormat, keyTypes);
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
        `確定要用磁碟上 data/i18n/${activeNs}/ 底下的內容覆蓋目前瀏覽器中「${activeNs}」的所有語系嗎？此動作無法復原（會直接覆蓋，不會 merge）。`
      )
    ) {
      return;
    }
    const result = await readI18nFromDisk(activeNs);
    if (!result.ok) {
      showToast(`讀取檔案系統失敗：${result.error}`);
      return;
    }
    const { locales, localeFiles, keyTypes } = result;
    setData((prev) => ({ ...prev, [activeNs]: locales }));
    if (keyTypes) {
      setMetaData((prev) => ({ ...prev, [activeNs]: keyTypes }));
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
                          title="這個 key 的值類型（僅作為 metadata 標記，不影響下方的編輯欄位）"
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
                        {shownLocales.map((locale) => (
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
                            <textarea
                              className={styles.valueInput}
                              rows={2}
                              value={data[activeNs]?.[locale]?.[key] ?? ''}
                              onChange={(e) => updateValue(key, locale, e.target.value)}
                            />
                          </div>
                        ))}
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
