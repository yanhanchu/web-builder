import React from 'react';
import { Plus, X } from 'lucide-react';
import type {
  DataStore,
  FieldType,
  ValueNode,
  ObjectNode,
  ArrayNode,
  LiteralNode,
  BoundNode,
  BindingPolicy,
} from './schema';
import {
  getCandidateSources,
  permissiveBindingPolicy,
  createDefaultValueNode,
} from './schema';

interface FieldEditorProps {
  type: FieldType;
  node: ValueNode;
  store: DataStore;
  onChange: (next: ValueNode) => void;
  depth?: number;
  policy?: BindingPolicy;
}

// resolve type.kind === 'ref' 到實際型別，方便渲染時不用到處判斷
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
}: FieldEditorProps) {
  const resolvedType = resolveType(type, store);

  // slot（ReactNode / children / icon）不參與 DataSource 綁定，
  // 交給「插入子組件」的機制處理，這裡只顯示提示
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
  };

  const switchToLiteralOrContainer = () => {
    onChange(createDefaultValueNode(resolvedType, store));
  };

  // 候選來源清單：透過 BindingPolicy 決定這個欄位可以開放哪些綁定種類
  const candidateSources = getCandidateSources(resolvedType, store, policy);

  return (
    <div
      style={{
        borderLeft: depth > 0 ? '2px solid #333' : 'none',
        paddingLeft: depth > 0 ? 12 : 0,
        marginTop: 6,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <TypeBadge type={resolvedType} />
        <select
          value={node.mode === 'bound' ? node.sourceId : '__literal__'}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__literal__') switchToLiteralOrContainer();
            else switchToBound(v);
          }}
          style={selectStyle}
        >
          <option value="__literal__">
            {resolvedType.kind === 'object'
              ? '（純資料，展開編輯）'
              : resolvedType.kind === 'array'
              ? '（純陣列，展開編輯）'
              : '（純值輸入）'}
          </option>
          {candidateSources.map((s) => (
            <option key={s.id} value={s.id}>
              🔗 [{s.kind}] {s.label ?? s.id}
            </option>
          ))}
        </select>
      </div>

      {node.mode === 'bound' && <BoundPreview node={node} store={store} />}

      {node.mode === 'literal' &&
        resolvedType.kind !== 'object' &&
        resolvedType.kind !== 'array' && (
          <LiteralInput type={resolvedType} node={node} onChange={onChange} />
        )}

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

function BoundPreview({ node, store }: { node: BoundNode; store: DataStore }) {
  const source = store.getSource(node.sourceId);
  return (
    <div style={{ fontSize: 12, color: '#7fdbca', marginLeft: 4 }}>
      → 綁定至 <code>{node.sourceId}</code>
      {source?.kind === 'typedData' && (
        <span style={{ color: '#666' }}> （型別：{source.typeId}）</span>
      )}
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
            <div style={{ fontSize: 12, color: '#aaa', fontWeight: 600 }}>{key}</div>
            <FieldEditor
              type={fieldType}
              node={fieldNode}
              store={store}
              depth={depth + 1}
              policy={policy}
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
    // 用 store 解析 ref（例如 NavItem），確保新項目是結構完整的 object，而非空字串
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
          <div style={{ fontSize: 11, color: '#666' }}>#{idx}</div>
          <FieldEditor
            type={type.item}
            node={item}
            store={store}
            depth={depth + 1}
            policy={policy}
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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  maxWidth: 320,
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
