// ============================================================
// DataSource 管理介面
//
// schema.ts 定義了「值的來源」統一抽象 DataSource（i18n / file / route /
// typedData），sample-data.ts 則是「先用手寫方式建好一份」。這個檔案補上
// 之前缺少的那一塊：一個實際可以「新增 / 編輯 / 刪除」DataSource 的 UI，
// 讓四種來源都能在畫面上被管理，而不是只在程式碼裡硬寫。
//
// 設計原則：
// - 純受控元件：所有資料放在外部 state，透過 onChangeSources 回傳新的
//   sources map（不可變更新），方便頁面同時把最新 sources 餵給 resolver 做即時預覽。
// - typedData 的 value 是一棵遞迴值樹，直接複用既有的 <FieldEditor />，
//   並且用當前 sources 建出 DataStore，讓 typedData 內部也能綁定到 i18n / file / route。
// - i18n 是「基本型別的容器」：valueType 決定值型別，values 依 locale 逐一存。
//   locale 清單本身也可管理（新增 / 移除），符合真正的多語系維護情境。
// ============================================================

import React, { useMemo, useState } from 'react';
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
import {
  InMemoryDataStore,
  createDefaultValueNode,
  fieldTypeForTypedDataTypeId,
} from './schema';
import { FieldEditor } from './FieldEditor';

interface DataSourceManagerProps {
  /** 目前所有 DataSource，key 為 source id */
  sources: Record<string, DataSource>;
  /** 型別 registry（複合 id -> FieldType），供 typedData 選型別 / 綁定用 */
  types: Record<string, FieldType>;
  /** 目前管理的 locale 清單（給 i18n 逐語系編輯用） */
  locales: string[];
  /** sources 有任何變動時回傳完整新的 map */
  onChangeSources: (next: Record<string, DataSource>) => void;
  /** locale 清單變動時回傳（可選；沒有提供則隱藏 locale 管理列） */
  onChangeLocales?: (next: string[]) => void;
}

const KIND_LABELS: Record<DataSourceKind, string> = {
  i18n: 'i18n 多語系文案',
  route: '路由 Route',
  file: '檔案 File',
  typedData: '型別資料 Typed Data',
};

const KIND_ORDER: DataSourceKind[] = ['i18n', 'route', 'file', 'typedData'];

const PRIMITIVE_TYPES: PrimitiveType[] = ['string', 'number', 'boolean', 'date'];

export function DataSourceManager({
  sources,
  types,
  locales,
  onChangeSources,
  onChangeLocales,
}: DataSourceManagerProps) {
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

  const updateSource = (next: DataSource) =>
    onChangeSources({ ...sources, [next.id]: next });

  const removeSource = (id: string) => {
    const rest = { ...sources };
    delete rest[id];
    onChangeSources(rest);
  };

  const makeId = (prefix: string) => {
    let n = 1;
    let id = `${prefix}:new-${n}`;
    while (sources[id]) id = `${prefix}:new-${++n}`;
    return id;
  };

  const addI18n = () => {
    const id = makeId('i18n');
    const values: Record<string, I18nPrimitiveValue> = {};
    for (const l of locales) values[l] = '';
    const src: I18nDataSource = {
      id,
      kind: 'i18n',
      label: '新 i18n 文案',
      valueType: 'string',
      values,
    };
    updateSource(src);
  };

  const addRoute = () => {
    const id = makeId('route');
    const src: RouteDataSource = { id, kind: 'route', label: '新路由', value: '/' };
    updateSource(src);
  };

  const addFile = () => {
    const id = makeId('file');
    const src: FileDataSource = {
      id,
      kind: 'file',
      label: '新檔案',
      url: '',
      mimeType: '',
    };
    updateSource(src);
  };

  const addTypedData = () => {
    const firstTypeId = Object.keys(types)[0];
    if (!firstTypeId) return;
    const id = makeId('typedData');
    const fieldType = fieldTypeForTypedDataTypeId(firstTypeId);
    const src: TypedDataSource = {
      id,
      kind: 'typedData',
      label: '新型別資料',
      typeId: firstTypeId,
      value: createDefaultValueNode(fieldType, store),
    };
    updateSource(src);
  };

  const addHandlers: Record<DataSourceKind, () => void> = {
    i18n: addI18n,
    route: addRoute,
    file: addFile,
    typedData: addTypedData,
  };

  return (
    <div style={rootStyle}>
      {onChangeLocales && (
        <LocaleBar locales={locales} onChange={onChangeLocales} />
      )}

      {KIND_ORDER.map((kind) => (
        <section key={kind} style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h3 style={sectionTitleStyle}>
              {KIND_LABELS[kind]}
              <span style={countStyle}>{grouped[kind].length}</span>
            </h3>
            <button style={addBtnStyle} onClick={addHandlers[kind]}>
              + 新增
            </button>
          </div>

          {grouped[kind].length === 0 ? (
            <div style={emptyStyle}>尚無資料，點「＋ 新增」建立第一筆。</div>
          ) : (
            grouped[kind].map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                store={store}
                types={types}
                locales={locales}
                onChange={updateSource}
                onRemove={() => removeSource(source.id)}
              />
            ))
          )}
        </section>
      ))}
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
            ✕
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
      <button style={addBtnStyle} onClick={add}>
        + 加入 locale
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// 單筆 DataSource 卡片：依 kind 顯示不同編輯欄位
// ------------------------------------------------------------

