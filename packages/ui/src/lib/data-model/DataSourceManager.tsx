// ============================================================
// DataSource 管理介面
//
// schema.ts 定義了「值的來源」統一抽象 DataSource（i18n / file / route /
// typedData），sample-data.ts 則是「先用手寫方式建好一份」。這個檔案補上
// 之前缺少的那一塊：一個實際可以「新增 / 編輯 / 刪除」DataSource 的 UI，
// 讓四種來源都能在畫面上被管理，而不是只在程式碼裡硬寫。
//
// UI 結構：
// - 依「類型」用 tabs 切換（i18n / 路由 / 檔案 / 型別資料），一次只看一類，
//   避免四大區塊一路往下堆導致畫面過長。
// - 每一筆來源預設「收合」，只顯示 id + 摘要；點開才展開編輯欄位。
// - 每個 tab 上方有工具列：關鍵字快速篩選 + 排序（依 id / label、正反序）。
//
// 設計原則：
// - 純受控元件：所有資料放在外部 state，透過 onChangeSources 回傳新的
//   sources map（不可變更新），方便頁面同時把最新 sources 餵給 resolver 做即時預覽。
// - typedData 的 value 是一棵遞迴值樹，直接複用既有的 <FieldEditor />，
//   並且用當前 sources 建出 DataStore，讓 typedData 內部也能綁定到 i18n / file / route。
// - i18n 是「基本型別的容器」：valueType 決定值型別，values 依 locale 逐一存。
//   locale 清單本身也可管理（新增 / 移除），符合真正的多語系維護情境。
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import type {
  DataSource,
  DataSourceKind,
  I18nDataSource,
  FileDataSource,
  RouteDataSource,
  TypedDataSource,
  PrimitiveType,
  I18nPrimitiveValue,
  FieldType,
  ValueNode,
} from './schema';
import type { FileRowSyncSlot } from './DataSourceManager.types';
import {
  InMemoryDataStore,
  createDefaultValueNode,
  fieldTypeForTypedDataTypeId,
} from './schema';
import { FieldEditor } from './FieldEditor';

/** 供「路由 → 選擇頁面」下拉選單使用的最小頁面資訊。 */
export interface PageOption {
  id: string;
  name: string;
}

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
  /** file tab 卡片清單下方額外內容（保留給未來其他用途） */
  fileSyncContent?: React.ReactNode;
  /** 每筆 file 資料列標題列的同步狀態叢集（放在刪除鈕左側） */
  fileRowSyncSlot?: FileRowSyncSlot;
}

const KIND_LABELS: Record<DataSourceKind, string> = {
  i18n: 'i18n 多語系文案',
  route: '路由 Route',
  file: '檔案 File',
  typedData: '型別資料 Typed Data',
};

const KIND_ORDER: DataSourceKind[] = ['i18n', 'route', 'file', 'typedData'];

const PRIMITIVE_TYPES: PrimitiveType[] = ['string', 'number', 'boolean', 'date'];

type SortKey = 'id' | 'label';
type SortDir = 'asc' | 'desc';

/**
 * 驗證草稿的 key（id）是否可以儲存，適用於所有 DataSource 種類。
 * - key（id）不可為空
 * - key 不可與其他既有來源重複（重新命名回自己原本的 id 不算重複）
 * 回傳錯誤訊息陣列；空陣列代表驗證通過。
 */
