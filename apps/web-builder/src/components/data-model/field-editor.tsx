import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Unlink, Search, Plus, X } from 'lucide-react';
import type {
  DataStore,
  FieldType,
  ValueNode,
  ObjectNode,
  ArrayNode,
  LiteralNode,
  BoundNode,
  BindingPolicy,
  DataSource,
} from '@/lib/data-model/schema';
import {
  getCandidateSources,
  permissiveBindingPolicy,
  createDefaultValueNode,
} from '@/lib/data-model/schema';

interface FieldEditorProps {
  type: FieldType;
  node: ValueNode;
  store: DataStore;
  onChange: (next: ValueNode) => void;
  depth?: number;
  policy?: BindingPolicy;
  /**
   * 是否由 FieldEditor 自己顯示型別徽章（例如 "string" / "object"）。預設 true。
   *
   * 型別徽章一律顯示在「上一列」（獨立一行、靠右對齊），不會跟 input 擠在
   * 同一行 —— 但這一列只在沒有其他地方可以放型別字串時才需要由 FieldEditor
   * 自己生：
   *   - 最外層呼叫（例如「型別資料管理」頁面的 typed-data-fields.tsx）沒有
   *     額外的欄位名稱/索引那一行，維持預設 true，讓 FieldEditor 自己顯示。
   *   - ObjectFields / ArrayItems 遞迴呼叫子欄位時，key 名稱／#idx 那一行
   *     本身就會顯示型別（見下方兩個元件），子欄位一律傳 false 避免顯示兩次。
   *   - 呼叫端已經在別的地方（例如組件屬性面板的 prop 列表）顯示過型別字串，
   *     一樣傳 false 關掉。
   */
  showTypeBadge?: boolean;
}

// resolve type.kind === 'ref' 到實際型別
function resolveType(type: FieldType, store: DataStore): FieldType {
  if (type.kind === 'ref') {
    const real = store.getTypeDef(type.typeId);
    return real ?? type;
  }
  return type;
}