function SourceCard({
  source,
  store,
  types,
  locales,
  onChange,
  onRemove,
}: {
  source: DataSource;
  store: InMemoryDataStore;
  types: Record<string, FieldType>;
  locales: string[];
  onChange: (next: DataSource) => void;
  onRemove: () => void;
}) {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <code style={idStyle}>{source.id}</code>
        <button style={removeBtnStyle} title="刪除這筆來源" onClick={onRemove}>
          刪除
        </button>
      </div>

      <Labeled label="label（顯示名稱）">
        <input
          value={source.label ?? ''}
          onChange={(e) => onChange({ ...source, label: e.target.value })}
          style={inputStyle}
        />
      </Labeled>

      {source.kind === 'i18n' && (
        <I18nFields source={source} locales={locales} onChange={onChange} />
      )}
      {source.kind === 'route' && (
        <RouteFields source={source} onChange={onChange} />
      )}
      {source.kind === 'file' && (
        <FileFields source={source} onChange={onChange} />
      )}
      {source.kind === 'typedData' && (
        <TypedDataFields
          source={source}
          store={store}
          types={types}
          onChange={onChange}
        />
      )}
    </div>
  );
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
  onChange,
}: {
  source: RouteDataSource;
  onChange: (next: DataSource) => void;
}) {
  return (
    <Labeled label="value（路徑）">
      <input
        value={source.value}
        placeholder="/product"
        onChange={(e) => onChange({ ...source, value: e.target.value })}
        style={inputStyle}
      />
    </Labeled>
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
    // 換型別 -> 重建一棵符合新型別的預設值樹
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
        <select
          value={source.typeId}
          onChange={(e) => setTypeId(e.target.value)}
          style={{ ...inputStyle, maxWidth: '100%' }}
        >
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
// styles（沿用 FieldEditor 的暗色開發工具風格）
// ------------------------------------------------------------

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
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
};

const sectionStyle: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: 8,
  padding: 14,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  margin: 0,
  color: '#ddd',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const countStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
  background: '#262626',
  borderRadius: 999,
  padding: '1px 8px',
};

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#777',
  fontStyle: 'italic',
  padding: '6px 2px',
};

const cardStyle: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #2c2c2c',
  borderRadius: 6,
  padding: 12,
  marginTop: 8,
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const idStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#7aa2f7',
  fontFamily: 'monospace',
  wordBreak: 'break-all',
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
};

const removeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#e74c3c',
  border: '1px solid #5a2b2b',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 12,
  cursor: 'pointer',
};
