import { useMemo } from 'react';
import type {
  DataSource,
  FieldType,
  InMemoryDataStore,
  TypedDataSource,
  ValueNode,
} from '@workspace/ui/lib/data-model/schema';
import { createDefaultValueNode, fieldTypeForTypedDataTypeId } from '@workspace/ui/lib/data-model/schema';
import { FieldEditor } from '../field-editor';
import { FilterableSelect } from '../filterable-select';
import { Labeled } from '../shared';

export function TypedDataFields({
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