export function FieldEditor({
  type,
  node,
  store,
  onChange,
  depth = 0,
  policy = permissiveBindingPolicy,
  showTypeBadge = true,
}: FieldEditorProps) {
  const resolvedType = resolveType(type, store);
  const [pickerOpen, setPickerOpen] = useState(false);

  // slot（ReactNode / children / icon）不參與 DataSource 綁定
  if (resolvedType.kind === 'slot') {
    return (
      <div style={{ fontSize: 12, color: '#8a8a8a', fontStyle: 'italic', marginTop: 4 }}>
        （插槽 / ReactNode，由子組件配置決定，不走資料綁定）
      </div>
    );
  }

  const switchToBound = (sourceId: string) => {
    const bound: BoundNode = { mode: 'bound', sourceId };
    onChange(bound);
    setPickerOpen(false);
  };

  const switchToLiteralOrContainer = () => {
    onChange(createDefaultValueNode(resolvedType, store));
    setPickerOpen(false);
  };

  const candidateSources = getCandidateSources(resolvedType, store, policy);
  // 沒有任何候選來源可綁（例如目前「資料管理」還沒建立任何 i18n/route/file/typedData，
  // 或型別完全不相容，見 permissiveBindingPolicy.matchesSource）時，綁定完全沒有
  // 意義，圖示按鈕就不需要顯示，避免使用者點開一個永遠是空的面板。
  const canBind = candidateSources.length > 0;

  return (
    <div
      style={{
        borderLeft: depth > 0 ? '2px solid #333' : 'none',
        paddingLeft: depth > 0 ? 12 : 0,
        marginTop: 6,
      }}
    >
      {/* 型別徽章獨立成上一列，靠右對齊，不佔 input 那一行的版面 —— 下面
          那一行只留 input（或 bound chip）+ 綁定按鈕，比較不擁擠。 */}
      {showTypeBadge && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
          <TypeBadge type={resolvedType} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {node.mode === 'bound' ? (
            <BoundChip node={node} store={store} onUnbind={switchToLiteralOrContainer} />
          ) : (
            node.mode === 'literal' &&
            resolvedType.kind !== 'object' &&
            resolvedType.kind !== 'array' && (
              <LiteralInput type={resolvedType} node={node} onChange={onChange} />
            )
          )}
        </div>

        {/* 綁定不是每個欄位都會用到的操作，預設不佔版面 —— 用一顆小圖示按鈕收起來，
            點了才展開篩選用的來源選單，而不是一開始就攤開一整條下拉選單。 */}
        {canBind && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              title={node.mode === 'bound' ? '更換綁定的資料來源' : '綁定資料來源（i18n / 路由 / 檔案…）'}
              style={{
                ...linkBtnStyle,
                ...(node.mode === 'bound' ? linkBtnActiveStyle : null),
              }}
            >
              <Link2 size={12} />
            </button>
            {pickerOpen && (
              <BindingPicker
                candidates={candidateSources}
                currentSourceId={node.mode === 'bound' ? node.sourceId : null}
                onPick={switchToBound}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>
        )}
      </div>

      {node.mode === 'object' && resolvedType.kind === 'object' && (
        <ObjectFields
          type={resolvedType}
          node={node}
          store={store}
          onChange={onChange}
          depth={depth}
          policy={policy}
        />
      )}

      {node.mode === 'array' && resolvedType.kind === 'array' && (
        <ArrayItems
          type={resolvedType}
          node={node}
          store={store}
          onChange={onChange}
          depth={depth}
          policy={policy}
        />
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: FieldType }) {
  const label =
    type.kind === 'primitive'
      ? type.type
      : type.kind === 'object'
      ? 'object'
      : type.kind === 'array'
      ? 'array'
      : type.kind;
  return (
    <span
      style={{
        fontSize: 11,
        color: '#888',
        border: '1px solid #444',
        borderRadius: 4,
        padding: '1px 6px',
        fontFamily: 'monospace',
      }}
    >
      {label}
    </span>
  );
}

function BoundChip({
  node,
  store,
  onUnbind,
}: {
  node: BoundNode;
  store: DataStore;
  onUnbind: () => void;
}) {
  const source = store.getSource(node.sourceId);
  return (
    <div style={boundChipStyle}>
      <Link2 size={11} style={{ color: '#7fdbca', flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ color: '#666' }}>[{source?.kind ?? '?'}]</span>{' '}
        {source?.label ?? node.sourceId}
        {source?.kind === 'typedData' && (
          <span style={{ color: '#666' }}> （型別：{source.typeId}）</span>
        )}
      </span>
      <button type="button" onClick={onUnbind} style={unbindBtnStyle} title="解除綁定，改回純值輸入">
        <Unlink size={11} />
      </button>
    </div>
  );
}

/**
 * 綁定用的可篩選小面板：點圖示按鈕才展開，展開時可用關鍵字篩選候選來源
 * （依 kind 前綴或 label／id 比對），選擇後即關閉。清單較長時（i18n／檔案
 * 累積多了）比原本攤平的 <select> 好找很多。
 */
function BindingPicker({
  candidates,
  currentSourceId,
  onPick,
  onClose,
}: {
  candidates: DataSource[];
  currentSourceId: string | null;
  onPick: (sourceId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((s) => {
      const label = (s.label ?? s.id).toLowerCase();
      return label.includes(q) || s.kind.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
    });
  }, [candidates, query]);

  return (
    <div ref={ref} style={pickerPopoverStyle}>
      <div style={{ position: 'relative', marginBottom: 6 }}>
        <Search size={12} style={{ position: 'absolute', left: 8, top: 8, color: '#777' }} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="篩選 i18n / 路由 / 檔案 / 型別資料…"
          style={{ ...inputStyle, paddingLeft: 26, maxWidth: '100%' }}
        />
      </div>
      <div style={pickerListStyle}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 12, color: '#777', padding: '6px 4px', fontStyle: 'italic' }}>
            沒有符合「{query}」的來源
          </div>
        ) : (
          filtered.map((s) => {
            const active = s.id === currentSourceId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                style={{ ...pickerOptionStyle, ...(active ? pickerOptionActiveStyle : null) }}
                title={s.id}
              >
                <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 10 }}>[{s.kind}]</span>{' '}
                {s.label ?? s.id}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function LiteralInput({
  type,
  node,
  onChange,
}: {
  type: FieldType;
  node: LiteralNode;
  onChange: (next: ValueNode) => void;
}) {
  if (type.kind === 'primitive' && type.type === 'number') {
    return (
      <input
        type="number"
        value={Number(node.value ?? 0)}
        onChange={(e) => onChange({ mode: 'literal', value: Number(e.target.value) })}
        style={inputStyle}
      />
    );
  }
  if (type.kind === 'primitive' && type.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(node.value)}
        onChange={(e) => onChange({ mode: 'literal', value: e.target.checked })}
      />
    );
  }
  return (
    <input
      type="text"
      value={String(node.value ?? '')}
      onChange={(e) => onChange({ mode: 'literal', value: e.target.value })}
      style={inputStyle}
    />
  );
}

function ObjectFields({
  type,
  node,
  store,
  onChange,
  depth,
  policy,
}: {
  type: Extract<FieldType, { kind: 'object' }>;
  node: ObjectNode;
  store: DataStore;
  onChange: (next: ValueNode) => void;
  depth: number;
  policy: BindingPolicy;
}) {
  return (
    <div>
      {Object.keys(type.fields).map((key) => {
        const fieldType = type.fields[key];
        const fieldNode = node.fields[key] ?? createDefaultValueNode(fieldType, store);
        return (
          <div key={key} style={{ marginTop: 4 }}>
            {/* key 名稱這一列就是這個子欄位的「上一列」，型別放右側，
                下面 FieldEditor 就不需要自己再生一列型別（見 showTypeBadge={false}）。 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#aaa', fontWeight: 600 }}>{key}</span>
              <TypeBadge type={resolveType(fieldType, store)} />
            </div>
            <FieldEditor
              type={fieldType}
              node={fieldNode}
              store={store}
              depth={depth + 1}
              policy={policy}
              showTypeBadge={false}
              onChange={(nextChild) =>
                onChange({
                  ...node,
                  fields: { ...node.fields, [key]: nextChild },
                })
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function ArrayItems({
  type,
  node,
  store,
  onChange,
  depth,
  policy,
}: {
  type: Extract<FieldType, { kind: 'array' }>;
  node: ArrayNode;
  store: DataStore;
  onChange: (next: ValueNode) => void;
  depth: number;
  policy: BindingPolicy;
}) {
  const addItem = () => {
    const fresh = createDefaultValueNode(type.item, store);
    onChange({ ...node, items: [...node.items, fresh] });
  };

  const removeItem = (idx: number) => {
    onChange({ ...node, items: node.items.filter((_, i) => i !== idx) });
  };

  return (
    <div>
      {node.items.map((item, idx) => (
        <div
          key={idx}
          style={{
            border: '1px dashed #555',
            borderRadius: 6,
            padding: 8,
            marginTop: 6,
            position: 'relative',
          }}
        >
          <button onClick={() => removeItem(idx)} style={removeBtnStyle} title="刪除">
            <X size={12} />
          </button>
          {/* #idx 這一列是這個項目的「上一列」，型別放右側（跟 ObjectFields 一致），
              下面 FieldEditor 就不需要自己再生一列型別（見 showTypeBadge={false}）。
              留一點右邊距，避免跟右上角的刪除按鈕重疊。 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 6,
              paddingRight: 20,
            }}
          >
            <span style={{ fontSize: 11, color: '#666' }}>#{idx}</span>
            <TypeBadge type={resolveType(type.item, store)} />
          </div>
          <FieldEditor
            type={type.item}
            node={item}
            store={store}
            depth={depth + 1}
            policy={policy}
            showTypeBadge={false}
            onChange={(next) => {
              const items = [...node.items];
              items[idx] = next;
              onChange({ ...node, items });
            }}
          />
        </div>
      ))}
      <button onClick={addItem} style={addBtnStyle} title="新增項目">
        <Plus size={12} />
        新增項目
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#1e1e1e',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 13,
  width: '100%',
  maxWidth: 280,
};

const linkBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  flexShrink: 0,
  background: '#1e1e1e',
  color: '#888',
  border: '1px solid #444',
  borderRadius: 4,
  cursor: 'pointer',
  padding: 0,
};

const linkBtnActiveStyle: React.CSSProperties = {
  background: '#1f3b33',
  color: '#7fdbca',
  border: '1px solid #2d6a4f',
};

const boundChipStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: '#12211c',
  border: '1px solid #2d6a4f',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  color: '#cfe9e0',
  minWidth: 0,
};

const unbindBtnStyle: React.CSSProperties = {
  marginLeft: 'auto',
  flexShrink: 0,
  background: 'transparent',
  color: '#e77',
  border: 'none',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  padding: 2,
};

const pickerPopoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  zIndex: 30,
  width: 260,
  background: '#171717',
  border: '1px solid #333',
  borderRadius: 6,
  padding: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
};

const pickerListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  maxHeight: 220,
  overflowY: 'auto',
};

const pickerOptionStyle: React.CSSProperties = {
  textAlign: 'left',
  background: 'transparent',
  color: '#ccc',
  border: '1px solid transparent',
  borderRadius: 4,
  padding: '5px 8px',
  fontSize: 12,
  cursor: 'pointer',
};

const pickerOptionActiveStyle: React.CSSProperties = {
  background: '#22332c',
  color: '#7fdbca',
  border: '1px solid #2d6a4f',
};

const addBtnStyle: React.CSSProperties = {
  marginTop: 6,
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

const removeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 6,
  background: 'transparent',
  color: '#e74c3c',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  display: 'inline-flex',
  alignItems: 'center',
};