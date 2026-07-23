import { useState } from 'react';
import type { PropDoc } from '@workspace/ui/types/generator/component-types';
import { TypePill } from '@workspace/ui/components/generator/type-pill';
import { updatePropRemote } from '@workspace/ui/lib/generator/write-back-client';
import { tableStyles as t } from '@workspace/ui/styles/generator/table-styles';
import { cn } from '@workspace/ui/utils';

interface PropsTableProps {
  props: PropDoc[];
  /** 相對於專案根目錄的 .tsx 路徑，例如 'src/components/demo/button.tsx'。傳入才會啟用編輯功能。 */
  filePath?: string;
  /** 例如 'Button'。傳入才會啟用編輯功能。 */
  componentName?: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function PropsTable({ props, filePath, componentName }: PropsTableProps) {
  const editable = Boolean(filePath && componentName);

  if (props.length === 0) {
    return <p className={t.empty}>此組件沒有解析出任何 props。</p>;
  }

  return (
    <div className={t.wrap}>
      <table className={t.table}>
        <thead>
          <tr>
            <th className={t.th}>Prop</th>
            <th className={t.th}>Type</th>
            <th className={t.th}>Default</th>
            <th className={t.th}>Description</th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop) => (
            <PropRow
              key={prop.name}
              prop={prop}
              editable={editable}
              filePath={filePath}
              componentName={componentName}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PropRow({
  prop,
  editable,
  filePath,
  componentName,
}: {
  prop: PropDoc;
  editable: boolean;
  filePath?: string;
  componentName?: string;
}) {
  const [description, setDescription] = useState(prop.description);
  const [defaultValue, setDefaultValue] = useState(prop.defaultValue ?? '');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const isDirty = description !== prop.description || defaultValue !== (prop.defaultValue ?? '');

  async function handleSave() {
    if (!filePath || !componentName) return;
    setSaveState('saving');
    setError(null);

    const result = await updatePropRemote({
      filePath,
      componentName,
      propName: prop.name,
      propType: prop.type,
      description,
      defaultValue,
    });

    if (result.ok) {
      setSaveState('saved');
      // components.json 已由 middleware 重新產生；registry.ts 是 build-time import，
      // 這裡簡單用整頁重新整理讓所有頁面（包含側邊欄、Home 卡片）都吃到最新資料。
      window.setTimeout(() => window.location.reload(), 400);
    } else {
      setSaveState('error');
      setError(result.error ?? '寫回失敗');
    }
  }

  function handleReset() {
    setDescription(prop.description);
    setDefaultValue(prop.defaultValue ?? '');
    setSaveState('idle');
    setError(null);
  }

  return (
    <tr className={t.tr}>
      <td className={t.td}>
        <div className={t.nameCell}>
          <code className={t.name}>{prop.name}</code>
          {prop.required && <span className={t.required}>required</span>}
        </div>
      </td>
      <td className={t.td}>
        <TypePill type={prop.type} />
      </td>
      <td className={t.td}>
        {editable ? (
          <input
            className={t.editInput}
            value={defaultValue}
            placeholder="—"
            onChange={(e) => {
              setDefaultValue(e.target.value);
              setSaveState('idle');
            }}
          />
        ) : prop.defaultValue !== null ? (
          <code className={t.default}>{prop.defaultValue}</code>
        ) : (
          <span className={t.dash}>—</span>
        )}
      </td>
      <td className={cn(t.td, t.description)}>
        {editable ? (
          <div className="flex max-w-[360px] flex-col gap-1.5">
            <textarea
              className={t.editTextarea}
              value={description}
              placeholder="（無說明）"
              rows={2}
              onChange={(e) => {
                setDescription(e.target.value);
                setSaveState('idle');
              }}
            />
            {isDirty && (
              <div className={t.editActions}>
                <button
                  type="button"
                  className={t.saveButton}
                  disabled={saveState === 'saving'}
                  onClick={handleSave}
                >
                  {saveState === 'saving' ? '寫入中…' : '寫回 tsx'}
                </button>
                <button type="button" className={t.cancelButton} onClick={handleReset}>
                  取消
                </button>
              </div>
            )}
            {saveState === 'saved' && <p className={t.saveHint}>✅ 已寫回，重新整理中…</p>}
            {saveState === 'error' && error && <p className={t.saveError}>⚠️ {error}</p>}
          </div>
        ) : (
          prop.description || <span className={t.dash}>—</span>
        )}
      </td>
    </tr>
  );
}
