import React, { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { ChevronDown, Download, LayoutGrid, List, Plus, Upload } from 'lucide-react';
import type {
  DataSource,
  DataSourceKind,
  FieldType,
  FileDataSource,
  I18nDataSource,
  I18nPrimitiveValue,
  RouteDataSource,
  TypedDataSource,
} from '@workspace/ui/lib/data-model/schema';
import {
  InMemoryDataStore,
  createDefaultValueNode,
  fieldTypeForTypedDataTypeId,
} from '@workspace/ui/lib/data-model/schema';
import { sourcesToFlatI18n } from '@workspace/ui/lib/data-model/i18n-flat';
import { sourcesToFlatKind, type FlatKind } from '@workspace/ui/lib/data-model/flat-export';
import type { FileDetailSyncSlot, FileRowSyncSlot, FilePreviewUrlResolver, PageOption } from './types';
import { ImportModal } from './import-modal';
import { LocaleBar } from './locale-bar';
import { SourceCard } from './source-card';
import { SourceGrid, FileGridPreview, fileGridMeta } from './source-grid';
import { addBtnStyle, emptyStyle, inputStyle } from './shared';

export type { PageOption } from './types';

interface DataSourceManagerProps {
  /** 目前所有 DataSource，key 為 source id */
  sources: Record<string, DataSource>;
  /** 型別 registry（複合 id -> FieldType），供 typedData 選型別 / 綁定用 */
  types: Record<string, FieldType>;
  /** 目前管理的 locale 清單（給 i18n 逐語系編輯用） */
  locales: string[];
  /** 目前所有頁面（給路由 target=page 選擇用；不提供則下拉選單為空） */
  pages?: PageOption[];
  /** sources 有任何變動時回傳完整新的 map */
  onChangeSources: (next: Record<string, DataSource>) => void;
  /** locale 清單變動時回傳（可選；沒有提供則隱藏 locale 管理列） */
  onChangeLocales?: (next: string[]) => void;
  /** file tab 工具列右側額外按鈕（例如「重新整理目的地」） */
  fileToolbarExtra?: React.ReactNode;
  /** file tab 卡片清單下方額外內容 */
  fileSyncContent?: React.ReactNode;
  /** 每筆 file 資料列標題列的同步狀態叢集（放在刪除鈕左側） */
  fileRowSyncSlot?: FileRowSyncSlot;
  /** 展開的 file 卡片中，詳細資訊區塊顯示的「所有已同步節點」url 清單 */
  fileDetailSyncSlot?: FileDetailSyncSlot;
  /**
   * 檔案上傳（file tab 專用）：提供時，FileFields 會多顯示一顆「上傳檔案」
   * 按鈕，選好本機檔案後呼叫這個函式，回傳的 url / mimeType 直接填回草稿。
   */
  onUploadFile?: (
    file: File,
    source: FileDataSource,
  ) => Promise<{ url: string; mimeType?: string; size?: number; fileName?: string }>;
  /** 把 FileDataSource.url 轉成瀏覽器可直接當 <img src> 用的網址，不提供則原樣使用 url。 */
  resolvePreviewUrl?: FilePreviewUrlResolver;
  /**
   * 目前選中的分頁（i18n / route / file / typedData）。不提供時元件會自己管理
   * 內部 state（預設 'i18n'）；提供時變成受控元件，方便 app 層把分頁狀態同步
   * 到 URL（例如 #tab=file），重新整理頁面後可以還原到離開前的分頁。
   */
  activeKind?: DataSourceKind;
  /** activeKind 受控時，使用者切換分頁會呼叫這個回呼；不提供 activeKind 則不會被呼叫。 */
  onChangeActiveKind?: (next: DataSourceKind) => void;
}

const KIND_LABELS: Record<DataSourceKind, string> = {
  i18n: 'i18n 多語系文案',
  route: '路由 Route',
  file: '檔案 File',
  typedData: '型別資料 Typed Data',
};

// 攤平匯出／匯入涵蓋的 kind：i18n 有自己的一套（依 locale 攤平，見
// i18n-flat.ts），route/file/typedData 共用「去除 id/kind」的攤平格式
// （見 flat-export.ts）。這個型別防護只是把 DataSourceKind 窄化成
// FlatKind，方便呼叫 sourcesToFlatKind 時 TS 能推得出正確的多載。
function isFlatKind(kind: DataSourceKind): kind is FlatKind {
  return kind !== 'i18n';
}

const KIND_ORDER: DataSourceKind[] = ['i18n', 'route', 'file', 'typedData'];

type SortKey = 'id' | 'label';
type SortDir = 'asc' | 'desc';
type ViewMode = 'list' | 'grid';

// 目前只有 file tab 提供格子狀顯示的切換入口（其他 kind 沒有縮圖可看，格狀
// 檢視意義不大）。SourceGrid 本身跟 kind 無關，未來要幫別的分頁開放，只要
// 把該 kind 加進這個清單、並在下面 renderPreview 補上對應的預覽邏輯即可。
const GRID_CAPABLE_KINDS: DataSourceKind[] = ['file'];

export function DataSourceManager({
  sources,
  types,
  locales,
  pages = [],
  onChangeSources,
  onChangeLocales,
  fileToolbarExtra,
  fileSyncContent,
  fileRowSyncSlot,
  fileDetailSyncSlot,
  onUploadFile,
  resolvePreviewUrl,
  activeKind: controlledActiveKind,
  onChangeActiveKind,
}: DataSourceManagerProps) {
  const [internalActiveKind, setInternalActiveKind] = useState<DataSourceKind>('i18n');
  // 受控／非受控二擇一：外部有給 activeKind 時以它為準（例如 app 層把分頁同步進 URL），
  // 沒有給則退回內部 state，行為跟原本一樣。
  const activeKind = controlledActiveKind ?? internalActiveKind;
  const setActiveKind = (next: DataSourceKind) => {
    if (onChangeActiveKind) onChangeActiveKind(next);
    if (controlledActiveKind === undefined) setInternalActiveKind(next);
  };
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  // 顯示方式：list（收合式卡片，原本的行為）或 grid（格子狀，目前 file tab 用來
  // 顯示圖片縮圖）。用 kind 分開記，切分頁時各自保留使用者上次選的顯示方式。
  const [viewModeByKind, setViewModeByKind] = useState<Record<DataSourceKind, ViewMode>>(
    () => ({ i18n: 'list', route: 'list', file: 'grid', typedData: 'list' }),
  );
  // 非 grid-capable 的 kind 一律強制用 list，不管使用者之前在別的 kind 選過什麼。
  const viewMode: ViewMode = GRID_CAPABLE_KINDS.includes(activeKind)
    ? viewModeByKind[activeKind]
    : 'list';
  // 展開中的來源 id 集合（預設全部收合）
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // 新增後、尚未通過驗證正式「離開草稿狀態」的來源 id：一律釘在清單最上方
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(() => new Set());

  const [showImport, setShowImport] = useState(false);
  // 匯出下拉選單：選「匯出全部（DataSource JSON）」或「匯出扁平 i18n（依 locale）」。
  const [showExportMenu, setShowExportMenu] = useState(false);

  // 用當前 sources + types 建一個 store，供 typedData 的 FieldEditor 綁定候選使用
  const store = useMemo(
    () => new InMemoryDataStore(sources, types),
    [sources, types],
  );

  const grouped = useMemo(() => {
    const g: Record<DataSourceKind, DataSource[]> = {
      i18n: [],
      route: [],
      file: [],
      typedData: [],
    };
    for (const s of Object.values(sources)) g[s.kind].push(s);
    return g;
  }, [sources]);

  // 目前 tab 的清單，套用篩選 + 排序；新增中（尚未儲存過一次）的項目固定置頂
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = grouped[activeKind];
    if (q) {
      list = list.filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          (s.label ?? '').toLowerCase().includes(q),
      );
    }
    const pinned = list.filter((s) => newlyAddedIds.has(s.id));
    const rest = list.filter((s) => !newlyAddedIds.has(s.id));
    const sorted = [...rest].sort((a, b) => {
      const av = (sortKey === 'label' ? a.label ?? a.id : a.id).toLowerCase();
      const bv = (sortKey === 'label' ? b.label ?? b.id : b.id).toLowerCase();
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return [...pinned, ...sorted];
  }, [grouped, activeKind, query, sortKey, sortDir, newlyAddedIds]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // originalId 若與 next.id 不同，代表使用者重新命名：移除舊 key、寫入新 key，
  // 並讓「展開中」狀態跟著新 key 走，避免存檔後卡片意外收合。
  const updateSource = (next: DataSource, originalId?: string) => {
    const rest = { ...sources };
    if (originalId && originalId !== next.id) {
      delete rest[originalId];
      setExpanded((prev) => {
        if (!prev.has(originalId)) return prev;
        const n = new Set(prev);
        n.delete(originalId);
        n.add(next.id);
        return n;
      });
    }
    onChangeSources({ ...rest, [next.id]: next });
  };

  const removeSource = (id: string) => {
    const rest = { ...sources };
    delete rest[id];
    onChangeSources(rest);
    setExpanded((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setNewlyAddedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const makeId = (prefix: string) => {
    let n = 1;
    let id = `${prefix}:new-${n}`;
    while (sources[id]) id = `${prefix}:new-${++n}`;
    return id;
  };

  // 新增後自動展開該筆並釘在清單最上方，直到通過驗證正式「儲存」過一次
  const addAndExpand = (src: DataSource) => {
    updateSource(src);
    setExpanded((prev) => new Set(prev).add(src.id));
    setNewlyAddedIds((prev) => new Set(prev).add(src.id));
  };

  // i18n 卡片在草稿通過驗證、正式 commit 後呼叫：解除置頂標記
  const markSaved = (id: string) => {
    setNewlyAddedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const addI18n = () => {
    const id = makeId('i18n');
    const values: Record<string, I18nPrimitiveValue> = {};
    for (const l of locales) values[l] = '';
    addAndExpand({
      id,
      kind: 'i18n',
      label: '新 i18n 文案',
      valueType: 'string',
      values,
    } satisfies I18nDataSource);
  };

  const addRoute = () => {
    const id = makeId('route');
    addAndExpand({
      id,
      kind: 'route',
      label: '新路由',
      target: 'url',
      value: '/',
      noindex: false,
    } satisfies RouteDataSource);
  };

  const addFile = () => {
    const id = makeId('file');
    addAndExpand({
      id,
      kind: 'file',
      label: '新檔案',
      url: '',
      mimeType: '',
    } satisfies FileDataSource);
  };

  const addTypedData = () => {
    const firstTypeId = Object.keys(types)[0];
    if (!firstTypeId) return;
    const id = makeId('typedData');
    const fieldType = fieldTypeForTypedDataTypeId(firstTypeId);
    addAndExpand({
      id,
      kind: 'typedData',
      label: '新型別資料',
      typeId: firstTypeId,
      value: createDefaultValueNode(fieldType, store),
    } satisfies TypedDataSource);
  };

  const addHandlers: Record<DataSourceKind, () => void> = {
    i18n: addI18n,
    route: addRoute,
    file: addFile,
    typedData: addTypedData,
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadJson = (payload: unknown, filename: string) => {
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      filename,
    );
  };

  // 匯出：把當前全部 sources 序列化成 JSON 並觸發下載
  const handleExport = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sources,
    };
    downloadJson(payload, `data-sources-${Date.now()}.json`);
  };

  // 匯出：把當前 i18n 來源依指定 locale 攤平成單語系 JSON（例如 en.json），
  // 對接一般 i18n 工具鏈（next-intl / react-i18next 等）慣用的檔案格式。
  const handleExportFlatI18n = (locale: string) => {
    const flat = sourcesToFlatI18n(sources, locale);
    downloadJson(flat, `${locale}.json`);
    setShowExportMenu(false);
  };

  // 匯出：一次把「目前所有 locale」各自攤平成單語系 JSON，打包成單一 zip
  // （en.json、zh-TW.json… 都在同一個 i18n.zip 裡），一次下載即可拿到全部
  // 語系檔案，直接解壓縮丟進專案的 i18n 資料夾。
  const handleExportAllFlatI18n = async () => {
    setShowExportMenu(false);
    const zip = new JSZip();
    for (const locale of locales) {
      const flat = sourcesToFlatI18n(sources, locale);
      zip.file(`${locale}.json`, JSON.stringify(flat, null, 2));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `i18n-${Date.now()}.zip`);
  };

  // 匯出：把「目前分頁」所有 route / file / typedData 資料攤平成
  // { key: 去除 id/kind 的物件 } 並觸發下載，跟 import-modal 的攤平格式對稱。
  const handleExportFlatKind = (kind: FlatKind) => {
    const flat = sourcesToFlatKind(sources, kind);
    downloadJson(flat, `${kind}-${Date.now()}.json`);
    setShowExportMenu(false);
  };

  // 匯入：把解析後的來源套用（合併 or 覆蓋）
  const handleImport = (
    incoming: Record<string, DataSource>,
    mode: 'merge' | 'replace',
  ) => {
    if (mode === 'replace') {
      onChangeSources(incoming);
    } else {
      onChangeSources({ ...sources, ...incoming });
    }
    setShowImport(false);
  };

  return (
    <div style={rootStyle}>
      {/* Tabs：依類型切換 */}
      <div style={tabsStyle} role="tablist" aria-label="DataSource 類型">
        {KIND_ORDER.map((kind) => {
          const active = kind === activeKind;
          return (
            <button
              key={kind}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveKind(kind)}
              style={{
                ...tabStyle,
                ...(active ? tabActiveStyle : null),
              }}
            >
              {KIND_LABELS[kind]}
              <span style={{ ...countStyle, ...(active ? countActiveStyle : null) }}>
                {grouped[kind].length}
              </span>
            </button>
          );
        })}
      </div>

      {/* i18n tab 才顯示 locale 管理列 */}
      {activeKind === 'i18n' && onChangeLocales && (
        <LocaleBar locales={locales} onChange={onChangeLocales} />
      )}

      {/* 工具列：快速篩選 + 排序 + 新增 */}
      <div style={toolbarStyle}>
        <input
          value={query}
          placeholder="篩選 id 或 label…"
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, maxWidth: 240, flex: 1 }}
          aria-label="快速篩選"
        />
        <label style={toolbarLabelStyle}>
          排序
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            style={selectSmallStyle}
            aria-label="排序欄位"
          >
            <option value="id">id</option>
            <option value="label">label</option>
          </select>
        </label>
        <button
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          style={sortDirBtnStyle}
          title={sortDir === 'asc' ? '升冪（A→Z）' : '降冪（Z→A）'}
          aria-label="切換排序方向"
        >
          {sortDir === 'asc' ? '↑ A–Z' : '↓ Z–A'}
        </button>
        {GRID_CAPABLE_KINDS.includes(activeKind) && (
          <div style={viewToggleGroupStyle} role="group" aria-label="顯示方式">
            <button
              onClick={() => setViewModeByKind((prev) => ({ ...prev, [activeKind]: 'list' }))}
              style={{
                ...viewToggleBtnStyle,
                ...(viewMode === 'list' ? viewToggleBtnActiveStyle : undefined),
              }}
              title="清單顯示"
              aria-label="清單顯示"
              aria-pressed={viewMode === 'list'}
            >
              <List size={13} />
            </button>
            <button
              onClick={() => setViewModeByKind((prev) => ({ ...prev, [activeKind]: 'grid' }))}
              style={{
                ...viewToggleBtnStyle,
                ...(viewMode === 'grid' ? viewToggleBtnActiveStyle : undefined),
              }}
              title="格子狀顯示"
              aria-label="格子狀顯示"
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid size={13} />
            </button>
          </div>
        )}
        <div style={{ flex: 1 }} />
        {activeKind === 'file' && fileToolbarExtra}
        <button
          style={ioBtnStyle}
          onClick={() => setShowImport(true)}
          title="貼上 JSON 匯入來源"
        >
          <Upload size={12} />
          匯入
        </button>
        <div style={{ position: 'relative' }}>
          <button
            style={{
              ...ioBtnStyle,
              ...(Object.keys(sources).length === 0
                ? { opacity: 0.45, cursor: 'not-allowed' }
                : null),
            }}
            onClick={() => setShowExportMenu((v) => !v)}
            title="匯出來源為 JSON"
            disabled={Object.keys(sources).length === 0}
            aria-haspopup="menu"
            aria-expanded={showExportMenu}
          >
            <Download size={12} />
            匯出
            <ChevronDown size={12} />
          </button>
          {showExportMenu && (
            <>
              {/* 點擊選單外任意處關閉；覆蓋整個畫面的透明層，放在選單本身之下。 */}
              <div
                style={exportMenuOverlayStyle}
                onClick={() => setShowExportMenu(false)}
              />
              <div style={exportMenuStyle} role="menu">
                <button
                  style={exportMenuItemStyle}
                  role="menuitem"
                  onClick={() => {
                    handleExport();
                    setShowExportMenu(false);
                  }}
                >
                  匯出全部（DataSource JSON）
                </button>
                <div style={exportMenuDividerStyle} />
                {activeKind === 'i18n' ? (
                  <>
                    <div style={exportMenuGroupLabelStyle}>扁平單語系 i18n JSON</div>
                    {locales.length === 0 ? (
                      <div style={exportMenuEmptyStyle}>尚未設定任何 locale</div>
                    ) : (
                      <>
                        <button
                          style={exportMenuItemStyle}
                          role="menuitem"
                          onClick={handleExportAllFlatI18n}
                          title="把每個 locale 的攤平 JSON 打包成單一 zip 下載"
                        >
                          一次匯出全部語系（打包 {locales.length} 個檔案為 zip）
                        </button>
                        {locales.map((l) => (
                          <button
                            key={l}
                            style={exportMenuItemStyle}
                            role="menuitem"
                            onClick={() => handleExportFlatI18n(l)}
                          >
                            匯出 {l}.json
                          </button>
                        ))}
                      </>
                    )}
                  </>
                ) : (
                  isFlatKind(activeKind) && (
                    <>
                      <div style={exportMenuGroupLabelStyle}>
                        扁平 {KIND_LABELS[activeKind]} JSON
                      </div>
                      <button
                        style={exportMenuItemStyle}
                        role="menuitem"
                        onClick={() => handleExportFlatKind(activeKind)}
                        title="把目前分頁的資料攤平成 { key: 去除 id/kind 的物件 } 並下載"
                      >
                        匯出扁平 {activeKind}.json
                      </button>
                    </>
                  )
                )}
              </div>
            </>
          )}
        </div>
        <button style={addBtnStyle} onClick={addHandlers[activeKind]} title={`新增${KIND_LABELS[activeKind]}`}>
          <Plus size={12} />
          新增{KIND_LABELS[activeKind]}
        </button>
      </div>

      {/* 清單：list 顯示收合式卡片，grid 顯示格子縮圖（目前只有 file tab 提供切換） */}
      {grouped[activeKind].length === 0 ? (
        <div style={emptyStyle}>尚無資料，點右上「＋ 新增」建立第一筆。</div>
      ) : visible.length === 0 ? (
        <div style={emptyStyle}>沒有符合「{query}」的來源。</div>
      ) : viewMode === 'grid' ? (
        <SourceGrid
          items={visible as FileDataSource[]}
          renderPreview={(source) => (
            <FileGridPreview source={source} resolvePreviewUrl={resolvePreviewUrl} />
          )}
          renderTitle={(source) => source.label || source.id}
          renderMeta={(source) => fileGridMeta(source)}
          onItemClick={(source) => {
            // 格子狀顯示沒有內嵌編輯欄位的空間，點擊卡片直接切回清單顯示並展開
            // 該筆，讓使用者能立刻接著編輯／設定焦點，不用先手動切換再找一次。
            setExpanded((prev) => new Set(prev).add(source.id));
            setViewModeByKind((prev) => ({ ...prev, [activeKind]: 'list' }));
          }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              sources={sources}
              store={store}
              types={types}
              locales={locales}
              pages={pages}
              expanded={expanded.has(source.id)}
              isNew={newlyAddedIds.has(source.id)}
              onToggle={() => toggleExpand(source.id)}
              onChange={updateSource}
              onRemove={() => removeSource(source.id)}
              onSaved={markSaved}
              onUploadFile={onUploadFile}
              resolvePreviewUrl={resolvePreviewUrl}
              rowSyncSlot={
                activeKind === 'file' && fileRowSyncSlot
                  ? fileRowSyncSlot(source as FileDataSource)
                  : undefined
              }
              detailSyncSlot={activeKind === 'file' ? fileDetailSyncSlot : undefined}
            />
          ))}
        </div>
      )}

      {activeKind === 'file' && fileSyncContent}

      {showImport && (
        <ImportModal
          existingCount={Object.keys(sources).length}
          existingSources={sources}
          locales={locales}
          activeKind={activeKind}
          onClose={() => setShowImport(false)}
          onApply={handleImport}
        />
      )}
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  borderBottom: '1px solid #333',
  paddingBottom: 2,
};

const tabStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'transparent',
  color: '#999',
  border: '1px solid transparent',
  borderBottom: 'none',
  borderTopLeftRadius: 6,
  borderTopRightRadius: 6,
  padding: '6px 12px',
  fontSize: 13,
  cursor: 'pointer',
};

const tabActiveStyle: React.CSSProperties = {
  background: '#1a1a1a',
  color: '#eee',
  border: '1px solid #333',
  borderBottom: '1px solid #1a1a1a',
  marginBottom: -3,
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
};

const toolbarLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: '#aaa',
};

const selectSmallStyle: React.CSSProperties = {
  background: '#1e1e1e',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
};

const sortDirBtnStyle: React.CSSProperties = {
  background: '#2d2d2d',
  color: '#ddd',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

const countStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
  background: '#262626',
  borderRadius: 999,
  padding: '1px 8px',
};

const countActiveStyle: React.CSSProperties = {
  color: '#7fdbca',
  background: '#22332c',
};

const viewToggleGroupStyle: React.CSSProperties = {
  display: 'inline-flex',
  border: '1px solid #444',
  borderRadius: 4,
  overflow: 'hidden',
};

const viewToggleBtnStyle: React.CSSProperties = {
  background: '#2d2d2d',
  color: '#999',
  border: 'none',
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
};

const viewToggleBtnActiveStyle: React.CSSProperties = {
  background: '#22332c',
  color: '#7fdbca',
};

const ioBtnStyle: React.CSSProperties = {
  background: '#2d2d2d',
  color: '#ccc',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
};

const exportMenuOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
};

const exportMenuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  background: '#1e1e1e',
  border: '1px solid #444',
  borderRadius: 6,
  padding: 4,
  minWidth: 200,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  zIndex: 1001,
  display: 'flex',
  flexDirection: 'column',
};

const exportMenuItemStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#eee',
  border: 'none',
  borderRadius: 4,
  padding: '6px 8px',
  fontSize: 12,
  textAlign: 'left',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const exportMenuDividerStyle: React.CSSProperties = {
  height: 1,
  background: '#333',
  margin: '4px 0',
};

const exportMenuGroupLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
  padding: '4px 8px 2px',
};

const exportMenuEmptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#666',
  fontStyle: 'italic',
  padding: '6px 8px',
};