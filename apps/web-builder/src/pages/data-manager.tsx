import { useMemo, useState } from 'react';
import { useApp } from '@/hooks/context';
import {
  loadDataManagerData,
  saveDataManagerData,
  loadDatasets,
  saveDataset,
  removeDataset,
  renameDataset,
  addItemToDataset,
  updateItemInDataset,
  removeItemFromDataset,
  updateSingleDataset,
} from '@/store/data-manager-storage';
import { writeDataRecordsToDisk as writeDataRecordsToDiskApi, readDataRecordsFromDisk } from '@/lib/data-manager-disk-api';
import { allComponents } from '@workspace/ui/lib/generator/component-registry';
import type { ComponentDoc } from '@workspace/ui/types/generator/component-types';
import {
  type Dataset,
  type DataRecordEntry,
  type ManagedType,
  type ParsedField,
  type RecordValue,
} from '@/types/data-manager-types';
import { getManagedTypes } from '@/lib/component-type-resolver';
import { BindingPicker } from '@/components/binding-picker';
import {
  type Binding,
  type BindingKind,
  type BindingMap,
  dataFieldKindToBindable,
  setBinding,
} from '@/types/binding-types';
import { dataManagerStyles as styles } from '@/styles/data-manager-styles';
import { cn } from '@workspace/ui/utils/utils';

const AVAILABLE_BINDING_KINDS: BindingKind[] = ['i18n', 'dataRecord'];

// ─── 預設值 ──────────────────────────────────────────────────────────────────

function defaultValueForField(field: ParsedField): RecordValue {
  if (field.kind === 'unsupported') return null;
  if (field.isArray) return [];
  if (field.kind === 'boolean') return false;
  if (field.kind === 'number') return 0;
  if (field.kind === 'string') return '';
  if (field.kind === 'object') {
    const obj: Record<string, RecordValue> = {};
    for (const child of field.children) obj[child.name] = defaultValueForField(child);
    return obj;
  }
  return null;
}

function buildEmptyValue(fields: ParsedField[]): Record<string, RecordValue> {
  const obj: Record<string, RecordValue> = {};
  for (const f of fields) obj[f.name] = defaultValueForField(f);
  return obj;
}

// ─── 驗證 ─────────────────────────────────────────────────────────────────────

/**
 * 驗證一筆 value（Record<string, RecordValue>）和對應的 bindings，
 * 回傳 fieldPath -> 錯誤訊息的 map（空表示通過）。
 * - 必填 string：value 空字串 且 沒有 i18n binding → 報錯
 * - 必填 number：value 不是合法數字（允許 0）→ 報錯
 * - 巢狀物件遞迴驗證，用 "parent.child" 表示路徑
 */
function validateFields(
  fields: ParsedField[],
  value: Record<string, RecordValue>,
  bindings: BindingMap,
  prefix = ''
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (field.kind === 'unsupported') continue;
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    const val = value[field.name];
    const bound = bindings[path]?.[0]?.refKey;

    if (field.kind === 'object') {
      if (!field.isArray) {
        const objVal = (val && typeof val === 'object' && !Array.isArray(val))
          ? (val as Record<string, RecordValue>)
          : {};
        const nested = validateFields(field.children, objVal, bindings, path);
        Object.assign(errors, nested);
      }
      // 陣列型物件不做必填驗證（陣列可為空）
      continue;
    }

    if (field.isArray) continue; // 陣列型簡單欄位也不做必填（可為空陣列）

    if (field.required) {
      if (field.kind === 'string') {
        if (!bound && (val === '' || val === null || val === undefined)) {
          errors[path] = '此欄位為必填';
        }
      } else if (field.kind === 'number') {
        const num = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
        if (val === '' || val === null || val === undefined || isNaN(num)) {
          errors[path] = '請輸入有效的數字';
        }
      }
    }
  }

  return errors;
}

