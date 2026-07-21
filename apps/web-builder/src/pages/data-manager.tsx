import { useMemo, useState } from 'react';
import { useApp } from '@/hooks/context';
import {
  loadTypeRecords,
  loadDataManagerData,
  saveDataManagerData,
  addDataRecord,
  updateDataRecord,
  removeDataRecord,
} from '@/store/data-manager-storage';
import { writeDataRecordsToDisk as writeDataRecordsToDiskApi, readDataRecordsFromDisk } from '@/lib/data-manager-disk-api';
import { allComponentTypes } from '@workspace/ui/lib/generator/component-registry';
import type { ComponentTypeDoc, ComponentTypeFieldDoc } from '@workspace/ui/types/generator/component-types';
import {
  classifySimpleType,
  getArrayElementType,
  type DataRecordEntry,
  type FieldEditability,
} from '@/types/data-manager-types';
import { dataManagerStyles as styles } from '@/styles/data-manager-styles';
import { cn } from '@workspace/ui/utils/utils';

/**
 * `/data` — app 底下的「資料管理」子功能。
 *
 * 跟「路由管理（/routes）」同一種最簡單的管理模式：編輯即時同步進瀏覽器
 * localStorage，另外提供「寫入檔案系統」「從檔案系統讀取（覆蓋）」兩個
 * 按鈕跟 `data/{app}/records/{typeId}.json` 互動（見
 * src/lib/data-manager-disk-api.ts、scripts/write-data-plugin.mjs），僅在
 * `npm run dev` 環境有效。
 *
 * 跟路由管理不同的地方：這裡管理的「資料形狀」不是固定寫死的（RouteEntry），
 * 而是使用者從 @workspace/ui 的「組件共用型別」清單（見
 * packages/ui/data/component-types.json，由 packages/ui/scripts/generate-docs.mjs
 * 產生，不同組件可能共用同一個型別）裡選一個，針對該型別的欄位組成一份
 * 簡單 JSON 表單，對這個型別底下的資料做 CRUD。
 *
 * 流程：選型別（下拉選單）=> 編輯資料（新增 / 修改 / 刪除該型別的紀錄）。
 *
 * v1 限制：只支援「簡單物件」欄位（string / number / boolean）與
 * 「陣列<簡單物件>」（string[] / number[] / boolean[]）的編輯；欄位型別
 * 若指向巢狀 interface、ReactNode、函式等複雜型別，會標示為「不支援」，
 * 該欄位在表單中唯讀顯示，之後再完善。
 */
type WriteBackState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

function WriteBackStatus({ state }: { state: WriteBackState }) {
  if (state.status === 'idle' || state.status === 'saving') return null;
  return (
    <p
      className={cn(
        styles.errorText,
        state.status === 'success' ? 'text-green-600 dark:text-green-500' : styles.errorText
      )}
    >
      {state.message}
    </p>
  );
}

/** 把 ComponentTypeFieldDoc 轉成「這個欄位目前是否支援編輯」的判斷結果 */
function toFieldEditability(field: ComponentTypeFieldDoc): FieldEditability {
  const arrayElementType = getArrayElementType(field.type);
  const isArray = arrayElementType !== null;
  const elementKind = classifySimpleType(isArray ? arrayElementType : field.type);
  return {
    name: field.name,
    required: field.required,
    description: field.description,
    type: field.type,
    isArray,
    elementKind,
    supported: elementKind !== 'unsupported',
  };
}

/** 依欄位種類決定一個空值/預設值 */
function defaultValueForField(field: FieldEditability): unknown {
  if (!field.supported) return field.isArray ? [] : null;
  if (field.isArray) return [];
  if (field.elementKind === 'boolean') return false;
  if (field.elementKind === 'number') return 0;
  return '';
}

/** 依型別欄位清單，組出一筆全新資料的預設 value */
function buildEmptyValue(fields: FieldEditability[]): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const field of fields) {
    value[field.name] = defaultValueForField(field);
  }
  return value;
}