function validateSourceId(
  draftId: string,
  sources: Record<string, DataSource>,
  originalId: string,
): string[] {
  const errors: string[] = [];
  const id = draftId.trim();

  if (!id) {
    errors.push('key（id）不可為空');
  } else if (id !== originalId && sources[id]) {
    errors.push(`key「${id}」已存在，請改用其他 key`);
  }

  return errors;
}

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
}: DataSourceManagerProps) {
  // 目前所在的 tab（類型）
  const [activeKind, setActiveKind] = useState<DataSourceKind>('i18n');
  // 快速篩選關鍵字（比對 id + label）
  const [query, setQuery] = useState('');
  // 排序設定
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  // 展開中的來源 id 集合（預設全部收合）
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // 新增後、尚未通過驗證正式「離開草稿狀態」的來源 id：這些一律釘在清單最上方，
  // 不受排序影響，方便使用者立刻看到剛新增、還沒填完的項目。
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(() => new Set());

  // 用當前 sources + types 建一個 store，供 typedData 的 FieldEditor 綁定候選使用。
  // sources 一改就會重建，FieldEditor 內部的候選來源也會即時反映。
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

  // originalId 若與 next.id 不同，代表使用者改了 key（重新命名）：
  // 需要移除舊 key、寫入新 key，而不是同時保留兩筆；並讓「展開中」狀態跟著新 key 走，
  // 避免存檔後卡片意外收合。
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

  // 新增後自動展開該筆，讓使用者可以立刻編輯；同時釘在清單最上方，
  // 直到該筆通過驗證正式「儲存」過一次才回歸正常排序。
  const addAndExpand = (src: DataSource) => {
    updateSource(src);
    setExpanded((prev) => new Set(prev).add(src.id));
    setNewlyAddedIds((prev) => new Set(prev).add(src.id));
  };

  // i18n 卡片在草稿通過驗證、正式 commit 後呼叫：解除置頂標記。
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
        <div style={{ flex: 1 }} />
        {activeKind === 'file' && fileToolbarExtra}
        <button style={addBtnStyle} onClick={addHandlers[activeKind]} title={`新增${KIND_LABELS[activeKind]}`}>
          <Plus size={12} />
          新增{KIND_LABELS[activeKind]}
        </button>
      </div>

      {/* 清單（收合式卡片） */}
      {grouped[activeKind].length === 0 ? (
        <div style={emptyStyle}>尚無資料，點右上「＋ 新增」建立第一筆。</div>
      ) : visible.length === 0 ? (
        <div style={emptyStyle}>沒有符合「{query}」的來源。</div>
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
              rowSyncSlot={
                activeKind === 'file' && fileRowSyncSlot
                  ? fileRowSyncSlot(source as FileDataSource)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {activeKind === 'file' && fileSyncContent}
    </div>
  );
}

// ------------------------------------------------------------
// locale 管理列
// ------------------------------------------------------------

function LocaleBar({
  locales,
  onChange,
}: {
  locales: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v || locales.includes(v)) return;
    onChange([...locales, v]);
    setDraft('');
  };

  const remove = (l: string) => {
    if (locales.length <= 1) return; // 至少留一個
    onChange(locales.filter((x) => x !== l));
  };

  return (
    <div style={localeBarStyle}>
      <span style={{ fontSize: 12, color: '#aaa' }}>Locales：</span>
      {locales.map((l) => (
        <span key={l} style={localeChipStyle}>
          {l}
          <button
            style={localeRemoveStyle}
            title={`移除 ${l}`}
            onClick={() => remove(l)}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder="新增 locale，例如 ja"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) add();
        }}
        style={{ ...inputStyle, maxWidth: 160 }}
      />
      <button style={addBtnStyle} onClick={add} title="加入 locale">
        <Plus size={12} />
        加入 locale
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// 單筆 DataSource 卡片：收合時顯示摘要，展開後才顯示編輯欄位
// ------------------------------------------------------------

function SourceCard({
  source,
  sources,
  store,
  types,
  locales,
  pages,
  expanded,
  isNew,
  onToggle,
  onChange,
  onRemove,
  onSaved,
  rowSyncSlot,
}: {
  source: DataSource;
  sources: Record<string, DataSource>;
  store: InMemoryDataStore;
  types: Record<string, FieldType>;
  locales: string[];
  pages: PageOption[];
  expanded: boolean;
  isNew: boolean;
  onToggle: () => void;
  onChange: (next: DataSource, originalId?: string) => void;
  onRemove: () => void;
  onSaved: (id: string) => void;
  rowSyncSlot?: React.ReactNode;
}) {
  // 所有種類（i18n / route / file / typedData）都用同一套本地草稿：
  // 使用者輸入時只改草稿，不直接寫回 sources；通過驗證、按下「儲存」才 commit
  // 進 onChange。key（id）本身也是草稿的一部分，用獨立 state 管理方便重新命名。
  const [draft, setDraft] = useState<DataSource>(source);
  const [draftId, setDraftId] = useState(source.id);
  const [touched, setTouched] = useState(false);

  const errors = validateSourceId(draftId, sources, source.id);
  const hasErrors = errors.length > 0;

  // 各 kind 專屬欄位元件都回傳「完整的下一個物件」，這裡直接整包放進草稿。
  const updateDraft = (next: DataSource) => {
    setTouched(true);
    setDraft(next);
  };

  const handleSave = () => {
    setTouched(true);
    if (hasErrors) return; // 驗證未通過，不可儲存
    onChange({ ...draft, id: draftId }, source.id);
    onSaved(draftId);
    setTouched(false); // 存檔成功，回到「沒有未儲存變更」狀態，儲存按鈕跟著收起
  };

  // 只有「新增中還沒存過」或「已經改動過草稿」才顯示儲存按鈕，
  // 沒有變更時不需要讓使用者一直看到一個沒事可做的儲存鈕。
  const showSave = isNew || touched;

  return (
    <div style={cardStyle}>
      {/* 收合列：整條可點擊展開/收合 */}
      <div style={cardHeaderStyle}>
        <button
          onClick={onToggle}
          style={disclosureStyle}
          aria-expanded={expanded}
          title={expanded ? '收合' : '展開'}
        >
          <span style={{ ...chevronStyle, transform: expanded ? 'rotate(90deg)' : 'none' }}>
            ▶
          </span>
          <code style={idStyle}>{source.id}</code>
          {source.label ? <span style={cardLabelStyle}>{source.label}</span> : null}
          {isNew && <span style={draftBadgeStyle}>草稿</span>}
          {!expanded && (
            <span style={summaryStyle} title={summarize(source)}>
              {summarize(source)}
            </span>
          )}
        </button>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {rowSyncSlot}
          {showSave && (
            <button
              style={{
                ...saveBtnStyle,
                opacity: hasErrors && touched ? 0.5 : 1,
              }}
              onClick={handleSave}
              title={hasErrors ? '請先修正錯誤才能儲存' : '儲存'}
            >
              <Save size={12} />
            </button>
          )}
          <button style={removeBtnStyle} title="刪除這筆來源" onClick={onRemove}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={cardBodyStyle}>
          {/* key（id）輸入框固定在最上面，新增或重新命名都在這裡處理 */}
          <Labeled label="key（id）">
            <input
              value={draftId}
              onChange={(e) => {
                setTouched(true);
                setDraftId(e.target.value);
              }}
              style={inputStyle}
              placeholder="例如 home.hero.title"
            />
          </Labeled>
          <Labeled label="label（顯示名稱）">
            <input
              value={draft.label ?? ''}
              onChange={(e) => updateDraft({ ...draft, label: e.target.value })}
              style={inputStyle}
            />
          </Labeled>

          {draft.kind === 'i18n' && (
            <I18nFields source={draft} locales={locales} onChange={updateDraft} />
          )}
          {draft.kind === 'route' && (
            <RouteFields source={draft} pages={pages} onChange={updateDraft} />
          )}
          {draft.kind === 'file' && (
            <FileFields source={draft} onChange={updateDraft} />
          )}
          {draft.kind === 'typedData' && (
            <TypedDataFields
              source={draft}
              store={store}
              types={types}
              onChange={updateDraft}
            />
          )}

          {touched && hasErrors && (
            <div style={errorBoxStyle}>
              {errors.map((err) => (
                <div key={err}>⚠ {err}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 依 kind 產生一段收合時的摘要文字
function summarize(source: DataSource): string {
  switch (source.kind) {
    case 'i18n': {
      const locales = Object.keys(source.values);
      const first = source.values[locales[0]];
      return `${source.valueType} · ${locales.length} 語系${
        first != null ? ` · "${String(first).slice(0, 24)}"` : ''
      }`;
    }
    case 'route': {
      const pageLabel = source.pageId ? ` → ${source.pageId}` : '';
      return `${source.noindex ? '🚫index · ' : ''}${source.value || '（空路徑）'}${pageLabel}`;
    }
    case 'file':
      return source.url || '（未設定 url）';
    case 'typedData':
      return source.typeId;
  }
}

// ---------- i18n ----------

function I18nFields({
  source,
  locales,
  onChange,
}: {
  source: I18nDataSource;
  locales: string[];
  onChange: (next: DataSource) => void;
}) {
  const setValueType = (valueType: PrimitiveType) => {
    // 換型別時，把既有值盡量轉換，避免整批清空
    const values: Record<string, I18nPrimitiveValue> = {};
    for (const [l, v] of Object.entries(source.values)) {
      values[l] = coercePrimitive(v, valueType);
    }
    onChange({ ...source, valueType, values });
  };

  const setLocaleValue = (locale: string, raw: I18nPrimitiveValue) => {
    onChange({ ...source, values: { ...source.values, [locale]: raw } });
  };

  return (
    <>
      <Labeled label="valueType（值型別）">
        <select
          value={source.valueType}
          onChange={(e) => setValueType(e.target.value as PrimitiveType)}
          style={inputStyle}
        >
          {PRIMITIVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Labeled>

      <div style={{ fontSize: 12, color: '#aaa', marginTop: 8, marginBottom: 2 }}>
        各語系值
      </div>
      {locales.map((locale) => (
        <Labeled key={locale} label={locale} inline>
          <I18nValueInput
            valueType={source.valueType}
            value={source.values[locale]}
            onChange={(v) => setLocaleValue(locale, v)}
          />
        </Labeled>
      ))}
    </>
  );
}

function I18nValueInput({
  valueType,
  value,
  onChange,
}: {
  valueType: PrimitiveType;
  value: I18nPrimitiveValue | undefined;
  onChange: (next: I18nPrimitiveValue) => void;
}) {
  if (valueType === 'number') {
    return (
      <input
        type="number"
        value={Number(value ?? 0)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={inputStyle}
      />
    );
  }
  if (valueType === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      style={inputStyle}
    />
  );
}

// ---------- route ----------

function RouteFields({
  source,
  pages,
  onChange,
}: {
  source: RouteDataSource;
  pages: PageOption[];
  onChange: (next: DataSource) => void;
}) {
  return (
    <>
      <Labeled label="path（路徑）">
        <input
          value={source.value}
          placeholder="/about"
          onChange={(e) => onChange({ ...source, value: e.target.value })}
          style={inputStyle}
        />
      </Labeled>

      <Labeled label="頁面（可重複綁定同一頁）">
        {pages.length === 0 ? (
          <div style={{ fontSize: 12, color: '#e8b64c' }}>
            尚無頁面，請先到「頁面管理」新增頁面。
          </div>
        ) : (
          <select
            value={source.pageId ?? ''}
            onChange={(e) => {
              const pageId = e.target.value;
              if (pageId) {
                onChange({ ...source, target: 'page', pageId });
              } else {
                onChange({ ...source, target: 'url', pageId: undefined });
              }
            }}
            style={inputStyle}
          >
            <option value="">無（僅路徑）</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.id}）
              </option>
            ))}
          </select>
        )}
      </Labeled>

      <Labeled label="noindex（禁止索引）" inline>
        <input
          type="checkbox"
          checked={source.noindex}
          onChange={(e) => onChange({ ...source, noindex: e.target.checked })}
        />
      </Labeled>
    </>
  );
}

// ---------- file ----------

function FileFields({
  source,
  onChange,
}: {
  source: FileDataSource;
  onChange: (next: DataSource) => void;
}) {
  return (
    <>
      <Labeled label="url">
        <input
          value={source.url}
          placeholder="https://…/logo.svg"
          onChange={(e) => onChange({ ...source, url: e.target.value })}
          style={inputStyle}
        />
      </Labeled>
      <Labeled label="mimeType（可選）">
        <input
          value={source.mimeType ?? ''}
          placeholder="image/svg+xml"
          onChange={(e) => onChange({ ...source, mimeType: e.target.value })}
          style={inputStyle}
        />
      </Labeled>
    </>
  );
}

// ---------- typedData ----------

function TypedDataFields({
  source,
  store,
  types,
  onChange,
}: {
  source: TypedDataSource;
  store: InMemoryDataStore;
  types: Record<string, FieldType>;
  onChange: (next: DataSource) => void;
}) {
  // 型別選項：每個具名型別提供「單筆」與「一整組 []」兩種
  const typeOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (const id of Object.keys(types)) {
      opts.push({ value: id, label: id });
      opts.push({ value: `${id}[]`, label: `${id}[]（一整組）` });
    }
    return opts;
  }, [types]);

  const fieldType = fieldTypeForTypedDataTypeId(source.typeId);

  const setTypeId = (typeId: string) => {
    const nextType = fieldTypeForTypedDataTypeId(typeId);
    onChange({
      ...source,
      typeId,
      value: createDefaultValueNode(nextType, store),
    });
  };

  const setValue = (value: ValueNode) => onChange({ ...source, value });

  return (
    <>
      <Labeled label="typeId（對應的型別）">
        <FilterableSelect
          options={typeOptions}
          value={source.typeId}
          onChange={setTypeId}
          placeholder="輸入關鍵字篩選型別…"
        />
      </Labeled>

      <div style={{ fontSize: 12, color: '#aaa', marginTop: 8, marginBottom: 2 }}>
        value（值樹；可在葉節點綁定 i18n / file / route）
      </div>
      <FieldEditor
        type={fieldType}
        node={source.value}
        store={store}
        onChange={setValue}
      />
    </>
  );
}

// ------------------------------------------------------------
// 小工具
// ------------------------------------------------------------

function coercePrimitive(
  v: I18nPrimitiveValue,
  target: PrimitiveType,
): I18nPrimitiveValue {
  if (target === 'number') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (target === 'boolean') return Boolean(v);
  return String(v ?? '');
}

function Labeled({
  label,
  children,
  inline,
}: {
  label: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div
      style={{
        marginTop: 6,
        display: inline ? 'flex' : 'block',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: '#9a9a9a',
          fontWeight: 600,
          minWidth: inline ? 72 : undefined,
        }}
      >
        {label}
      </div>
      <div style={{ flex: inline ? 1 : undefined, marginTop: inline ? 0 : 2 }}>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 可篩選的下拉選單（combobox）
// ------------------------------------------------------------

function FilterableSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const currentLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={filterableTriggerStyle}
      >
        <code style={{ fontSize: 12 }}>{currentLabel}</code>
        <span style={{ marginLeft: 'auto', color: '#888', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={filterableDropdownStyle}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder ?? '篩選…'}
            style={{ ...inputStyle, maxWidth: '100%', marginBottom: 4 }}
          />
          <div style={filterableListStyle}>
            {filtered.length === 0 ? (
              <div style={emptyStyle}>沒有符合「{query}」的選項</div>
            ) : (
              filtered.map((o) => {
                const active = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                      setQuery('');
                    }}
                    style={{
                      ...typeOptionBtnStyle,
                      ...(active ? typeOptionActiveStyle : null),
                    }}
                  >
                    {o.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// styles（沿用 FieldEditor 的暗色開發工具風格）
// ------------------------------------------------------------

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

const localeBarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  background: '#151515',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '10px 12px',
};

const localeChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: '#22332c',
  color: '#7fdbca',
  border: '1px solid #2d6a4f',
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 12,
};

const localeRemoveStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7fdbca',
  cursor: 'pointer',
  fontSize: 11,
  padding: 0,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
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

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#777',
  fontStyle: 'italic',
  padding: '10px 2px',
};

const cardStyle: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #2c2c2c',
  borderRadius: 6,
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 10px',
};

const disclosureStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
  flex: 1,
  minWidth: 0,
};

const chevronStyle: React.CSSProperties = {
  color: '#7fdbca',
  fontSize: 10,
  transition: 'transform 0.12s ease',
  flexShrink: 0,
};

const cardLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#ccc',
  flexShrink: 0,
};

const draftBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#e8b64c',
  background: '#332c18',
  border: '1px solid #5a4a1f',
  borderRadius: 999,
  padding: '1px 8px',
  flexShrink: 0,
};

const errorBoxStyle: React.CSSProperties = {
  marginTop: 10,
  padding: '8px 10px',
  fontSize: 12,
  lineHeight: 1.6,
  color: '#e77',
  background: '#2a1414',
  border: '1px solid #5a2b2b',
  borderRadius: 6,
};

const summaryStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#777',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
};

const cardBodyStyle: React.CSSProperties = {
  borderTop: '1px solid #2c2c2c',
  padding: 12,
};

const idStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#7aa2f7',
  fontFamily: 'monospace',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  background: '#1e1e1e',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 13,
  width: '100%',
  maxWidth: 320,
  boxSizing: 'border-box',
};

const addBtnStyle: React.CSSProperties = {
  background: '#2d2d2d',
  color: '#7fdbca',
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

const typeOptionBtnStyle: React.CSSProperties = {
  textAlign: 'left',
  background: 'transparent',
  color: '#ccc',
  border: '1px solid transparent',
  borderRadius: 4,
  padding: '5px 8px',
  fontSize: 12,
  fontFamily: 'monospace',
  cursor: 'pointer',
};

const typeOptionActiveStyle: React.CSSProperties = {
  background: '#22332c',
  color: '#7fdbca',
  border: '1px solid #2d6a4f',
};

const filterableTriggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  maxWidth: 320,
  background: '#1e1e1e',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '6px 10px',
  fontSize: 13,
  cursor: 'pointer',
  boxSizing: 'border-box',
};

const filterableDropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 10,
  background: '#1a1a1a',
  border: '1px solid #444',
  borderRadius: 4,
  padding: 6,
  marginTop: 2,
  boxSizing: 'border-box',
};

const filterableListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  maxHeight: 200,
  overflowY: 'auto',
};

const saveBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#7fdbca',
  border: '1px solid #2d6a4f',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 12,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
};

const removeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#e74c3c',
  border: '1px solid #5a2b2b',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 12,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
};