// ─── WriteBack 狀態 ────────────────────────────────────────────────────────────

type WriteBackState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

function WriteBackStatus({ state }: { state: WriteBackState }) {
  if (state.status === 'idle' || state.status === 'saving') return null;
  return (
    <p className={cn(styles.errorText, state.status === 'success' && 'text-green-600 dark:text-green-500')}>
      {state.message}
    </p>
  );
}

// ─── DataManager（主頁） ──────────────────────────────────────────────────────

export function DataManager() {
  const { app } = useApp();
  const activeNs = app ?? null;

  const eligibleComponents = useMemo<ComponentDoc[]>(
    () => allComponents.filter((c) => getManagedTypes(c).length > 0),
    []
  );

  const [selectedComponentId, setSelectedComponentId] = useState<string>(
    eligibleComponents[0]?.id ?? ''
  );

  const selectedComponent = useMemo(
    () => eligibleComponents.find((c) => c.id === selectedComponentId) ?? null,
    [eligibleComponents, selectedComponentId]
  );

  const managedTypes = useMemo<ManagedType[]>(
    () => (selectedComponent ? getManagedTypes(selectedComponent) : []),
    [selectedComponent]
  );

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const [writeState, setWriteState] = useState<WriteBackState>({ status: 'idle' });
  const [readState, setReadState] = useState<WriteBackState>({ status: 'idle' });

  async function handleWriteToDisk() {
    if (!activeNs) return;
    const all = loadDataManagerData();
    setWriteState({ status: 'saving' });
    const result = await writeDataRecordsToDiskApi(all);
    setWriteState(
      result.ok
        ? { status: 'success', message: `已寫入 ${result.writtenFiles.join(', ') || '（無資料）'}（共 ${result.recordCount} 筆資料）` }
        : { status: 'error', message: `寫入失敗：${result.error}` }
    );
  }

  async function handleReadFromDisk() {
    if (!activeNs) return;
    if (!window.confirm(`確定要用磁碟上 data/${activeNs}/records/ 底下的內容覆蓋目前的資料嗎？此動作無法復原。`)) return;
    setReadState({ status: 'saving' });
    const result = await readDataRecordsFromDisk();
    if (!result.ok) {
      setReadState({ status: 'error', message: `讀取失敗：${result.error}` });
      return;
    }
    const nsData = result.dataManagerData[activeNs] ?? {};
    const all = loadDataManagerData();
    saveDataManagerData({ ...all, [activeNs]: nsData });
    const recordCount = Object.values(nsData).reduce(
      (sum, typeData) => sum + Object.values(typeData).reduce((s, ds) => s + (ds.isArrayType ? ds.items.length : 1), 0),
      0
    );
    setReadState({ status: 'success', message: `已從磁碟讀取並覆蓋瀏覽器資料（共 ${recordCount} 筆）` });
    refresh();
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
          選擇組件，管理其第一層複雜型別的資料。每個型別可以建立多份命名資料集；
          陣列型（如 <code>NavItem[]</code>）每份含多個物件，單一型（如 <code>BrandData</code>）每份是一個物件。
          編輯即時同步進瀏覽器 <code>localStorage</code>，下方「寫入檔案系統」可落地到磁碟。
        </p>
      </div>

      {/* 組件選擇器 */}
      <div className={styles.typePickerRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="component-select">組件</label>
          <select
            id="component-select"
            className={styles.select}
            value={selectedComponentId}
            onChange={(e) => setSelectedComponentId(e.target.value)}
          >
            {eligibleComponents.length === 0 && (
              <option value="">（尚無可用組件，請先跑 docs:generate）</option>
            )}
            {eligibleComponents.map((c) => (
              <option key={c.id} value={c.id}>{c.componentName}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedComponent ? (
        <div className={styles.empty}>尚無可選組件。請先在 packages/ui 執行 docs:generate 產生組件資料。</div>
      ) : managedTypes.length === 0 ? (
        <div className={styles.empty}>
          {selectedComponent.componentName} 沒有可管理的複雜型別（所有 relatedTypes 都是 Props 型別、別名或含第三方 lib 型別）。
        </div>
      ) : (
        managedTypes.map((mt) => (
          <ManagedTypeSection
            key={mt.typeId}
            app={activeNs}
            mt={mt}
            dataRecordTypeIds={managedTypes}
            availableKinds={AVAILABLE_BINDING_KINDS}
            refreshKey={refreshKey}
            onRefresh={refresh}
          />
        ))
      )}

      {/* 資料同步區 */}
      <div className={cn(styles.typePickerRow, 'mt-6 flex-col items-stretch gap-3')}>
        <p className={cn(styles.fieldLabel, 'normal-case tracking-normal text-foreground')}>
          資料同步（{`data/${activeNs}/records/`}）
        </p>
        <p className={styles.hintText}>
          編輯自動存入瀏覽器 localStorage，重新整理不會遺失。「寫入檔案系統」才會真正落地到磁碟（僅 npm run dev 環境有效）。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={styles.addButton} onClick={handleWriteToDisk} disabled={writeState.status === 'saving'}>
            {writeState.status === 'saving' ? '寫入中…' : '寫入檔案系統'}
          </button>
          <button type="button" className={styles.addButton} onClick={handleReadFromDisk} disabled={readState.status === 'saving'}>
            {readState.status === 'saving' ? '讀取中…' : '從檔案系統讀取（覆蓋）'}
          </button>
        </div>
        <WriteBackStatus state={writeState} />
        <WriteBackStatus state={readState} />
      </div>
    </div>
  );
}

// ─── ManagedTypeSection ───────────────────────────────────────────────────────

function ManagedTypeSection({
  app,
  mt,
  dataRecordTypeIds,
  availableKinds,
  refreshKey,
  onRefresh,
}: {
  app: string;
  mt: ManagedType;
  dataRecordTypeIds: ManagedType[];
  availableKinds: BindingKind[];
  refreshKey: number;
  onRefresh: () => void;
}) {
  const datasets = useMemo<Record<string, Dataset>>(
    () => loadDatasets(app, mt.typeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app, mt.typeId, refreshKey]
  );

  const [newDatasetName, setNewDatasetName] = useState('');
  const [nameError, setNameError] = useState('');

  function handleAddDataset() {
    const name = newDatasetName.trim();
    if (!name) { setNameError('請輸入資料集名稱'); return; }
    if (name in datasets) { setNameError('已有同名資料集'); return; }
    setNameError('');

    const dataset: Dataset = mt.isArrayType
      ? { isArrayType: true, name, items: [] }
      : { isArrayType: false, name, item: buildEmptyValue(mt.fields) };

    saveDataset(app, mt.typeId, name, dataset);
    setNewDatasetName('');
    onRefresh();
  }

  function handleRemoveDataset(name: string) {
    if (!window.confirm(`確定刪除資料集「${name}」嗎？此動作無法復原。`)) return;
    removeDataset(app, mt.typeId, name);
    onRefresh();
  }

  function handleRenameDataset(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return;
    if (newName in datasets) { alert('已有同名資料集，請使用其他名稱。'); return; }
    renameDataset(app, mt.typeId, oldName, newName);
    onRefresh();
  }

  const datasetList = Object.values(datasets);

  return (
    <div className={styles.typeSectionWrap}>
      <div className={styles.typeSectionHeader}>
        <span className={styles.typeSectionTitle}>{mt.typeName}</span>
        <span className={cn(styles.typeKindPill, mt.isArrayType && styles.arrayKindPill)}>
          {mt.isArrayType ? `${mt.typeName}[]` : mt.typeName}
        </span>
      </div>

      <div className={styles.addDatasetRow}>
        <input
          type="text"
          className={styles.input}
          placeholder={`資料集名稱，例如「${mt.isArrayType ? '主選單' : '品牌A'}」`}
          value={newDatasetName}
          onChange={(e) => { setNewDatasetName(e.target.value); setNameError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddDataset(); }}
        />
        <button type="button" className={styles.addRecordButton} onClick={handleAddDataset}>
          新增資料集
        </button>
      </div>
      {nameError && <p className={cn(styles.errorText, 'px-4 pb-2')}>{nameError}</p>}

      {datasetList.length === 0 ? (
        <div className={styles.emptySmall}>尚無資料集，輸入名稱後點「新增資料集」。</div>
      ) : (
        datasetList.map((ds) => (
          <DatasetCard
            key={ds.name}
            app={app}
            typeId={mt.typeId}
            mt={mt}
            dataset={ds}
            dataRecordTypeIds={dataRecordTypeIds}
            availableKinds={availableKinds}
            onRefresh={onRefresh}
            onRemove={() => handleRemoveDataset(ds.name)}
            onRename={(newName) => handleRenameDataset(ds.name, newName)}
          />
        ))
      )}
    </div>
  );
}

// ─── DatasetCard ──────────────────────────────────────────────────────────────

function DatasetCard({
  app,
  typeId,
  mt,
  dataset,
  dataRecordTypeIds,
  availableKinds,
  onRefresh,
  onRemove,
  onRename,
}: {
  app: string;
  typeId: string;
  mt: ManagedType;
  dataset: Dataset;
  dataRecordTypeIds: ManagedType[];
  availableKinds: BindingKind[];
  onRefresh: () => void;
  onRemove: () => void;
  onRename: (newName: string) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(dataset.name);
  const [open, setOpen] = useState(false);

  function commitRename() {
    onRename(renameDraft.trim());
    setIsRenaming(false);
  }

  const ToggleButton = (
    <button
      type="button"
      className={styles.removeButton}
      onClick={() => setOpen((v) => !v)}
    >
      {open ? '收合' : '展開'}
    </button>
  );

  const RenameControls = (
    <div className="flex items-center gap-2">
      {isRenaming ? (
        <>
          <input
            autoFocus
            type="text"
            className={cn(styles.input, 'w-44')}
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitRename();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
          />
          <button type="button" className={styles.saveButton} onClick={commitRename}>確認</button>
          <button type="button" className={styles.removeButton} onClick={() => setIsRenaming(false)}>取消</button>
        </>
      ) : (
        <button
          type="button"
          className={cn(styles.datasetCardTitle, 'cursor-pointer hover:underline')}
          onClick={() => { setRenameDraft(dataset.name); setIsRenaming(true); }}
          title="點擊重新命名"
        >
          {dataset.name}
        </button>
      )}
    </div>
  );

  // 陣列型 dataset
  if (dataset.isArrayType) {
    function handleAddItem() {
      addItemToDataset(app, typeId, dataset.name, {
        id: crypto.randomUUID(),
        value: buildEmptyValue(mt.fields),
        bindings: {},
      });
      onRefresh();
    }
    function handleSaveItem(id: string, value: Record<string, RecordValue>, bindings: BindingMap) {
      updateItemInDataset(app, typeId, dataset.name, id, value, bindings);
      onRefresh();
    }
    function handleRemoveItem(id: string) {
      removeItemFromDataset(app, typeId, dataset.name, id);
      onRefresh();
    }

    return (
      <div className={styles.datasetCard}>
        <div className={styles.datasetCardHeader}>
          {RenameControls}
          <div className={styles.actionsRow}>
            <button type="button" className={styles.addRecordButton} onClick={handleAddItem}>
              + 新增 {mt.typeName}
            </button>
            {ToggleButton}
            <button type="button" className={styles.removeButton} onClick={onRemove}>
              刪除資料集
            </button>
          </div>
        </div>

        {!open ? (
          <div className={styles.emptySmall}>共 {dataset.items.length} 筆，點「展開」查看與編輯。</div>
        ) : dataset.items.length === 0 ? (
          <div className={styles.emptySmall}>這個資料集還沒有任何物件，點「新增 {mt.typeName}」。</div>
        ) : (
          dataset.items.map((item, idx) => (
            <RecordCard
              key={item.id}
              index={idx}
              record={item}
              fields={mt.fields}
              app={app}
              dataRecordTypeIds={dataRecordTypeIds}
              availableKinds={availableKinds}
              onSave={(value, bindings) => handleSaveItem(item.id, value, bindings)}
              onRemove={() => handleRemoveItem(item.id)}
            />
          ))
        )}
      </div>
    );
  }

  // 單一物件型 dataset
  function handleSaveItem(value: Record<string, RecordValue>, bindings: BindingMap) {
    updateSingleDataset(app, typeId, dataset.name, value, bindings);
    onRefresh();
  }

  return (
    <div className={styles.datasetCard}>
      <div className={styles.datasetCardHeader}>
        {RenameControls}
        <div className={styles.actionsRow}>
          {ToggleButton}
          <button type="button" className={styles.removeButton} onClick={onRemove}>
            Delete
          </button>
        </div>
      </div>
      {open && (
        <SingleObjectEditor
          fields={mt.fields}
          value={dataset.item}
          bindings={dataset.bindings ?? {}}
          app={app}
          dataRecordTypeIds={dataRecordTypeIds}
          availableKinds={availableKinds}
          onSave={handleSaveItem}
        />
      )}
    </div>
  );
}

// ─── RecordCard（陣列型：一筆物件） ──────────────────────────────────────────

function RecordCard({
  index,
  record,
  fields,
  app,
  dataRecordTypeIds,
  availableKinds,
  onSave,
  onRemove,
}: {
  index: number;
  record: DataRecordEntry;
  fields: ParsedField[];
  app: string;
  dataRecordTypeIds: ManagedType[];
  availableKinds: BindingKind[];
  onSave: (value: Record<string, RecordValue>, bindings: BindingMap) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, RecordValue>>(record.value);
  const [bindings, setBindings] = useState<BindingMap>(record.bindings ?? {});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const isDirty =
    JSON.stringify(draft) !== JSON.stringify(record.value) ||
    JSON.stringify(bindings) !== JSON.stringify(record.bindings ?? {});

  function setFieldValue(name: string, value: RecordValue) {
    setDraft((prev) => ({ ...prev, [name]: value }));
    // 清除對應欄位的驗證錯誤
    if (validationErrors[name]) {
      setValidationErrors((prev) => { const next = { ...prev }; delete next[name]; return next; });
    }
  }

  function setFieldBinding(fieldPath: string, binding: Binding | null) {
    setBindings((prev) => {
      if (!binding) {
        const existing = prev[fieldPath]?.[0];
        if (!existing) return prev;
        return setBinding(prev, fieldPath, existing.kind, undefined);
      }
      return setBinding(prev, fieldPath, binding.kind, binding.refKey);
    });
    if (validationErrors[fieldPath]) {
      setValidationErrors((prev) => { const next = { ...prev }; delete next[fieldPath]; return next; });
    }
  }

  function handleSave() {
    const errors = validateFields(fields, draft, bindings);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    onSave(draft, bindings);
  }

  return (
    <div className={styles.recordCard}>
      <div className={styles.recordCardHeader}>
        <span className={styles.recordCardTitle}>#{index + 1}</span>
        <div className={styles.actionsRow}>
          {isDirty && (
            <button type="button" className={styles.saveButton} onClick={handleSave}>
              儲存
            </button>
          )}
          {Object.keys(validationErrors).length > 0 && (
            <span className={cn(styles.errorText, 'mt-0')}>請修正欄位錯誤後再儲存</span>
          )}
          <button type="button" className={styles.removeButton} onClick={onRemove}>
            刪除
          </button>
        </div>
      </div>
      <div className={styles.fieldGrid}>
        {fields.map((field) => (
          <FieldInput
            key={field.name}
            field={field}
            fieldPath={field.name}
            value={draft[field.name] ?? null}
            binding={bindings[field.name]?.[0]}
            app={app}
            dataRecordTypeIds={dataRecordTypeIds}
            availableKinds={availableKinds}
            error={validationErrors[field.name]}
            onChange={(v) => setFieldValue(field.name, v)}
            onBind={(binding) => setFieldBinding(field.name, binding)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── SingleObjectEditor ───────────────────────────────────────────────────────

function SingleObjectEditor({
  fields,
  value,
  bindings: initialBindings,
  app,
  dataRecordTypeIds,
  availableKinds,
  onSave,
}: {
  fields: ParsedField[];
  value: Record<string, RecordValue>;
  bindings: BindingMap;
  app: string;
  dataRecordTypeIds: ManagedType[];
  availableKinds: BindingKind[];
  onSave: (value: Record<string, RecordValue>, bindings: BindingMap) => void;
}) {
  const [draft, setDraft] = useState<Record<string, RecordValue>>(value);
  const [bindings, setBindings] = useState<BindingMap>(initialBindings);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const isDirty =
    JSON.stringify(draft) !== JSON.stringify(value) ||
    JSON.stringify(bindings) !== JSON.stringify(initialBindings);

  function setFieldValue(name: string, v: RecordValue) {
    setDraft((prev) => ({ ...prev, [name]: v }));
    if (validationErrors[name]) {
      setValidationErrors((prev) => { const next = { ...prev }; delete next[name]; return next; });
    }
  }

  function setFieldBinding(fieldPath: string, binding: Binding | null) {
    setBindings((prev) => {
      if (!binding) {
        const existing = prev[fieldPath]?.[0];
        if (!existing) return prev;
        return setBinding(prev, fieldPath, existing.kind, undefined);
      }
      return setBinding(prev, fieldPath, binding.kind, binding.refKey);
    });
    if (validationErrors[fieldPath]) {
      setValidationErrors((prev) => { const next = { ...prev }; delete next[fieldPath]; return next; });
    }
  }

  function handleSave() {
    const errors = validateFields(fields, draft, bindings);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    onSave(draft, bindings);
  }

  return (
    <div>
      <div className={styles.fieldGrid}>
        {fields.map((field) => (
          <FieldInput
            key={field.name}
            field={field}
            fieldPath={field.name}
            value={draft[field.name] ?? null}
            binding={bindings[field.name]?.[0]}
            app={app}
            dataRecordTypeIds={dataRecordTypeIds}
            availableKinds={availableKinds}
            error={validationErrors[field.name]}
            onChange={(v) => setFieldValue(field.name, v)}
            onBind={(binding) => setFieldBinding(field.name, binding)}
          />
        ))}
      </div>
      {Object.keys(validationErrors).length > 0 && (
        <p className={cn(styles.errorText, 'mt-2')}>請修正欄位錯誤後再儲存。</p>
      )}
      {isDirty && (
        <div className="mt-3 flex justify-end">
          <button type="button" className={styles.saveButton} onClick={handleSave}>
            儲存
          </button>
        </div>
      )}
    </div>
  );
}

// ─── FieldInput（遞迴欄位輸入器） ────────────────────────────────────────────

/**
 * 單一欄位輸入器。
 * - string 欄位右側有 🔗 按鈕可綁定 i18n key（綁定後輸入框 disabled，顯示 key 名）
 * - 必填驗證：儲存前 validateFields 跑完，錯誤訊息顯示在欄位下方
 * - 巢狀 object 遞迴渲染
 */
function FieldInput({
  field,
  fieldPath,
  value,
  binding,
  app,
  dataRecordTypeIds,
  availableKinds,
  error,
  onChange,
  onBind,
}: {
  field: ParsedField;
  fieldPath: string;
  value: RecordValue;
  binding?: Binding;
  app: string;
  dataRecordTypeIds: ManagedType[];
  availableKinds: BindingKind[];
  error?: string;
  onChange: (value: RecordValue) => void;
  onBind: (binding: Binding | null) => void;
}) {
  if (field.kind === 'unsupported') {
    return (
      <div className={styles.fieldWrap}>
        <label className={styles.fieldRowLabel}>
          {field.name}
          {field.required && <span className={styles.requiredMark}>*</span>}
        </label>
        <div className={styles.unsupportedNote}>不支援（{field.rawType}）</div>
      </div>
    );
  }

  // 巢狀物件陣列
  if (field.kind === 'object' && field.isArray) {
    const arr = Array.isArray(value) ? (value as Record<string, RecordValue>[]) : [];
    function addObjectItem() {
      if ("children" in field) {
        onChange([...arr, buildEmptyValue(field.children)]);
      }
    }
    function updateObjectItem(i: number, v: Record<string, RecordValue>) {
      onChange(arr.map((item, idx) => (idx === i ? v : item)));
    }
    function removeObjectItem(i: number) {
      onChange(arr.filter((_, idx) => idx !== i));
    }
    return (
      <div className={cn(styles.fieldWrap, 'sm:col-span-2')}>
        <label className={styles.fieldRowLabel}>
          {field.name}
          {field.required && <span className={styles.requiredMark}>*</span>}
          <span className="font-normal normal-case text-muted-foreground/70">（物件陣列）</span>
        </label>
        {arr.length === 0 && <p className={styles.hintText}>尚無項目。</p>}
        {arr.map((item, i) => (
          <div key={i} className={styles.nestedObjectRow}>
            <div className={styles.fieldGrid}>
              {field.children.map((child) => (
                <FieldInput
                  key={child.name}
                  field={child}
                  fieldPath={`${fieldPath}.${i}.${child.name}`}
                  value={(item as Record<string, RecordValue>)[child.name] ?? null}
                  app={app}
                  dataRecordTypeIds={dataRecordTypeIds}
                  availableKinds={availableKinds}
                  onChange={(v) => updateObjectItem(i, { ...(item as Record<string, RecordValue>), [child.name]: v })}
                  onBind={() => {}}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-end">
              <button type="button" className={styles.removeButton} onClick={() => removeObjectItem(i)}>
                移除
              </button>
            </div>
          </div>
        ))}
        <button type="button" className={styles.saveButton} onClick={addObjectItem}>
          + 新增物件
        </button>
      </div>
    );
  }

  // 巢狀物件（單一）
  if (field.kind === 'object' && !field.isArray) {
    const objValue = (value && typeof value === 'object' && !Array.isArray(value))
      ? (value as Record<string, RecordValue>)
      : buildEmptyValue(field.children) as Record<string, RecordValue>;

    return (
      <div className={cn(styles.fieldWrap, 'sm:col-span-2')}>
        <label className={styles.fieldRowLabel}>
          {field.name}
          {field.required && <span className={styles.requiredMark}>*</span>}
          <span className="font-normal normal-case text-muted-foreground/70">（物件）</span>
        </label>
        <div className={cn(styles.nestedObjectRow, styles.fieldGrid)}>
          {field.children.map((child) => (
            <FieldInput
              key={child.name}
              field={child}
              fieldPath={`${fieldPath}.${child.name}`}
              value={objValue[child.name] ?? null}
              binding={binding}
              app={app}
              dataRecordTypeIds={dataRecordTypeIds}
              availableKinds={availableKinds}
              error={error}
              onChange={(v) => onChange({ ...objValue, [child.name]: v })}
              onBind={(b) => onBind(b)}
            />
          ))}
        </div>
      </div>
    );
  }

  // 陣列<簡單型別>
  if (field.isArray) {
    const arr = Array.isArray(value) ? value : [];
    const kind = field.kind as 'string' | 'number' | 'boolean';
    function addItem() {
      const empty: RecordValue = kind === 'boolean' ? false : kind === 'number' ? 0 : '';
      onChange([...arr, empty]);
    }
    function updateItem(i: number, v: RecordValue) {
      onChange(arr.map((item, idx) => (idx === i ? v : item)));
    }
    function removeItem(i: number) {
      onChange(arr.filter((_, idx) => idx !== i));
    }
    return (
      <div className={cn(styles.fieldWrap, 'sm:col-span-2')}>
        <label className={styles.fieldRowLabel}>
          {field.name}
          {field.required && <span className={styles.requiredMark}>*</span>}
          <span className="font-normal normal-case text-muted-foreground/70">（{kind}[]）</span>
        </label>
        {arr.length === 0 && <p className={styles.hintText}>尚無項目。</p>}
        {arr.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            {kind === 'boolean' ? (
              <input type="checkbox" checked={Boolean(item)} onChange={(e) => updateItem(i, e.target.checked)} />
            ) : kind === 'number' ? (
              <input type="number" className={styles.input} value={typeof item === 'number' ? item : ''} onChange={(e) => updateItem(i, e.target.value === '' ? '' : Number(e.target.value))} />
            ) : (
              <input type="text" className={styles.input} value={typeof item === 'string' ? item : ''} onChange={(e) => updateItem(i, e.target.value)} />
            )}
            <button type="button" className={styles.removeButton} onClick={() => removeItem(i)}>移除</button>
          </div>
        ))}
        <button type="button" className={cn(styles.saveButton, 'mt-1')} onClick={addItem}>+ 新增</button>
        {field.description && <p className={styles.hintText}>{field.description}</p>}
      </div>
    );
  }

  // boolean
  if (field.kind === 'boolean') {
    return (
      <div className={styles.fieldWrap}>
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {field.name}
          {field.required && <span className={styles.requiredMark}>*</span>}
        </label>
        {field.description && <p className={styles.hintText}>{field.description}</p>}
      </div>
    );
  }

  // number
  if (field.kind === 'number') {
    return (
      <div className={styles.fieldWrap}>
        <label className={styles.fieldRowLabel}>
          {field.name}
          {field.required && <span className={styles.requiredMark}>*</span>}
        </label>
        <input
          type="number"
          className={cn(styles.input, error && 'border-destructive')}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
        {error && <p className={styles.errorText}>{error}</p>}
        {!error && field.description && <p className={styles.hintText}>{field.description}</p>}
      </div>
    );
  }

  // string（含 union literal）—— 支援綁定
  const isBound = Boolean(binding);
  const targetType = dataFieldKindToBindable(field.kind, field.isArray);
  return (
    <div className={styles.fieldWrap}>
      <label className={styles.fieldRowLabel}>
        {field.name}
        {field.required && <span className={styles.requiredMark}>*</span>}
        {isBound && (
          <span className="ml-1 font-normal normal-case text-[0.6rem] text-primary/80">
            {binding!.kind}: {binding!.refKey}
          </span>
        )}
      </label>
      <div className="flex items-center gap-1">
        <input
          type="text"
          className={cn(styles.input, error && 'border-destructive', isBound && 'opacity-50')}
          value={typeof value === 'string' ? value : ''}
          disabled={isBound}
          placeholder={isBound ? `綁定 ${binding!.kind}: ${binding!.refKey}` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <BindingPicker
          current={binding}
          availableKinds={availableKinds}
          targetType={targetType}
          app={app}
          dataRecordTypeIds={dataRecordTypeIds}
          onChange={(b) => onBind(b)}
        />
      </div>
      {error && !isBound && <p className={styles.errorText}>{error}</p>}
      {!error && field.description && <p className={styles.hintText}>{field.description}</p>}
    </div>
  );
}