export function DataManager() {
  const { app } = useApp();
  const activeNs = app ?? null;

  const [selectedTypeId, setSelectedTypeId] = useState<string>(allComponentTypes[0]?.id ?? '');
  const selectedType: ComponentTypeDoc | undefined = useMemo(
    () => allComponentTypes.find((t) => t.id === selectedTypeId),
    [selectedTypeId]
  );

  const fields: FieldEditability[] = useMemo(
    () => (selectedType ? selectedType.fields.map(toFieldEditability) : []),
    [selectedType]
  );

  // 每次 render 都直接從 localStorage 讀（同分頁內沒有跨元件即時同步的需求，
  // 這個頁面是唯一的編輯入口），操作後用 `refreshKey` 觸發重新讀取。
  const [refreshKey, setRefreshKey] = useState(0);
  const records = useMemo<DataRecordEntry[]>(() => {
    if (!activeNs || !selectedTypeId) return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return loadTypeRecords(activeNs, selectedTypeId);
  }, [activeNs, selectedTypeId, refreshKey]);

  const [writeState, setWriteState] = useState<WriteBackState>({ status: 'idle' });
  const [readState, setReadState] = useState<WriteBackState>({ status: 'idle' });

  async function handleWriteToDisk() {
    if (!activeNs) return;
    const all = loadDataManagerData();
    setWriteState({ status: 'saving' });
    const result = await writeDataRecordsToDiskApi(all);
    setWriteState(
      result.ok
        ? {
            status: 'success',
            message: `✓ 已寫入 ${result.writtenFiles.join(', ') || '（無資料）'}（共 ${result.recordCount} 筆資料）`,
          }
        : { status: 'error', message: `寫入失敗：${result.error}` }
    );
  }

  async function handleReadFromDisk() {
    if (!activeNs) return;
    if (
      !window.confirm(
        `確定要用磁碟上 data/${activeNs}/records/ 底下的內容覆蓋瀏覽器中「${activeNs}」目前的資料編輯狀態嗎？此動作無法復原（會直接覆蓋，不會 merge）。`
      )
    ) {
      return;
    }
    setReadState({ status: 'saving' });
    const result = await readDataRecordsFromDisk();
    if (!result.ok) {
      setReadState({ status: 'error', message: `讀取失敗：${result.error}` });
      return;
    }
    const nsData = result.dataManagerData[activeNs] ?? {};
    const all = loadDataManagerData();
    saveDataManagerData({ ...all, [activeNs]: nsData });
    const recordCount = Object.values(nsData).reduce((sum, arr) => sum + arr.length, 0);
    setReadState({
      status: 'success',
      message: `✓ 已從磁碟讀取並覆蓋瀏覽器資料（data/${activeNs}/records/，共 ${recordCount} 筆資料）`,
    });
    setRefreshKey((k) => k + 1);
  }

  function handleAddRecord() {
    if (!activeNs || !selectedTypeId) return;
    addDataRecord(activeNs, selectedTypeId, {
      id: crypto.randomUUID(),
      value: buildEmptyValue(fields),
    });
    setRefreshKey((k) => k + 1);
  }

  function handleUpdateRecord(id: string, value: Record<string, unknown>) {
    if (!activeNs || !selectedTypeId) return;
    updateDataRecord(activeNs, selectedTypeId, id, value);
    setRefreshKey((k) => k + 1);
  }

  function handleRemoveRecord(id: string) {
    if (!activeNs || !selectedTypeId) return;
    removeDataRecord(activeNs, selectedTypeId, id);
    setRefreshKey((k) => k + 1);
  }

  if (!activeNs) {
    return (
      <div className={styles.wrap}>
        <div className={styles.empty}>請先在最上方選擇一個 app。</div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>資料管理</h1>
        <p className={styles.subtitle}>
          先選擇一個 <code>@workspace/ui</code> 組件共用的型別，再對這個型別的資料做新增 / 修改 /
          刪除。目前僅支援簡單物件與陣列&lt;簡單物件&gt;（string / number / boolean）欄位的編輯，
          其餘型別的欄位會標示為不支援。編輯即時同步進瀏覽器 <code>localStorage</code>，下方
          「寫入檔案系統」「從檔案系統讀取（覆蓋）」按鈕會跟{' '}
          <code>{`data/${activeNs}/records/{typeId}.json`}</code> 互動（僅{' '}
          <code>npm run dev</code> 環境有效）。
        </p>
      </div>

      <div className={styles.typePickerRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="data-type">
            型別
          </label>
          <select
            id="data-type"
            className={styles.select}
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
          >
            {allComponentTypes.length === 0 && <option value="">（尚無可用型別，請先跑 docs:generate）</option>}
            {allComponentTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（{t.kind}）
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selectedType ? (
        <div className={styles.empty}>尚無可選型別。請先在 packages/ui 執行 docs:generate 產生組件型別資料。</div>
      ) : (
        <>
          <div className={styles.typeMeta}>
            <p className={styles.typeMetaTitle}>
              {selectedType.name}
              <span className={styles.typeKindPill}>{selectedType.kind}</span>
              <span className={styles.arrayModePill}>可編輯為 陣列&lt;{selectedType.name}&gt;</span>
            </p>
            {selectedType.description && <p className={styles.typeMetaDesc}>{selectedType.description}</p>}
            {selectedType.aliasOf && (
              <p className={styles.typeMetaDesc}>此型別非物件形狀（{selectedType.aliasOf}），暫不支援編輯。</p>
            )}
          </div>

          {fields.length === 0 ? (
            <div className={styles.empty}>這個型別沒有可編輯的欄位（可能是 union / primitive 型別別名）。</div>
          ) : (
            <>
              <button type="button" className={styles.addRecordButton} onClick={handleAddRecord}>
                新增一筆 {selectedType.name} 資料
              </button>

              {records.length === 0 ? (
                <div className={styles.empty}>這個型別底下還沒有任何資料，點上方按鈕新增一筆。</div>
              ) : (
                records.map((record, index) => (
                  <RecordCard
                    key={record.id}
                    index={index}
                    record={record}
                    fields={fields}
                    onSave={(value) => handleUpdateRecord(record.id, value)}
                    onRemove={() => handleRemoveRecord(record.id)}
                  />
                ))
              )}
            </>
          )}
        </>
      )}

      <div className={cn(styles.typePickerRow, 'mt-5 flex-col items-stretch gap-3')}>
        <p className={cn(styles.fieldLabel, 'normal-case tracking-normal text-foreground')}>
          資料同步（{`data/${activeNs}/records/{typeId}.json`}）
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={styles.addButton}
            onClick={handleWriteToDisk}
            disabled={writeState.status === 'saving'}
          >
            {writeState.status === 'saving' ? '寫入中…' : '寫入檔案系統'}
          </button>
          <button
            type="button"
            className={styles.addButton}
            onClick={handleReadFromDisk}
            disabled={readState.status === 'saving'}
          >
            {readState.status === 'saving' ? '讀取中…' : '從檔案系統讀取（覆蓋）'}
          </button>
        </div>
        <WriteBackStatus state={writeState} />
        <WriteBackStatus state={readState} />
      </div>
    </div>
  );
}

function RecordCard({
  index,
  record,
  fields,
  onSave,
  onRemove,
}: {
  index: number;
  record: DataRecordEntry;
  fields: FieldEditability[];
  onSave: (value: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(record.value);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(record.value);

  function setFieldValue(name: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [name]: value }));
  }

  return (
    <div className={styles.recordCard}>
      <div className={styles.recordCardHeader}>
        <span className={styles.recordCardTitle}>資料 #{index + 1}</span>
        <div className={styles.actionsRow}>
          {isDirty && (
            <button type="button" className={styles.saveButton} onClick={() => onSave(draft)}>
              儲存
            </button>
          )}
          <button type="button" className={styles.removeButton} onClick={onRemove}>
            刪除
          </button>
        </div>
      </div>

      <div className={styles.fieldGrid}>
        {fields.map((field) => (
          <FieldInput key={field.name} field={field} value={draft[field.name]} onChange={(v) => setFieldValue(field.name, v)} />
        ))}
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldEditability;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (!field.supported) {
    return (
      <div className={styles.fieldWrap}>
        <label className={styles.fieldRowLabel}>
          {field.name}
          {field.required && <span className={styles.requiredMark}>*</span>}
        </label>
        <div className={styles.unsupportedNote}>
          不支援編輯的型別（{field.type}），僅顯示。之後再完善。
        </div>
      </div>
    );
  }

  if (field.isArray) {
    return (
      <ArrayFieldInput field={field} value={Array.isArray(value) ? value : []} onChange={onChange} />
    );
  }

  if (field.elementKind === 'boolean') {
    return (
      <div className={styles.fieldWrap}>
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {field.name}
          {field.required && <span className={styles.requiredMark}>*</span>}
        </label>
      </div>
    );
  }

  if (field.elementKind === 'number') {
    return (
      <div className={styles.fieldWrap}>
        <label className={styles.fieldRowLabel}>
          {field.name}
          {field.required && <span className={styles.requiredMark}>*</span>}
        </label>
        <input
          type="number"
          className={styles.input}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </div>
    );
  }

  // string
  return (
    <div className={styles.fieldWrap}>
      <label className={styles.fieldRowLabel}>
        {field.name}
        {field.required && <span className={styles.requiredMark}>*</span>}
      </label>
      <input
        type="text"
        className={styles.input}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.description && <p className={styles.hintText}>{field.description}</p>}
    </div>
  );
}

/** 陣列<簡單型別> 欄位：逐項編輯 + 新增/刪除項目，一行一個輸入框 */
function ArrayFieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldEditability;
  value: unknown[];
  onChange: (value: unknown[]) => void;
}) {
  function updateItem(i: number, itemValue: unknown) {
    const next = [...value];
    next[i] = itemValue;
    onChange(next);
  }

  function removeItem(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function addItem() {
    const empty = field.elementKind === 'boolean' ? false : field.elementKind === 'number' ? 0 : '';
    onChange([...value, empty]);
  }

  return (
    <div className={cn(styles.fieldWrap, 'sm:col-span-2')}>
      <label className={styles.fieldRowLabel}>
        {field.name}
        {field.required && <span className={styles.requiredMark}>*</span>}
        <span className="normal-case text-muted-foreground/70">（陣列&lt;{field.elementKind}&gt;）</span>
      </label>

      {value.length === 0 && <p className={styles.hintText}>目前沒有項目。</p>}

      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          {field.elementKind === 'boolean' ? (
            <input type="checkbox" checked={Boolean(item)} onChange={(e) => updateItem(i, e.target.checked)} />
          ) : field.elementKind === 'number' ? (
            <input
              type="number"
              className={styles.input}
              value={typeof item === 'number' ? item : ''}
              onChange={(e) => updateItem(i, e.target.value === '' ? '' : Number(e.target.value))}
            />
          ) : (
            <input
              type="text"
              className={styles.input}
              value={typeof item === 'string' ? item : ''}
              onChange={(e) => updateItem(i, e.target.value)}
            />
          )}
          <button type="button" className={styles.removeButton} onClick={() => removeItem(i)}>
            移除
          </button>
        </div>
      ))}

      <button type="button" className={styles.saveButton} onClick={addItem}>
        + 新增項目
      </button>
      {field.description && <p className={styles.hintText}>{field.description}</p>}
    </div>
  );
}
